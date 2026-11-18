export type TokenType =
  | 'number'
  | 'string'
  | 'template'
  | 'identifier'
  | 'keyword'
  | 'operator'
  | 'newline'
  | 'eof';

/** A piece of a double-quoted string: literal text, or an interpolated expression. */
export type TemplatePart =
  | { kind: 'text'; value: string }
  | { kind: 'expr'; source: string; line: number; column: number };

export interface Token {
  type: TokenType;
  /** Normalised value: keyword phrase ("good boy"), operator text, identifier name, string value. */
  value: string;
  /** Exact source text, used in error messages. */
  raw: string;
  line: number;
  column: number;
  /** Offset into the source, used by the playground highlighter. */
  offset: number;
  length: number;
  parts?: TemplatePart[];
}

/** Single-word keywords. */
export const KEYWORDS = [
  'sit',
  'stay',
  'woof',
  'fetch',
  'if',
  'otherwise',
  'again',
  'no',
  'wait',
  'beg',
  'end',
  'and',
  'or',
  'not',
] as const;

/** Two-word keywords. The first word is reserved on its own. */
export const PHRASES = [
  'come here',
  'drop it',
  'leave it',
  'play dead',
  'good boy',
  'good girl',
  'bad dog',
  'empty bowl',
] as const;

/** Words that only mean something in one position and are ordinary names elsewhere. */
export const CONTEXTUAL = ['while', 'forever', 'each', 'in', 'from', 'to', 'by', 'ms', 'second', 'seconds'] as const;

export const BUILTINS = ['random', 'number'] as const;

export const KEYWORD_SET: ReadonlySet<string> = new Set(KEYWORDS);

/** first word of a phrase -> the words that may follow it */
export const PHRASE_STARTS: ReadonlyMap<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const phrase of PHRASES) {
    const [first, second] = phrase.split(' ');
    map.set(first, [...(map.get(first) ?? []), second]);
  }
  return map;
})();

export const OPERATORS = [
  '==',
  '!=',
  '<=',
  '>=',
  '+=',
  '-=',
  '*=',
  '/=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '=',
  '<',
  '>',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  ',',
  '.',
  ':',
] as const;
