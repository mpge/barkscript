import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler.js';
import { bark } from './helpers.js';

const js = (source: string) => compile(source, { filename: 'test.bark' }).code;
const body = (source: string) => js(source).split('\n').slice(3).join('\n').trim();

describe('code generation', () => {
  it('compiles the README example to readable JavaScript', () => {
    expect(
      js(bark`
        sit dog = "Walter"
        sit treats = 3

        woof "Who's a good boy?"

        fetch giveTreat()
            if treats > 0
                woof "Here you go"
                treats = treats - 1
            otherwise
                woof "No more treats"
            end
        end

        again 3
            come here giveTreat()
        end

        play dead
      `),
    ).toBe(bark`
      // Compiled from test.bark by BarkScript 0.1.0.
      "use strict";

      let dog = "Walter";
      let treats = 3;

      console.log("Who's a good boy?");

      function giveTreat() {
        if (treats > 0) {
          console.log("Here you go");
          treats = treats - 1;
        } else {
          console.log("No more treats");
        }
      }

      for (let i = 0; i < 3; i++) {
        giveTreat();
      }

      process.exit(0);
    `);
  });

  it('maps literals and operators', () => {
    expect(body('woof good boy, good girl, bad dog, empty bowl')).toBe('console.log(true, true, false, null);');
    expect(body('woof 1 == 2, 1 != 2, not good boy and bad dog or good boy')).toBe('console.log(1 === 2, 1 !== 2, !true && false || true);');
  });

  it('keeps parentheses only where precedence needs them', () => {
    expect(body('woof (1 + 2) * 3, 1 + (2 * 3), -(-1), not (good boy or bad dog)')).toBe(
      'console.log((1 + 2) * 3, 1 + 2 * 3, -(-1), !(true || false));',
    );
    expect(body('woof 10 - (4 - 3)')).toBe('console.log(10 - (4 - 3));');
  });

  it('turns interpolated strings into template literals', () => {
    // An escaped brace is literal text, so `${` must be escaped in the template literal.
    expect(body('sit n = "Walter"\nwoof "Hi {n}! `$\\{n}`"')).toBe('let n = "Walter";\nconsole.log(`Hi ${n}! \\`\\${n}\\``);');
    // A dollar sign before a real interpolation stays a dollar sign.
    expect(body('sit n = 1\nwoof "${n}"')).toBe('let n = 1;\nconsole.log(`$${n}`);');
  });

  it('compiles each loop form', () => {
    expect(body('again each x in [1, 2]\n  woof x\nend')).toBe('for (const x of [1, 2]) {\n  console.log(x);\n}');
    expect(body('again i from 1 to 3\nend')).toBe('for (let i = 1; i <= 3; i++) {\n}');
    expect(body('again i from 3 to 1\nend')).toBe('for (let i = 3; i >= 1; i--) {\n}');
    expect(body('again i from 0 to 10 by 2\nend')).toBe('for (let i = 0; i <= 10; i += 2) {\n}');
    expect(body('again i from 10 to 0 by -5\nend')).toBe('for (let i = 10; i >= 0; i -= 5) {\n}');
    expect(body('again forever\n  no\nend')).toBe('while (true) {\n  break;\n}');
    expect(body('sit n = 2\nagain n\n  leave it\nend')).toBe('let n = 2;\nfor (let i = 0, times = n; i < times; i++) {\n  continue;\n}');
  });

  it('uses concise arrows for one-line unnamed fetches', () => {
    expect(body('sit d = [1].map(fetch (x) drop it x * 2 end)')).toBe('let d = [1].map((x) => x * 2);');
    expect(body('sit f = fetch (x) drop it { v: x } end')).toBe('let f = (x) => ({ v: x });');
  });

  it('compiles new', () => {
    expect(body('stay d = new Date(2020, 1)\nstay m = new Map()')).toBe('const d = new Date(2020, 1);\nconst m = new Map();');
  });

  it('renames names that JavaScript reserves', () => {
    expect(body('sit class = 1\nwoof class')).toBe('let class_ = 1;\nconsole.log(class_);');
  });

  it('makes waiting fetches async and awaits their calls', () => {
    const code = js(bark`
      fetch nap()
        wait 2 seconds
      end
      fetch day()
        come here nap()
      end
      come here day()
    `);
    expect(code).toContain('const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));');
    expect(code).toContain('async function nap() {\n    await sleep(2000);');
    expect(code).toContain('async function day() {\n    await nap();');
    expect(code).toContain('(async () => {');
    expect(code).toContain('  await day();\n})();');
  });

  it('avoids helper names the program already uses', () => {
    const code = js('sit sleep = 1\nwait sleep');
    expect(code).toContain('const sleep2 = (ms)');
    expect(code).toContain('await sleep2(sleep);');
  });

  it('only includes helpers the program uses', () => {
    const code = js('woof 1');
    expect(code).not.toContain('function');
    expect(code).not.toContain('async');
  });

  it('produces a hosted body with no wrapper for runners', () => {
    const code = compile('sit name = beg "Name? "\nwoof name', { mode: 'hosted' }).code;
    expect(code).toContain('const ask = __host.ask;');
    expect(code).toContain('let name = await ask("Name? ");');
    expect(code).not.toContain('(async () =>');
    expect(code).not.toContain('use strict');
  });
});
