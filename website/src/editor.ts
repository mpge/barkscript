import { highlightBark } from './highlight.js';

const INDENT = '    ';
const OPENS_BLOCK = /^\s*(fetch\b|if\b|otherwise\b|again\b)|\bfetch\s*\([^)]*\)\s*$/;

export interface EditorOptions {
  value: string;
  onChange(value: string): void;
  onRun(): void;
}

/**
 * A textarea laid exactly over a highlighted <pre>. Both size to their content and share
 * one scroll container, so they never drift apart.
 */
export class Editor {
  readonly element: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly code: HTMLElement;
  private readonly gutter: HTMLElement;
  private errorLine?: number;

  constructor(private readonly options: EditorOptions) {
    this.element = document.createElement('div');
    this.element.className = 'editor';
    this.element.innerHTML = `
      <div class="editor-gutter" aria-hidden="true"></div>
      <div class="editor-surface">
        <pre class="editor-highlight" aria-hidden="true"><code></code></pre>
        <textarea class="editor-input" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="BarkScript source code"></textarea>
      </div>`;
    this.textarea = this.element.querySelector('textarea')!;
    this.code = this.element.querySelector('code')!;
    this.gutter = this.element.querySelector('.editor-gutter')!;
    this.textarea.value = options.value;
    this.textarea.addEventListener('input', () => this.changed());
    this.textarea.addEventListener('keydown', (e) => this.keydown(e));
    this.render();
  }

  get value(): string {
    return this.textarea.value;
  }

  set value(value: string) {
    this.textarea.value = value;
    this.errorLine = undefined;
    this.render();
  }

  focus(): void {
    this.textarea.focus();
  }

  markError(line?: number): void {
    this.errorLine = line;
    this.renderGutter();
  }

  private changed(): void {
    this.render();
    this.options.onChange(this.textarea.value);
  }

  private render(): void {
    // A trailing newline keeps the last empty line the same height in both layers.
    this.code.innerHTML = highlightBark(this.textarea.value) + '\n';
    this.renderGutter();
  }

  private renderGutter(): void {
    const count = this.textarea.value.split('\n').length;
    let html = '';
    for (let n = 1; n <= count; n++) html += `<span${n === this.errorLine ? ' class="is-error"' : ''}>${n}</span>`;
    this.gutter.innerHTML = html;
  }

  private replace(start: number, end: number, text: string, caret = start + text.length): void {
    this.textarea.setSelectionRange(start, end);
    // execCommand keeps the browser's undo stack intact; fall back when it isn't available.
    if (!document.execCommand?.('insertText', false, text)) {
      this.textarea.setRangeText(text, start, end, 'end');
      this.changed();
    }
    this.textarea.setSelectionRange(caret, caret);
  }

  private keydown(e: KeyboardEvent): void {
    const ta = this.textarea;
    const { selectionStart: start, selectionEnd: end, value } = ta;

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      this.options.onRun();
      return;
    }

    if (e.key === 'Tab' && !e.altKey && !e.metaKey && !e.ctrlKey) {
      // Let keyboard users leave the editor: Escape first, then Tab.
      if (this.element.dataset.escaped === 'true') return;
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      if (e.shiftKey) {
        const line = value.slice(lineStart);
        const remove = line.match(/^ {1,4}/)?.[0].length ?? 0;
        if (remove) this.replace(lineStart, lineStart + remove, '', Math.max(lineStart, start - remove));
      } else if (start === end) {
        this.replace(start, end, INDENT);
      } else {
        const block = value.slice(lineStart, end);
        const indented = block.replace(/^/gm, INDENT);
        this.replace(lineStart, end, indented);
        ta.setSelectionRange(lineStart, lineStart + indented.length);
      }
      return;
    }

    if (e.key === 'Escape') {
      this.element.dataset.escaped = 'true';
      return;
    }
    this.element.dataset.escaped = 'false';

    if (e.key === 'Enter' && !e.shiftKey && start === end) {
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const line = value.slice(lineStart, start);
      let indent = line.match(/^\s*/)![0];
      if (OPENS_BLOCK.test(line) && !/\bend\s*$/.test(line)) indent += INDENT;
      this.replace(start, end, '\n' + indent);
      return;
    }

    // Typing `end` or `otherwise` at the start of an indented line dedents it.
    if (e.key === 'd' || e.key === 'e') {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const typed = value.slice(lineStart, start) + e.key;
      const match = /^(\s+)(end|otherwise)$/.exec(typed);
      if (match && match[1].length >= INDENT.length) {
        e.preventDefault();
        const word = match[2];
        this.replace(lineStart, start, match[1].slice(INDENT.length) + word.slice(0, -1) + e.key);
      }
    }
  }
}
