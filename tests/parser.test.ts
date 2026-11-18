import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { bark } from './helpers.js';

describe('parser', () => {
  it('parses declarations, prints and calls', () => {
    const program = parse(bark`
      sit a = 1 + 2 * 3
      stay b = "x"
      woof a, b
      come here go(a)
    `);
    expect(program.body.map((s) => s.kind)).toEqual(['VariableDeclaration', 'VariableDeclaration', 'Print', 'CallStatement']);
    expect(program.body[0]).toMatchObject({ init: { kind: 'Binary', operator: '+', right: { kind: 'Binary', operator: '*' } } });
  });

  it('parses if / otherwise if / otherwise', () => {
    const [statement] = parse(bark`
      if a
        woof 1
      otherwise if b
        woof 2
      otherwise
        woof 3
      end
    `).body;
    expect(statement).toMatchObject({ kind: 'If', branches: [{}, {}], otherwise: [{ kind: 'Print' }] });
  });

  it('parses every loop form', () => {
    const kinds = parse(bark`
      again 3
      end
      again forever
      end
      again while x < 3
      end
      again each dog in dogs
      end
      again i from 10 to 0 by -2
      end
    `).body.map((s) => s.kind);
    expect(kinds).toEqual(['Repeat', 'While', 'While', 'Each', 'Range']);
  });

  it('lets lists, objects and calls span lines', () => {
    const [statement] = parse(bark`
      sit dogs = [
        { name: "Walter",
          age: 3 },
        { name: "Biscuit", age: 7 },
      ]
    `).body;
    expect(statement).toMatchObject({ init: { kind: 'Array', elements: [{ kind: 'Object' }, { kind: 'Object' }] } });
  });

  it('parses an unnamed fetch inside a call, on one line or several', () => {
    const [oneLine] = parse('sit d = list.map(fetch (x) drop it x * 2 end)').body;
    expect(oneLine).toMatchObject({ init: { kind: 'Call', args: [{ kind: 'FunctionExpression', params: [{ name: 'x' }] }] } });
    const [multi] = parse(bark`
      sit d = list.map(fetch (x)
        sit y = x * 2
        drop it y
      end)
    `).body;
    expect(multi).toMatchObject({ init: { args: [{ body: [{ kind: 'VariableDeclaration' }, { kind: 'Return' }] }] } });
  });

  it('respects precedence of not, and, or', () => {
    const [statement] = parse('woof not a and b or c').body;
    expect(statement).toMatchObject({
      args: [{ kind: 'Logical', operator: 'or', left: { kind: 'Logical', operator: 'and', left: { kind: 'Unary', operator: 'not' } } }],
    });
  });

  it('parses interpolated expressions inside strings', () => {
    const [statement] = parse('woof "a {b.c[0] + 1} d"').body;
    expect(statement).toMatchObject({ args: [{ kind: 'Template', parts: ['a ', { kind: 'Binary' }, ' d'] }] });
  });

  it('accepts come here inside expressions', () => {
    const [statement] = parse('sit n = come here fib(10)').body;
    expect(statement).toMatchObject({ init: { kind: 'Call', comeHere: true } });
  });

  it('records the last line of multi-line statements', () => {
    const [fn] = parse('fetch a()\n  woof 1\nend\n').body;
    expect(fn.loc).toMatchObject({ line: 1, endLine: 3 });
  });
});
