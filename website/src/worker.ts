/// <reference lib="webworker" />
import { inspect } from './inspect.js';

export type ToWorker = { type: 'run'; code: string } | { type: 'answer'; value: string };
export type FromWorker =
  | { type: 'out'; text: string }
  | { type: 'ask'; question: string }
  | { type: 'done'; exitCode: number; playedDead: boolean }
  | { type: 'error'; message: string; jsLine?: number };

class ExitSignal {
  constructor(readonly code: number) {}
}

const post = (message: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
let answer: ((value: string) => void) | undefined;

/** Lines added in front of the program: the AsyncFunction header plus our own prefix. */
const PREFIX = '"use strict";\n{\n';

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  if (message.type === 'answer') {
    answer?.(message.value);
    answer = undefined;
  } else if (message.type === 'run') {
    void execute(message.code);
  }
};

async function execute(code: string): Promise<void> {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<void>;
  const log = (...args: unknown[]) => post({ type: 'out', text: args.map((a) => inspect(a)).join(' ') });
  const host = {
    ask(question = '') {
      post({ type: 'ask', question: String(question) });
      return new Promise<string>((resolve) => (answer = resolve));
    },
  };
  const fakeProcess = {
    exit(code = 0): never {
      throw new ExitSignal(code);
    },
    argv: [],
    env: {},
  };
  let fn: (...a: unknown[]) => Promise<void>;
  try {
    fn = new AsyncFunction('__host', 'console', 'process', PREFIX + code + '\n}');
  } catch (error) {
    post({ type: 'error', message: String(error) });
    return;
  }
  try {
    await fn(host, { log, info: log, warn: log, error: log, debug: log }, fakeProcess);
    post({ type: 'done', exitCode: 0, playedDead: false });
  } catch (error) {
    if (error instanceof ExitSignal) {
      post({ type: 'done', exitCode: error.code, playedDead: true });
      return;
    }
    const err = error as Error;
    post({ type: 'error', message: err && err.name ? `${err.name}: ${err.message}` : String(error), jsLine: jsLine(err?.stack) });
  }
}

/** Find the program's line in a stack trace. Chrome and Firefox both report `<anonymous>:line`. */
function jsLine(stack?: string): number | undefined {
  if (!stack) return undefined;
  const match = /<anonymous>:(\d+):\d+/.exec(stack) ?? /Function:(\d+):\d+/.exec(stack);
  if (!match) return undefined;
  // AsyncFunction adds two header lines; PREFIX adds two more.
  return Number(match[1]) - 4;
}
