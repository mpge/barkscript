import { tokenize } from '../../src/lexer.js';
import { BUILTINS } from '../../src/tokens.js';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const span = (cls: string, text: string) => `<span class="t-${cls}">${escape(text)}</span>`;

const CONSTANTS = new Set(['good boy', 'good girl', 'bad dog', 'empty bowl']);
const DECLARE = new Set(['sit', 'stay', 'fetch']);
const ACTIONS = new Set(['woof', 'beg', 'come here']);
const LOGIC = new Set(['and', 'or', 'not']);
const CONTEXT = new Set(['while', 'forever', 'each', 'in', 'from', 'to', 'by', 'ms', 'second', 'seconds']);

/**
 * Highlight BarkScript with the compiler's own lexer, one line at a time.
 * Strings never span lines, so a line that fails to lex is shown plain without
 * affecting the rest of the program.
 */
export function highlightBark(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      let tokens;
      try {
        tokens = tokenize(line);
      } catch {
        const hash = line.indexOf('#');
        return hash >= 0 && !/["']/.test(line.slice(0, hash)) ? escape(line.slice(0, hash)) + span('comment', line.slice(hash)) : escape(line);
      }
      let out = '';
      let cursor = 0;
      let afterAgain = false;
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === 'eof' || token.type === 'newline') continue;
        out += escape(line.slice(cursor, token.offset));
        const text = line.slice(token.offset, token.offset + token.length);
        const next = tokens[i + 1];
        let cls: string | undefined;
        switch (token.type) {
          case 'keyword':
            cls = CONSTANTS.has(token.value) ? 'constant' : DECLARE.has(token.value) ? 'declare' : ACTIONS.has(token.value) ? 'action' : LOGIC.has(token.value) ? 'logic' : 'keyword';
            break;
          case 'number':
            cls = 'number';
            break;
          case 'string':
            cls = 'string';
            break;
          case 'template':
            out += highlightTemplate(text);
            cursor = token.offset + token.length;
            continue;
          case 'identifier':
            if (CONTEXT.has(token.value) && afterAgain) cls = 'keyword';
            else if (next?.value === '(' && next.type === 'operator') cls = (BUILTINS as readonly string[]).includes(token.value) ? 'builtin' : 'call';
            break;
          case 'operator':
            cls = /[(){}[\],.:]/.test(token.value) ? 'punct' : 'operator';
            break;
        }
        if (token.value === 'again' || token.value === 'wait') afterAgain = true;
        out += cls ? span(cls, text) : escape(text);
        cursor = token.offset + token.length;
      }
      const rest = line.slice(cursor);
      const hash = rest.indexOf('#');
      out += hash >= 0 ? escape(rest.slice(0, hash)) + span('comment', rest.slice(hash)) : escape(rest);
      return out;
    })
    .join('\n');
}

function highlightTemplate(text: string): string {
  let out = '';
  let i = 0;
  let buffer = '';
  const flush = () => {
    if (buffer) out += span('string', buffer);
    buffer = '';
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      buffer += text.slice(i, i + 2);
      i += 2;
    } else if (ch === '{') {
      flush();
      const close = text.indexOf('}', i);
      const inner = text.slice(i + 1, close < 0 ? text.length : close);
      out += span('interp', '{') + highlightBark(inner) + span('interp', '}');
      i = close < 0 ? text.length : close + 1;
    } else {
      buffer += ch;
      i++;
    }
  }
  flush();
  return out;
}

const JS_KEYWORDS = new Set([
  'let', 'const', 'function', 'return', 'if', 'else', 'for', 'while', 'of', 'break', 'continue',
  'async', 'await', 'new', 'typeof', 'in',
]);
const JS_CONSTANTS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

/** A small JavaScript highlighter, enough for the compiler's own output. */
export function highlightJs(source: string): string {
  const pattern = /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*")|(`(?:[^`\\]|\\.)*`)|\b(\d[\d_]*(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)(\s*\()?|(===|!==|<=|>=|=>|&&|\|\||\+\+|--|[+\-*/%=<>!?])|([^\s])/g;
  let out = '';
  let last = 0;
  for (const m of source.matchAll(pattern)) {
    out += escape(source.slice(last, m.index));
    last = m.index! + m[0].length;
    const [all, comment, str, tpl, num, ident, paren, op] = m;
    if (comment) out += span('comment', comment);
    else if (str) out += span('string', str);
    else if (tpl) out += highlightJsTemplate(tpl);
    else if (num) out += span('number', num);
    else if (ident) {
      const cls = JS_KEYWORDS.has(ident) ? 'declare' : JS_CONSTANTS.has(ident) ? 'constant' : paren ? 'call' : undefined;
      out += (cls ? span(cls, ident) : escape(ident)) + (paren ? escape(paren) : '');
    } else if (op) out += span('operator', op);
    else out += span('punct', all);
  }
  return out + escape(source.slice(last));
}

function highlightJsTemplate(tpl: string): string {
  return tpl
    .split(/(\$\{[^}]*\})/)
    .map((part) => (part.startsWith('${') && part.endsWith('}') ? span('interp', '${') + highlightJs(part.slice(2, -1)) + span('interp', '}') : span('string', part)))
    .join('');
}
