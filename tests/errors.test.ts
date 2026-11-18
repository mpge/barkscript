import { describe, expect, it } from 'vitest';
import { compile, diagnose } from '../src/compiler.js';
import { BarkError, BarkRuntimeError, formatError, formatRuntimeError } from '../src/errors.js';
import { run } from '../src/run.js';

/** [source, line, fragment of the message or hint] */
const cases: Array<[string, number, string]> = [
  ['fetch', 1, 'You told Walter to FETCH,\nbut never told him what to fetch.'],
  ['sit x = good boy * 2', 1, '"good boy" is not a number.'],
  ['again good boy\nend', 1, '"good boy" is not a number.'],
  ['sit x = "abc" - 1', 1, '"abc" is not a number.'],
  ['wait "soon"', 1, '"soon" is not a number.'],
  ['stay name = "Walter"\nname = "Rex"', 2, 'was told to STAY'],
  ['woof treat', 1, "Walter doesn't know `treat`."],
  ['sit treats = 1\ntreats = treat + 1', 2, 'did you mean `treats`?'],
  ['drop it 5', 1, "Walter isn't holding anything."],
  ['no', 1, 'Nothing to stop.'],
  ['leave it', 1, 'Nothing to skip.'],
  ['giveTreat()', 1, "Walter doesn't come unless you call him."],
  ['fetch go()\n  woof 1', 1, 'This fetch never ended.'],
  ['again 3\n  woof 1', 1, 'going round forever'],
  ['return 5', 1, 'In BarkScript, `return` is `drop it`.'],
  ['let x = 1', 1, 'In BarkScript, `let` is `sit`.'],
  ['sit x = true', 1, 'In BarkScript, `true` is `good boy`.'],
  ['woof x\nsit x = 1', 1, "It doesn't sit down until line 2."],
  ['fetch a(x)\nend\ncome here a(1, 2)', 3, '`a` expects 1 thing (x), but got 2.'],
  ['come here', 1, 'nobody said who to come to'],
  ['come here go', 1, 'nothing happened'],
  ['sit end = 4', 1, "can't be used as a name"],
  ['end', 1, "There's nothing here to `end`."],
  ['otherwise', 1, 'needs an `if`'],
  ['sit x = 1\nsit x = 2', 2, 'already a name here, from line 1'],
  ['sit random = 3', 1, "built-in tricks"],
  ['stay x', 1, "can't STAY on nothing"],
  ['woof 1 woof 2', 1, 'Each statement goes on its own line.'],
  ['sit a = 1 +', 1, 'This line ends too early.'],
  ['fetch go\nend', 1, 'needs parentheses'],
  ['again each dog in [1]\n  dog = 2\nend', 2, 'borrowed from the `again each` loop'],
  ['again i from 1 to 5 by 0\nend', 1, 'chase his tail'],
  ['if x\nend', 1, "Walter doesn't know `x`."],
  ['woof 1\n42', 2, "This line doesn't do anything."],
  ['sit o = { a: 1, a: 2 }', 1, 'has `a` twice'],
  ['if good boy\notherwise\notherwise\nend', 3, 'already has an `otherwise`'],
];

describe('compile errors', () => {
  it.each(cases)('%j', (source, line, fragment) => {
    const error = diagnose(source);
    expect(error).toBeInstanceOf(BarkError);
    expect(`${error!.message}\n${error!.hint ?? ''}`).toContain(fragment);
    expect(error!.loc.line).toBe(line);
  });

  it('formats errors with file, line, excerpt and caret', () => {
    const source = 'sit treats = 3\nfetch\n';
    const error = diagnose(source)!;
    expect(formatError(error, source, 'dog.bark')).toBe(
      [
        'dog.bark:2',
        '',
        '  1 | sit treats = 3',
        '  2 | fetch',
        '    | ^^^^^',
        '',
        'You told Walter to FETCH,',
        'but never told him what to fetch.',
        '',
        'hint: name the fetch, like `fetch giveTreat()`',
      ].join('\n'),
    );
  });

  it('points at the exact column inside a line', () => {
    const error = diagnose('sit total = 1\nwoof total + good boy')!;
    expect(error.loc).toMatchObject({ line: 2, column: 14, length: 8 });
  });

  it('reports errors inside string interpolation at the right column', () => {
    const error = diagnose('woof "hi {nme}"')!;
    expect(error.loc).toMatchObject({ line: 1, column: 11 });
  });

  it('allows a fetch to use names declared after it', () => {
    expect(diagnose('fetch show()\n  woof count\nend\nsit count = 1\ncome here show()')).toBeUndefined();
  });

  it('compile throws the same error diagnose returns', () => {
    expect(() => compile('fetch')).toThrow(BarkError);
  });
});

describe('runtime errors', () => {
  it('maps a runtime failure back to the .bark line', async () => {
    const source = 'sit dog = empty bowl\n\nwoof "ok"\nwoof dog.name\n';
    const error = await run(source, { io: { write: () => {} } }).catch((e) => e);
    expect(error).toBeInstanceOf(BarkRuntimeError);
    expect(error.line).toBe(4);
    const text = formatRuntimeError(error, source, 'dog.bark');
    expect(text).toContain('dog.bark:4');
    expect(text).toContain('woof dog.name');
    expect(text).toContain('TypeError');
  });
});
