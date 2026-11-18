import { describe, expect, it } from 'vitest';
import { BarkError } from '../src/errors.js';
import { tokenize } from '../src/lexer.js';

const kinds = (source: string) => tokenize(source).map((t) => `${t.type}:${t.value}`);

describe('lexer', () => {
  it('recognises single and two-word keywords', () => {
    expect(kinds('sit x = good boy')).toEqual(['keyword:sit', 'identifier:x', 'operator:=', 'keyword:good boy', 'eof:']);
    expect(kinds('come here  go()')).toEqual(['keyword:come here', 'identifier:go', 'operator:(', 'operator:)', 'eof:']);
    expect(kinds('drop it\tx')).toEqual(['keyword:drop it', 'identifier:x', 'eof:']);
  });

  it('reads the literal phrases', () => {
    expect(kinds('good girl bad dog empty bowl').slice(0, 3)).toEqual(['keyword:good girl', 'keyword:bad dog', 'keyword:empty bowl']);
  });

  it('reads numbers with underscores and decimals', () => {
    expect(kinds('1_000 3.25 7')).toEqual(['number:1000', 'number:3.25', 'number:7', 'eof:']);
  });

  it('does not treat a member access after a number as a decimal', () => {
    expect(kinds('x[0].name')).toEqual(['identifier:x', 'operator:[', 'number:0', 'operator:]', 'operator:.', 'identifier:name', 'eof:']);
  });

  it('reads strings with escapes', () => {
    const [token] = tokenize('"a\\n\\"b\\" \\{c\\}"');
    expect(token.type).toBe('string');
    expect(token.value).toBe('a\n"b" {c}');
  });

  it('splits double-quoted strings with braces into template parts', () => {
    const [token] = tokenize('"Hi {name}, you have {treats + 1}!"');
    expect(token.type).toBe('template');
    expect(token.parts).toEqual([
      { kind: 'text', value: 'Hi ' },
      { kind: 'expr', source: 'name', line: 1, column: 6 },
      { kind: 'text', value: ', you have ' },
      { kind: 'expr', source: 'treats + 1', line: 1, column: 23 },
      { kind: 'text', value: '!' },
    ]);
  });

  it('does not interpolate single-quoted strings', () => {
    const [token] = tokenize("'{not interpolated}'");
    expect(token).toMatchObject({ type: 'string', value: '{not interpolated}' });
  });

  it('skips comments and keeps newlines', () => {
    expect(kinds('woof 1 # bark\nwoof 2')).toEqual(['keyword:woof', 'number:1', 'newline:\n', 'keyword:woof', 'number:2', 'eof:']);
  });

  it('tracks lines and columns', () => {
    const tokens = tokenize('sit a = 1\n  woof a');
    const woof = tokens.find((t) => t.value === 'woof')!;
    expect([woof.line, woof.column]).toEqual([2, 3]);
  });

  it('keeps != as an operator', () => {
    expect(kinds('a != b')).toEqual(['identifier:a', 'operator:!=', 'identifier:b', 'eof:']);
  });

  it.each([
    ['woof 1 && 2', '`&&`'],
    ['woof 1 === 1', 'already strict'],
    ['sit x = 1;', 'semicolons'],
    ['come', 'waiting for the rest'],
    ['sit x = "open', 'never ends'],
    ['sit x = 5 @ 2', '`@`'],
    ['woof "{}"', 'Empty `{}`'],
    ['sit __x = 1', 'two underscores'],
  ])('rejects %j', (source, fragment) => {
    expect(() => tokenize(source)).toThrow(BarkError);
    expect(() => tokenize(source)).toThrow(fragment);
  });
});
