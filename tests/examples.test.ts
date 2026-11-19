import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compile } from '../src/compiler.js';
import { output } from './helpers.js';

const dir = join(import.meta.dirname, '..', 'examples');
const read = (name: string) => readFileSync(join(dir, name), 'utf8');

describe('examples', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hello', async () => {
    expect(await output(read('hello.bark'))).toBe('Hello, world!\n');
  });

  it('treats', async () => {
    expect(await output(read('treats.bark'))).toBe(
      "Who's a good boy?\nHere you go\nHere you go\nHere you go\nRover has 0 treats left.\nNo more treats\n",
    );
  });

  it('fizzbuzz', async () => {
    const expected = Array.from({ length: 100 }, (_, i) => {
      const n = i + 1;
      return n % 15 === 0 ? 'FizzBuzz' : n % 3 === 0 ? 'Fizz' : n % 5 === 0 ? 'Buzz' : String(n);
    });
    expect(await output(read('fizzbuzz.bark'))).toBe(expected.join('\n') + '\n');
  });

  it('fibonacci', async () => {
    expect(await output(read('fibonacci.bark'))).toBe(
      'fib(20) is 6765\nThe first 15: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377\n',
    );
  });

  it('guess', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.41); // bone = 42
    const text = await output(read('guess.bark'), ['50', 'bone?', '10', '42']);
    expect(text).toBe(
      [
        'Rover buried a bone between 1 and 100.',
        'Where do you dig? Lower. Rover paws back the other way.',
        "Where do you dig? That's not a number. Rover tilts his head.",
        'Where do you dig? Higher. Rover sniffs further along.',
        'Where do you dig? Found it in 4 tries. Good human.',
        '',
      ].join('\n'),
    );
  });

  it('walk', async () => {
    expect(await output(read('walk.bark'))).toContain('Home again. That was a good walk.');
  });

  it('kennel', async () => {
    expect(await output(read('kennel.bark'))).toBe(
      'In the kennel: Rover, Biscuit, Pickles\nAverage age: 4\nOldest: Biscuit\nPickles is on thin ice.\nBones today: 3\n',
    );
  });

  it('has a test for every example', () => {
    const tested = ['hello', 'treats', 'fizzbuzz', 'fibonacci', 'guess', 'walk', 'kennel'];
    const files = readdirSync(dir).filter((f) => f.endsWith('.bark')).map((f) => f.replace('.bark', ''));
    expect(files.sort()).toEqual(tested.sort());
  });

  it('standalone output runs under plain node, CommonJS and ESM alike', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bark-'));
    for (const ext of ['cjs', 'mjs']) {
      const file = join(tmp, `guess.${ext}`);
      writeFileSync(file, compile(read('guess.bark')).code);
      const out = execFileSync(process.execPath, [file], { input: 'abc\n', encoding: 'utf8' });
      expect(out).toContain("That's not a number.");
    }
  });
});
