import { format } from 'node:util';
import vm from 'node:vm';
import { compile } from './compiler.js';
import { BarkRuntimeError } from './errors.js';

/** Thrown by `play dead` inside a hosted program; carries the exit code out of the program. */
export class ExitSignal {
  constructor(readonly code: number) {}
}

export interface RunIO {
  /** Receives everything the program prints. */
  write(text: string): void;
  /** Answers `beg`. Defaults to reading lines from standard input. */
  ask?(question: string): Promise<string>;
}

export interface RunOptions {
  filename?: string;
  io?: RunIO;
}

export interface RunResult {
  exitCode: number;
}

/** Number of wrapper lines in front of the compiled code, used to map stack traces back. */
const WRAPPER_LINES = 3;

/** Compile and run a BarkScript program in this Node.js process. */
export async function run(source: string, options: RunOptions = {}): Promise<RunResult> {
  const filename = options.filename ?? 'main.bark';
  const io = options.io ?? { write: (text) => process.stdout.write(text) };
  const { code, lineMap } = compile(source, { filename, mode: 'hosted' });

  const virtualFile = `${filename}.js`;
  const wrapped = `(async function (__host, console, process) {\n"use strict";\n{\n${code}\n}\n})`;
  const fn = vm.runInThisContext(wrapped, { filename: virtualFile }) as (host: unknown, console: unknown, process: unknown) => Promise<void>;

  let reader: LineReader | undefined;
  const ask =
    io.ask?.bind(io) ??
    ((question: string) => {
      io.write(question);
      reader ??= new LineReader();
      return reader.next();
    });

  const log = (...args: unknown[]) => io.write(format(...args) + '\n');
  const fakeConsole = { ...console, log, info: log, warn: log, error: log, debug: log };
  const fakeProcess = {
    exit(code = 0): never {
      throw new ExitSignal(code);
    },
    argv: process.argv,
    env: process.env,
    platform: process.platform,
  };

  try {
    await fn({ ask: (question = '') => ask(String(question)) }, fakeConsole, fakeProcess);
    return { exitCode: 0 };
  } catch (error) {
    if (error instanceof ExitSignal) return { exitCode: error.code };
    throw new BarkRuntimeError(error, barkLine(error, virtualFile, lineMap));
  } finally {
    reader?.close();
  }
}

function barkLine(error: unknown, virtualFile: string, lineMap: number[]): number | undefined {
  const stack = error instanceof Error ? error.stack ?? '' : '';
  const escaped = virtualFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}:(\\d+)`).exec(stack);
  if (!match) return undefined;
  const line = lineMap[Number(match[1]) - WRAPPER_LINES - 1];
  return line || undefined;
}

/** Buffers stdin lines so several `beg`s in a row work with piped input. */
class LineReader {
  private readonly lines: string[] = [];
  private readonly waiting: Array<(line: string) => void> = [];
  private closed = false;
  private buffer = '';
  private readonly onData = (chunk: Buffer | string) => {
    this.buffer += chunk.toString();
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      this.deliver(this.buffer.slice(0, index).replace(/\r$/, ''));
      this.buffer = this.buffer.slice(index + 1);
    }
  };
  private readonly onEnd = () => {
    if (this.buffer) this.deliver(this.buffer);
    this.buffer = '';
    this.closed = true;
    while (this.waiting.length) this.waiting.shift()!('');
  };

  constructor() {
    process.stdin.on('data', this.onData);
    process.stdin.on('end', this.onEnd);
    process.stdin.resume();
  }

  private deliver(line: string): void {
    const waiter = this.waiting.shift();
    if (waiter) waiter(line);
    else this.lines.push(line);
  }

  next(): Promise<string> {
    if (this.lines.length) return Promise.resolve(this.lines.shift()!);
    if (this.closed) return Promise.resolve('');
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  close(): void {
    process.stdin.off('data', this.onData);
    process.stdin.off('end', this.onEnd);
    process.stdin.pause();
  }
}
