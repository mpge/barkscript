import { compile } from '../../src/compiler.js';
import { BarkError, DOG, formatError } from '../../src/errors.js';
import { Editor } from './editor.js';
import { EXAMPLES, type Example } from './examples.js';
import { highlightJs } from './highlight.js';
import type { FromWorker } from './worker.js';

const RUN_LIMIT_MS = 8000;

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function encodeSource(source: string): string {
  const bytes = new TextEncoder().encode(source);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSource(encoded: string): string | undefined {
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return undefined;
  }
}

/** Wires up the playground markup in index.html. */
export class Playground {
  private readonly editor: Editor;
  private readonly output: HTMLElement;
  private readonly outputLabel: HTMLElement;
  private readonly consoleEl: HTMLElement;
  private readonly runButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly tabs: HTMLElement;
  private worker?: Worker;
  private watchdog?: number;
  private lineMap: number[] = [];
  private compileTimer?: number;
  private current?: Example;

  constructor(root: HTMLElement) {
    this.output = root.querySelector('[data-js]')!;
    this.outputLabel = root.querySelector('[data-js-label]')!;
    this.consoleEl = root.querySelector('[data-console]')!;
    this.runButton = root.querySelector('[data-run]')!;
    this.status = root.querySelector('[data-status]')!;
    this.tabs = root.querySelector('[data-examples]')!;

    const shared = location.hash.startsWith('#code=') ? decodeSource(location.hash.slice(6)) : undefined;
    this.editor = new Editor({
      value: shared ?? EXAMPLES[1].source,
      onChange: () => {
        clearTimeout(this.compileTimer);
        this.compileTimer = window.setTimeout(() => this.compileNow(), 120);
        this.selectTab(undefined);
      },
      onRun: () => this.run(),
    });
    root.querySelector('[data-editor]')!.append(this.editor.element);

    for (const example of EXAMPLES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = example.title;
      button.dataset.name = example.name;
      button.setAttribute('role', 'tab');
      button.addEventListener('click', () => this.load(example));
      this.tabs.append(button);
    }
    if (!shared) this.selectTab(EXAMPLES[1]);

    this.runButton.addEventListener('click', () => (this.worker ? this.stop(`Stopped. ${DOG} sits.`) : this.run()));
    root.querySelector('[data-share]')!.addEventListener('click', (e) => this.share(e.currentTarget as HTMLButtonElement));
    this.compileNow();
  }

  private selectTab(example: Example | undefined): void {
    this.current = example;
    for (const tab of this.tabs.querySelectorAll('button')) {
      tab.setAttribute('aria-selected', String(tab.dataset.name === example?.name));
    }
  }

  load(example: Example): void {
    this.stop();
    this.editor.value = example.source;
    this.selectTab(example);
    this.compileNow();
    this.clearConsole(`${example.blurb} Press Run, or Ctrl+Enter in the editor.`);
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }

  private compileNow(): boolean {
    try {
      const { code } = compile(this.editor.value, { filename: 'playground.bark' });
      this.output.innerHTML = highlightJs(code);
      this.output.classList.remove('is-error');
      this.outputLabel.textContent = 'JavaScript';
      this.editor.markError(undefined);
      return true;
    } catch (error) {
      if (!(error instanceof BarkError)) throw error;
      this.output.innerHTML = escape(formatError(error, this.editor.value, 'playground.bark'))
        .replace(/^(\s+\|\s*)(\^+)$/m, '$1<span class="caret">$2</span>')
        .replace(/^hint:/m, '<span class="hint">hint:</span>');
      this.output.classList.add('is-error');
      this.outputLabel.textContent = 'Compile error';
      this.editor.markError(error.loc.line);
      return false;
    }
  }

  private clearConsole(note?: string): void {
    this.consoleEl.innerHTML = note ? `<p class="console-note">${escape(note)}</p>` : '';
  }

  private print(text: string, cls = ''): HTMLElement {
    const line = document.createElement('div');
    line.className = `console-line ${cls}`;
    line.textContent = text;
    this.consoleEl.append(line);
    this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
    return line;
  }

  /** Print lines one after another on first load, so the page has a single moment of motion. */
  async demo(): Promise<void> {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return this.run();
    return this.run(90);
  }

  run(stagger = 0): void {
    this.stop();
    if (!this.compileNow()) {
      this.clearConsole(`${DOG} won't run this until the compile error is fixed.`);
      return;
    }
    const { code, lineMap } = compile(this.editor.value, { filename: 'playground.bark', mode: 'hosted' });
    this.lineMap = lineMap;
    this.clearConsole();
    this.setRunning(true);

    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    let queue = Promise.resolve();
    const later = (fn: () => void) => {
      queue = queue.then(() => new Promise<void>((r) => setTimeout(() => (fn(), r()), stagger)));
    };
    const handle = (message: FromWorker) => {
      if (this.worker !== worker) return;
      switch (message.type) {
        case 'out':
          this.print(message.text);
          break;
        case 'ask':
          this.disarm();
          this.ask(message.question, (value) => {
            worker.postMessage({ type: 'answer', value });
            this.arm();
          });
          break;
        case 'treats':
          try {
            if (message.value === null) localStorage.removeItem(message.name);
            else localStorage.setItem(message.name, message.value);
          } catch {
            // Storage is off: treats last until the program ends.
          }
          break;
        case 'done':
          this.finish(message.playedDead ? `${DOG} played dead. Exit code ${message.exitCode}.` : 'Done.');
          break;
        case 'error': {
          const line = message.jsLine ? this.lineMap[message.jsLine - 1] : undefined;
          this.print(`${DOG} tripped over something${line ? ` on line ${line}` : ''}.`, 'is-error');
          this.print(message.message, 'is-error');
          if (line) this.editor.markError(line);
          this.finish('Stopped with an error.');
          break;
        }
      }
    };
    worker.onmessage = (event: MessageEvent<FromWorker>) => (stagger && event.data.type !== 'ask' ? later(() => handle(event.data)) : handle(event.data));
    worker.onerror = (event) => {
      this.print(event.message || 'The program could not start.', 'is-error');
      this.finish('Stopped with an error.');
    };
    worker.postMessage({ type: 'run', code, treats: stash() });
    this.arm();
  }

  private ask(question: string, reply: (value: string) => void): void {
    const line = this.print(question, 'console-ask');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'console-input';
    input.setAttribute('aria-label', question.trim() || 'Input for beg');
    input.autocomplete = 'off';
    line.append(input);
    input.focus({ preventScroll: true });
    this.status.textContent = `${DOG} is begging. Type an answer and press Enter.`;
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const value = input.value;
      input.replaceWith(Object.assign(document.createElement('span'), { className: 'console-answer', textContent: value }));
      this.status.textContent = 'Running...';
      reply(value);
    });
  }

  private arm(): void {
    this.disarm();
    this.watchdog = window.setTimeout(
      () => this.stop(`Stopped after ${RUN_LIMIT_MS / 1000} seconds. ${DOG} may be chasing his tail (an endless loop?).`),
      RUN_LIMIT_MS,
    );
  }

  private disarm(): void {
    clearTimeout(this.watchdog);
  }

  private stop(reason?: string): void {
    this.disarm();
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = undefined;
    for (const input of this.consoleEl.querySelectorAll('input')) input.disabled = true;
    if (reason) this.print(reason, 'is-error');
    this.setRunning(false);
    this.status.textContent = reason ?? '';
  }

  private finish(text: string): void {
    this.disarm();
    this.worker?.terminate();
    this.worker = undefined;
    this.setRunning(false);
    this.status.textContent = text;
  }

  private setRunning(running: boolean): void {
    this.runButton.textContent = running ? 'Stop' : 'Run';
    this.runButton.classList.toggle('is-running', running);
    this.status.textContent = running ? 'Running...' : this.status.textContent;
    document.documentElement.classList.toggle('is-running', running);
  }

  private async share(button: HTMLButtonElement): Promise<void> {
    const url = `${location.origin}${location.pathname}#code=${encodeSource(this.editor.value)}`;
    history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      button.textContent = 'Link copied';
    } catch {
      button.textContent = 'Link in address bar';
    }
    setTimeout(() => (button.textContent = 'Share'), 1800);
  }
}

/** Everything in this page's localStorage, so the worker can grab treats buried in earlier runs. */
function stash(): Record<string, string> {
  const items: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i)!;
      items[name] = localStorage.getItem(name)!;
    }
  } catch {
    // Storage is off.
  }
  return items;
}
