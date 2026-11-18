import { BarkError, DOG } from './errors.js';
import { KEYWORD_SET, OPERATORS, PHRASE_STARTS, type TemplatePart, type Token, type TokenType } from './tokens.js';

const IDENT_START = /[\p{L}_]/u;
const IDENT_PART = /[\p{L}\p{N}_]/u;
const DIGIT = /[0-9]/;

/** Characters people reach for out of JavaScript habit, with what to use instead. */
const FOREIGN: Record<string, { message: string; hint: string }> = {
  '===': { message: `BarkScript's \`==\` is already strict.`, hint: 'use `==`' },
  '!==': { message: `BarkScript's \`!=\` is already strict.`, hint: 'use `!=`' },
  '&&': { message: `${DOG} doesn't know \`&&\`.`, hint: 'use `and`' },
  '||': { message: `${DOG} doesn't know \`||\`.`, hint: 'use `or`' },
  '=>': { message: `Arrow functions are a JavaScript trick.`, hint: 'write `fetch (x) ... end` instead' },
  '++': { message: `${DOG} doesn't know \`++\`.`, hint: 'use `+= 1`' },
  '--': { message: `${DOG} doesn't know \`--\`.`, hint: 'use `-= 1`' },
  '!': { message: `${DOG} doesn't know \`!\`.`, hint: 'use `not`' },
  ';': { message: `No semicolons needed. ${DOG} reads one line at a time.`, hint: 'remove the `;`' },
  '`': { message: `Backtick strings are a JavaScript trick.`, hint: 'double quotes interpolate: "Hello {name}"' },
};

export interface LexOptions {
  /** Line and column of the first character, for lexing interpolated expressions in place. */
  line?: number;
  column?: number;
}

export function tokenize(source: string, options: LexOptions = {}): Token[] {
  return new Lexer(source, options.line ?? 1, options.column ?? 1).run();
}

class Lexer {
  private pos = 0;
  private readonly tokens: Token[] = [];

  constructor(
    private readonly src: string,
    private line: number,
    private column: number,
  ) {}

  run(): Token[] {
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '﻿') {
        this.advance();
      } else if (ch === '\n') {
        this.push('newline', '\n', this.pos, this.line, this.column, 1);
        this.advance();
      } else if (ch === '#') {
        while (this.pos < this.src.length && this.src[this.pos] !== '\n') this.advance();
      } else if (DIGIT.test(ch)) {
        this.number();
      } else if (ch === '"' || ch === "'") {
        this.string(ch);
      } else if (IDENT_START.test(ch)) {
        this.word();
      } else {
        this.operator();
      }
    }
    this.push('eof', '', this.pos, this.line, this.column, 0);
    return this.tokens;
  }

  private advance(): string {
    const ch = this.src[this.pos++];
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private push(type: TokenType, value: string, offset: number, line: number, column: number, length: number, raw?: string): Token {
    const token: Token = { type, value, raw: raw ?? this.src.slice(offset, offset + length), line, column, offset, length };
    this.tokens.push(token);
    return token;
  }

  private number(): void {
    const start = this.pos;
    const line = this.line;
    const column = this.column;
    const digits = () => {
      while (this.pos < this.src.length && /[0-9_]/.test(this.src[this.pos])) this.advance();
    };
    digits();
    if (this.src[this.pos] === '.' && DIGIT.test(this.src[this.pos + 1] ?? '')) {
      this.advance();
      digits();
    }
    const raw = this.src.slice(start, this.pos);
    if (raw.endsWith('_') || raw.includes('__') || raw.includes('_.') || raw.includes('._')) {
      throw new BarkError(`\`${raw}\` is not a number ${DOG} can count.`, { line, column, length: raw.length }, 'underscores can only sit between digits, like `1_000`');
    }
    if (IDENT_START.test(this.src[this.pos] ?? '')) {
      throw new BarkError(`Names can't start with a digit.`, { line, column, length: raw.length + 1 }, 'start the name with a letter');
    }
    this.push('number', raw.replace(/_/g, ''), start, line, column, raw.length);
  }

  private string(quote: string): void {
    const start = this.pos;
    const line = this.line;
    const column = this.column;
    this.advance();
    const parts: TemplatePart[] = [];
    let text = '';
    let interpolated = false;

    const unterminated = () =>
      new BarkError(
        `This string never ends.\n${DOG} is still waiting for the closing ${quote === '"' ? 'double' : 'single'} quote.`,
        { line, column, length: 1 },
        `add a closing ${quote} before the end of the line`,
      );

    for (;;) {
      if (this.pos >= this.src.length || this.src[this.pos] === '\n') throw unterminated();
      const ch = this.src[this.pos];
      if (ch === quote) {
        this.advance();
        break;
      }
      if (ch === '\\') {
        const escLine = this.line;
        const escColumn = this.column;
        this.advance();
        if (this.pos >= this.src.length) throw unterminated();
        const esc = this.advance();
        const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'", '{': '{', '}': '}', '0': '\0' };
        if (!(esc in map)) {
          throw new BarkError(`\`\\${esc}\` is not an escape ${DOG} knows.`, { line: escLine, column: escColumn, length: 2 }, 'known escapes: \\n \\t \\r \\\\ \\" \\\' \\{ \\} \\0');
        }
        text += map[esc];
        continue;
      }
      if (ch === '{' && quote === '"') {
        interpolated = true;
        if (text) parts.push({ kind: 'text', value: text });
        text = '';
        parts.push(this.interpolation());
        continue;
      }
      text += this.advance();
    }

    const length = this.pos - start;
    if (!interpolated) {
      this.push('string', text, start, line, column, length);
      return;
    }
    if (text) parts.push({ kind: 'text', value: text });
    const token = this.push('template', '', start, line, column, length);
    token.parts = parts;
  }

  /** Reads `{ expression }` inside a double-quoted string. The cursor sits on the `{`. */
  private interpolation(): TemplatePart {
    const openLine = this.line;
    const openColumn = this.column;
    this.advance();
    const line = this.line;
    const column = this.column;
    const start = this.pos;
    let depth = 0;
    let inner: string | null = null;
    for (;;) {
      if (this.pos >= this.src.length || this.src[this.pos] === '\n') {
        throw new BarkError(`This \`{\` inside the string is never closed.`, { line: openLine, column: openColumn, length: 1 }, 'close it with `}`, or write `\\{` for a literal brace');
      }
      const ch = this.src[this.pos];
      if (inner) {
        if (ch === '\\') this.advance();
        else if (ch === inner) inner = null;
        this.advance();
        continue;
      }
      if (ch === "'") inner = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        if (depth === 0) break;
        depth--;
      } else if (ch === '"') {
        throw new BarkError(`Double quotes can't go inside \`{ }\` in a string.`, { line: this.line, column: this.column, length: 1 }, "use single quotes inside the braces: \"{name + '!'}\"");
      }
      this.advance();
    }
    const source = this.src.slice(start, this.pos);
    this.advance(); // the closing }
    if (!source.trim()) {
      throw new BarkError(`Empty \`{}\` in a string. ${DOG} doesn't know what to put there.`, { line: openLine, column: openColumn, length: 2 }, 'put a name inside, like "{name}", or write \\{ for a literal brace');
    }
    return { kind: 'expr', source, line, column };
  }

  private word(): void {
    const start = this.pos;
    const line = this.line;
    const column = this.column;
    while (this.pos < this.src.length && IDENT_PART.test(this.src[this.pos])) this.advance();
    const word = this.src.slice(start, this.pos);

    const seconds = PHRASE_STARTS.get(word);
    if (seconds) {
      // Look ahead on the same line for the second word of the phrase.
      let look = this.pos;
      while (this.src[look] === ' ' || this.src[look] === '\t') look++;
      let end = look;
      while (end < this.src.length && IDENT_PART.test(this.src[end])) end++;
      const next = this.src.slice(look, end);
      if (look > this.pos && seconds.includes(next)) {
        while (this.pos < end) this.advance();
        this.push('keyword', `${word} ${next}`, start, line, column, end - start);
        return;
      }
      const options = seconds.map((s) => `\`${word} ${s}\``).join(' or ');
      throw new BarkError(
        `${DOG} heard \`${word}\` and is waiting for the rest.`,
        { line, column, length: word.length },
        `did you mean ${options}? \`${word}\` can't be used as a name on its own`,
      );
    }

    if (word.startsWith('__')) {
      throw new BarkError(`Names starting with two underscores belong to BarkScript itself.`, { line, column, length: word.length }, 'pick a name that starts with a letter');
    }

    this.push(KEYWORD_SET.has(word) ? 'keyword' : 'identifier', word, start, line, column, word.length);
  }

  private operator(): void {
    const line = this.line;
    const column = this.column;
    const start = this.pos;
    for (const foreign of Object.keys(FOREIGN).sort((a, b) => b.length - a.length)) {
      if (foreign === '!' && this.src[this.pos + 1] === '=') continue;
      if (this.src.startsWith(foreign, this.pos)) {
        const { message, hint } = FOREIGN[foreign];
        throw new BarkError(message, { line, column, length: foreign.length }, hint);
      }
    }
    for (const op of OPERATORS) {
      if (this.src.startsWith(op, this.pos)) {
        for (let i = 0; i < op.length; i++) this.advance();
        this.push('operator', op, start, line, column, op.length);
        return;
      }
    }
    const ch = this.src[this.pos];
    throw new BarkError(`${DOG} sniffed \`${ch}\` and doesn't know what it is.`, { line, column, length: 1 }, 'BarkScript understands letters, numbers, quotes and + - * / % = < > ( ) [ ] { } , . :');
  }
}
