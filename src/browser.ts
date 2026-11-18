/**
 * BarkScript in the browser.
 *
 *   <script src="https://barkscript.com/barkscript.min.js"></script>
 *   <script type="text/barkscript">
 *     woof "Hello from the page"
 *   </script>
 *
 * Every <script type="text/barkscript"> runs once the page has loaded, in document order.
 * `src="walter.bark"` loads the program from a file instead. `data-output="#selector"` also
 * prints each woof into that element. Compile and runtime errors go to the console (and to
 * the output element when there is one).
 */
import { compile } from './compiler.js';
import { BarkError, DOG, formatError } from './errors.js';
import { VERSION } from './version.js';

export { compile, VERSION };

export const SCRIPT_TYPE = 'text/barkscript';

export interface BrowserRunOptions {
  /** Name used in error messages. */
  filename?: string;
  /** Each woof is also appended to this element as a line of text. */
  output?: Element | null;
  /** Answers `beg`. Defaults to window.prompt. */
  ask?: (question: string) => string | Promise<string>;
}

class ExitSignal {
  constructor(readonly code: number) {}
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<void>;

/** Remove the indentation that HTML puts in front of inline scripts. */
export function dedent(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '').split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join('\n') + '\n';
}

function format(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function writeLine(output: Element | null | undefined, text: string, isError = false): void {
  if (!output) return;
  const line = document.createElement(isError ? 'pre' : 'div');
  line.className = isError ? 'bark-error' : 'bark-line';
  line.textContent = text;
  output.append(line);
}

/** Compile and run one program in the page. Resolves with the exit code; never throws. */
export async function run(source: string, options: BrowserRunOptions = {}): Promise<number> {
  const filename = options.filename ?? 'page.bark';
  const output = options.output;
  let code: string;
  try {
    code = compile(source, { filename, mode: 'hosted' }).code;
  } catch (error) {
    if (!(error instanceof BarkError)) throw error;
    const text = formatError(error, source, filename);
    console.error(text);
    writeLine(output, text, true);
    return 1;
  }

  const log = (...args: unknown[]) => {
    console.log(...args);
    writeLine(output, args.map(format).join(' '));
  };
  const host = {
    ask: async (question = '') => {
      const answer = options.ask ? await options.ask(String(question)) : window.prompt(String(question));
      return answer ?? '';
    },
  };
  const fakeProcess = {
    exit(code = 0): never {
      throw new ExitSignal(code);
    },
    argv: [],
    env: {},
  };
  try {
    const fn = new AsyncFunction('__host', 'console', 'process', `"use strict";\n{\n${code}\n}`);
    await fn(host, { ...console, log, info: log }, fakeProcess);
    return 0;
  } catch (error) {
    if (error instanceof ExitSignal) return error.code;
    const text = `${filename}: ${DOG} tripped over something while running this.\n${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
    console.error(text);
    writeLine(output, text, true);
    return 1;
  }
}

/** Run every BarkScript <script> tag in the document, one after another. */
export async function runScripts(root: ParentNode = document): Promise<void> {
  const scripts = Array.from(root.querySelectorAll<HTMLScriptElement>(`script[type="${SCRIPT_TYPE}"]`));
  for (const [index, script] of scripts.entries()) {
    if (script.dataset.barked) continue;
    script.dataset.barked = 'true';
    let source: string;
    let filename = script.dataset.name ?? `inline-${index + 1}.bark`;
    if (script.src) {
      filename = script.getAttribute('src')!;
      const response = await window.fetch(script.src);
      if (!response.ok) {
        console.error(`${DOG} couldn't fetch ${filename} (HTTP ${response.status}).`);
        continue;
      }
      source = await response.text();
    } else {
      source = dedent(script.textContent ?? '');
    }
    const selector = script.dataset.output;
    await run(source, { filename, output: selector ? document.querySelector(selector) : undefined });
  }
}

// Auto-run unless the loading tag opts out with data-manual.
if (typeof document !== 'undefined') {
  const current = document.currentScript as HTMLScriptElement | null;
  if (!current?.hasAttribute('data-manual')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void runScripts());
    else queueMicrotask(() => void runScripts());
  }
}
