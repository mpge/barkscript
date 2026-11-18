import { afterEach, describe, expect, it, vi } from 'vitest';
import { dedent, run } from '../src/browser.js';

describe('browser runtime', () => {
  afterEach(() => vi.restoreAllMocks());

  it('removes the indentation HTML adds to inline scripts', () => {
    expect(dedent('\n      woof 1\n      if good boy\n          woof 2\n      end\n    ')).toBe('woof 1\nif good boy\n    woof 2\nend\n');
  });

  it('runs a program and logs woofs to the console', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await run('woof "hi", 1 + 1')).toBe(0);
    expect(log).toHaveBeenCalledWith('hi', 2);
  });

  it('reports compile errors to the console without throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await run('fetch', { filename: 'page.bark' })).toBe(1);
    expect(error.mock.calls[0][0]).toContain('page.bark:1');
    expect(error.mock.calls[0][0]).toContain('You told Walter to FETCH');
  });

  it('reports runtime errors without throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await run('sit d = empty bowl\nwoof d.name')).toBe(1);
    expect(error.mock.calls[0][0]).toContain('TypeError');
  });

  it('answers beg with the ask option and stops on play dead', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await run('sit n = beg "Name? "\nwoof "hi {n}"\nplay dead\nwoof "never"', { ask: () => 'Troop' });
    expect(code).toBe(0);
    expect(log.mock.calls).toEqual([['hi Troop']]);
  });
});
