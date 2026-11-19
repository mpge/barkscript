import { describe, expect, it } from 'vitest';
import { run } from '../src/run.js';
import { bark, output } from './helpers.js';

describe('running programs', () => {
  it('prints values the way console.log does', async () => {
    expect(await output('woof "a", 1, [1, 2], { dog: "Rover" }, good boy, empty bowl')).toBe("a 1 [ 1, 2 ] { dog: 'Rover' } true null\n");
    expect(await output('woof')).toBe('\n');
  });

  it('scopes sit to blocks like let', async () => {
    const source = bark`
      sit x = "outer"
      if good boy
        sit x = "inner"
        woof x
      end
      woof x
    `;
    expect(await output(source)).toBe('inner\nouter\n');
  });

  it('hoists fetch so it can be called before it is defined', async () => {
    expect(await output('come here hi()\nfetch hi()\n  woof "hi"\nend')).toBe('hi\n');
  });

  it('supports recursion, closures and returning functions', async () => {
    const source = bark`
      fetch counter()
        sit count = 0
        drop it fetch ()
          count += 1
          drop it count
        end
      end
      stay next = counter()
      come here next()
      come here next()
      woof next()
    `;
    expect(await output(source)).toBe('3\n');
  });

  it('runs every loop form', async () => {
    const source = bark`
      sit out = []
      again 2
        come here out.push("r")
      end
      again i from 1 to 3
        come here out.push(i)
      end
      again i from 6 to 0 by -3
        come here out.push(i)
      end
      again each letter in "ab"
        come here out.push(letter)
      end
      sit n = 0
      again while n < 2
        n += 1
      end
      again forever
        n += 1
        if n == 4
          leave it
        end
        if n > 5
          no
        end
        come here out.push(n)
      end
      woof out.join(" ")
    `;
    expect(await output(source)).toBe('r r 1 2 3 6 3 0 a b 3 5\n');
  });

  it('evaluates the again count once', async () => {
    expect(await output('sit n = 3\nagain n\n  n -= 1\n  woof n\nend')).toBe('2\n1\n0\n');
  });

  it('waits, and awaits async fetches through calls', async () => {
    const source = bark`
      fetch slow(x)
        wait 5
        drop it x * 2
      end
      fetch twice(x)
        drop it slow(slow(x))
      end
      woof twice(3)
    `;
    expect(await output(source)).toBe('12\n');
  });

  it('reads input with beg', async () => {
    const source = bark`
      sit name = beg "Name? "
      sit age = number(beg "Age? ")
      woof "{name} is {age * 7} in dog years"
    `;
    expect(await output(source, ['Rover', '3'])).toBe('Name? Age? Rover is 21 in dog years\n');
  });

  it('play dead stops the program with exit code 0', async () => {
    let text = '';
    const result = await run('woof 1\nplay dead\nwoof 2', { io: { write: (t) => (text += t) } });
    expect(result.exitCode).toBe(0);
    expect(text).toBe('1\n');
  });

  it('random stays within its bounds', async () => {
    const values = (await output('again 200\n  woof random(1, 3)\nend')).trim().split('\n').map(Number);
    expect(new Set(values)).toEqual(new Set([1, 2, 3]));
  });

  it('number turns text into numbers and blank text into NaN', async () => {
    expect(await output('woof number(" 42 "), number(""), number("dog")')).toBe('42 NaN NaN\n');
  });

  it('constructs JavaScript objects with new', async () => {
    expect(await output('stay s = new Set([1, 1, 2])\nwoof s.size, new Date(0).getTime()')).toBe('2 0\n');
  });

  it('lets programs shadow console and process inside the host', async () => {
    expect(await output('sit console = 1\nwoof console')).toBe('1\n');
  });
});
