#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, diagnose } from './compiler.js';
import { BarkError, BarkRuntimeError, DOG, formatError, formatRuntimeError } from './errors.js';
import { run, type RunIO } from './run.js';
import { VERSION } from './version.js';

export interface CliIO {
  stdout(text: string): void;
  stderr(text: string): void;
  color: boolean;
  cwd: string;
  /** Overrides how programs print and read input (tests use this). */
  program?: RunIO;
}

const HELP = `BarkScript ${VERSION} · All bark. No byte.

Usage
  bark run <file.bark>              compile and run a program
  bark compile <file.bark>          write readable JavaScript next to the source
      -o, --out <file.js>           choose where the JavaScript goes
      --stdout                      print the JavaScript instead of writing a file
  bark check <file.bark>            report problems without running anything
  bark <file.bark>                  same as bark run
  bark --help                       show this help
  bark --version                    print the version

Examples
  bark run examples/hello.bark
  bark compile examples/fizzbuzz.bark -o fizzbuzz.js
  node fizzbuzz.js

Docs: https://github.com/mpge/barkscript#readme
`;

function defaultIO(): CliIO {
  const color = !process.env.NO_COLOR && process.stderr.isTTY === true;
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    color,
    cwd: process.cwd(),
  };
}

export async function main(argv: string[], io: CliIO = defaultIO()): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    io.stdout(HELP);
    return 0;
  }
  if (command === '--version' || command === '-v' || command === 'version') {
    io.stdout(`barkscript ${VERSION}\n`);
    return 0;
  }

  if (command === 'run') return runCommand(rest, io);
  if (command === 'compile') return compileCommand(rest, io);
  if (command === 'check') return checkCommand(rest, io);
  if (command.endsWith('.bark')) return runCommand([command, ...rest], io);

  io.stderr(`${DOG} doesn't know the command \`${command}\`.\nHe knows: run, compile, check. Try \`bark --help\`.\n`);
  return 2;
}

function load(file: string | undefined, io: CliIO, command: string): { path: string; name: string; source: string } | undefined {
  if (!file) {
    io.stderr(`\`bark ${command}\` needs a file, like \`bark ${command} hello.bark\`.\n`);
    return undefined;
  }
  const path = resolve(io.cwd, file);
  if (!existsSync(path)) {
    io.stderr(`${DOG} sniffed around but can't find \`${file}\`.\n`);
    return undefined;
  }
  return { path, name: relative(io.cwd, path) || basename(path), source: readFileSync(path, 'utf8') };
}

function report(error: unknown, source: string, name: string, io: CliIO): number {
  if (error instanceof BarkError) {
    io.stderr(formatError(error, source, name, { color: io.color }) + '\n');
    return 1;
  }
  if (error instanceof BarkRuntimeError) {
    io.stderr(formatRuntimeError(error, source, name, { color: io.color }) + '\n');
    return 1;
  }
  throw error;
}

async function runCommand(args: string[], io: CliIO): Promise<number> {
  const file = load(args[0], io, 'run');
  if (!file) return 1;
  try {
    const { exitCode } = await run(file.source, { filename: file.name, io: io.program });
    return exitCode;
  } catch (error) {
    return report(error, file.source, file.name, io);
  }
}

function compileCommand(args: string[], io: CliIO): number {
  let input: string | undefined;
  let out: string | undefined;
  let toStdout = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-o' || arg === '--out') {
      out = args[++i];
      if (!out) {
        io.stderr('`-o` needs a file name, like `-o hello.js`.\n');
        return 1;
      }
    } else if (arg === '--stdout') {
      toStdout = true;
    } else if (!input) {
      input = arg;
    } else {
      io.stderr(`${DOG} doesn't know what to do with \`${arg}\`.\n`);
      return 1;
    }
  }
  const file = load(input, io, 'compile');
  if (!file) return 1;
  try {
    const target = out ? resolve(io.cwd, out) : file.path.slice(0, file.path.length - extname(file.path).length) + '.js';
    const { code } = compile(file.source, { filename: basename(file.path), mode: 'script' });
    if (toStdout) {
      io.stdout(code);
    } else {
      writeFileSync(target, code);
      io.stdout(`Compiled ${file.name} to ${relative(io.cwd, target)}\n`);
    }
    return 0;
  } catch (error) {
    return report(error, file.source, file.name, io);
  }
}

function checkCommand(args: string[], io: CliIO): number {
  const file = load(args[0], io, 'check');
  if (!file) return 1;
  const error = diagnose(file.source);
  if (error) return report(error, file.source, file.name, io);
  io.stdout(`${file.name}: no problems. Good boy.\n`);
  return 0;
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`BarkScript crashed. This is a bug in the compiler, not your code.\n${error?.stack ?? error}\n`);
      process.exitCode = 70;
    },
  );
}
