import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { run as runInBrowser } from '../src/browser.js';
import { compile, diagnose } from '../src/compiler.js';
import { run } from '../src/run.js';
import { makeTreats, memoryShelf } from '../src/treats.js';
import { bark, output } from './helpers.js';

describe('treats', () => {
  afterEach(() => vi.restoreAllMocks());

  it('buries, grabs and eats values, keeping their types', async () => {
    const program = bark`
      come here treats.bury("bones", 3)
      come here treats.bury("toys", ["ball", "rope"])
      come here treats.bury("dog", { name: "Rover", goodBoy: good boy })
      woof treats.grab("bones") + 1, treats.grab("toys").length, treats.grab("dog").name
      come here treats.eat("bones")
      woof treats.grab("bones"), treats.grab("never buried")
    `;
    expect(await output(program)).toBe('4 2 Rover\nnull null\n');
  });

  it('uses the shelf it is given, and hands back text that is not JSON', async () => {
    const shelf = memoryShelf({ greeting: 'hello there' });
    let printed = '';
    const program = bark`
      woof treats.grab("greeting")
      come here treats.bury("visits", 2)
    `;
    await run(program, { shelf, io: { write: (text) => (printed += text) } });
    expect(printed).toBe('hello there\n');
    expect(shelf.getItem('visits')).toBe('2');
  });

  it('lets a program declare its own treats', async () => {
    const program = bark`
      sit treats = 3
      treats -= 1
      woof treats
    `;
    expect(await output(program)).toBe('2\n');
    expect(compile(program).code).not.toContain('localStorage');
  });

  it('hides the built-in only where the program’s own treats is in scope', async () => {
    const program = bark`
      fetch count()
          sit treats = 10
          drop it treats
      end
      come here treats.bury("count", count())
      woof treats.grab("count")
    `;
    expect(await output(program)).toBe('10\n');
  });

  it('is only emitted when the program uses it', () => {
    expect(compile('woof 1').code).not.toContain('treats');
    expect(compile('woof treats.grab("x")', { mode: 'hosted' }).code).toContain('const treats = __host.treats;');
  });

  it('compiles to standalone JavaScript that keeps treats for the run', () => {
    const { code } = compile('come here treats.bury("b", [1, 2])\nwoof treats.grab("b")[1]');
    expect(code).toContain('const treats = (() => {');
    const log = vi.fn();
    vm.runInNewContext(code, { console: { log } });
    expect(log).toHaveBeenCalledWith(2);
  });

  it('uses localStorage on a web page', async () => {
    const storage = memoryShelf();
    vi.stubGlobal('window', { localStorage: storage });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await runInBrowser('come here treats.bury("visits", 7)')).toBe(0);
    expect(storage.getItem('visits')).toBe('7');
    vi.unstubAllGlobals();
  });

  it('has the same behaviour in the library and the compiled helper', () => {
    const shelf = memoryShelf();
    const treats = makeTreats(shelf);
    treats.bury('n', 5);
    treats.bury('nothing', undefined);
    expect(treats.grab('n')).toBe(5);
    expect(treats.grab('nothing')).toBe(null);
    treats.eat('n');
    expect(shelf.getItem('n')).toBe(null);
  });

  describe('errors', () => {
    const message = (source: string) => {
      const error = diagnose(source);
      return error ? `${error.message}\nhint: ${error.hint}` : '';
    };

    it('turns localStorage habits into the BarkScript word', () => {
      const text = message('come here treats.setItem("bones", 3)');
      expect(text).toContain('`treats` only knows three tricks: `bury`, `grab` and `eat`.');
      expect(text).toContain('in BarkScript, `setItem` is `bury`: `treats.bury("bones", 3)`');
      expect(message('woof treats.getItem("bones")')).toContain('`getItem` is `grab`');
      expect(message('come here treats.removeItem("bones")')).toContain('`removeItem` is `eat`');
    });

    it('suggests the nearest trick for a typo', () => {
      expect(message('woof treats.grap("bones")')).toContain('did you mean `treats.grab`?');
    });

    it('counts arguments', () => {
      expect(message('come here treats.bury("bones")')).toContain('`treats.bury` needs a name and a value, but got 1.');
      expect(message('woof treats.grab()')).toContain('`treats.grab` needs a name, but got nothing.');
    });

    it('will not let the built-in be replaced', () => {
      expect(message('treats = 3')).toContain('`treats` is built in');
    });

    it('does not check members of a program’s own treats', () => {
      expect(diagnose('sit treats = { count: 1 }\nwoof treats.count')).toBeUndefined();
    });
  });
});
