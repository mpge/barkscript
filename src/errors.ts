/** The dog who reads your code. Every error message is addressed to him. */
export const DOG = 'Rover';

export interface SourceLocation {
  line: number;
  column: number;
  length?: number;
  /** Last line of a multi-line statement. */
  endLine?: number;
}

/**
 * A compile error with a source location.
 * `message` is the human explanation (may span lines); `hint` is an optional concrete fix.
 */
export class BarkError extends Error {
  readonly loc: SourceLocation;
  readonly hint?: string;

  constructor(message: string, loc: SourceLocation, hint?: string) {
    super(message);
    this.name = 'BarkError';
    this.loc = loc;
    this.hint = hint;
  }
}

/** A runtime failure inside a compiled program, mapped back to the .bark line that caused it. */
export class BarkRuntimeError extends Error {
  readonly line?: number;
  override readonly cause: unknown;

  constructor(cause: unknown, line?: number) {
    super(cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));
    this.name = 'BarkRuntimeError';
    this.cause = cause;
    this.line = line;
  }
}

export interface FormatOptions {
  color?: boolean;
}

const ansi = (on: boolean) => ({
  dim: (s: string) => (on ? `\x1b[2m${s}\x1b[22m` : s),
  bold: (s: string) => (on ? `\x1b[1m${s}\x1b[22m` : s),
  red: (s: string) => (on ? `\x1b[31m${s}\x1b[39m` : s),
  orange: (s: string) => (on ? `\x1b[38;5;208m${s}\x1b[39m` : s),
});

function excerpt(source: string, line: number, column: number | undefined, length: number, color: boolean): string {
  const c = ansi(color);
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  const from = Math.max(1, line - 1);
  const width = String(line).length;
  for (let n = from; n <= line && n <= lines.length; n++) {
    const text = lines[n - 1].replace(/\t/g, '  ');
    out.push(`${c.dim(`  ${String(n).padStart(width)} |`)} ${text}`);
  }
  if (column !== undefined && line <= lines.length) {
    const before = lines[line - 1].slice(0, column - 1).replace(/\t/g, '  ');
    out.push(`${c.dim(`  ${' '.repeat(width)} |`)} ${' '.repeat(before.length)}${c.red('^'.repeat(Math.max(1, length)))}`);
  }
  return out.join('\n');
}

/** Render a compile error the way the CLI and playground show it. */
export function formatError(error: BarkError, source: string, filename = 'main.bark', options: FormatOptions = {}): string {
  const color = options.color ?? false;
  const c = ansi(color);
  const parts = [
    c.bold(`${filename}:${error.loc.line}`),
    '',
    excerpt(source, error.loc.line, error.loc.column, error.loc.length ?? 1, color),
    '',
    c.bold(error.message),
  ];
  if (error.hint) parts.push('', `${c.orange('hint:')} ${error.hint}`);
  return parts.join('\n');
}

/** Render a runtime error, pointing at the .bark line when it could be recovered. */
export function formatRuntimeError(error: BarkRuntimeError, source: string, filename = 'main.bark', options: FormatOptions = {}): string {
  const color = options.color ?? false;
  const c = ansi(color);
  const parts: string[] = [];
  if (error.line) {
    parts.push(c.bold(`${filename}:${error.line}`), '', excerpt(source, error.line, undefined, 1, color), '');
  } else {
    parts.push(c.bold(filename), '');
  }
  parts.push(c.bold(`${DOG} tripped over something while running this.`), '', c.red(error.message));
  return parts.join('\n');
}

/** Levenshtein distance, for "did you mean" suggestions. */
export function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = temp;
    }
  }
  return prev[b.length];
}

export function closest(name: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const score = distance(name.toLowerCase(), candidate.toLowerCase());
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  const limit = Math.max(1, Math.floor(name.length / 3));
  return bestScore <= limit ? best : undefined;
}
