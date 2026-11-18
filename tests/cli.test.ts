import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main, type CliIO } from '../src/cli.js';
import { VERSION } from '../src/version.js';

function harness(files: Record<string, string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'bark-cli-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(cwd, name), content);
  const result = { stdout: '', stderr: '', program: '' };
  const io: CliIO = {
    cwd,
    color: false,
    stdout: (t) => (result.stdout += t),
    stderr: (t) => (result.stderr += t),
    program: { write: (t) => (result.program += t), ask: async () => '' },
  };
  return { cwd, io, result };
}

describe('cli', () => {
  it('prints help with no arguments and with --help', async () => {
    for (const args of [[], ['--help'], ['-h']]) {
      const { io, result } = harness();
      expect(await main(args, io)).toBe(0);
      expect(result.stdout).toContain('bark run <file.bark>');
      expect(result.stdout).toContain('All bark. No byte.');
    }
  });

  it('prints the version, which matches package.json', async () => {
    const { io, result } = harness();
    expect(await main(['--version'], io)).toBe(0);
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'));
    expect(result.stdout).toBe(`barkscript ${pkg.version}\n`);
    expect(VERSION).toBe(pkg.version);
  });

  it('runs a program', async () => {
    const { io, result } = harness({ 'hi.bark': 'woof "hi"' });
    expect(await main(['run', 'hi.bark'], io)).toBe(0);
    expect(result.program).toBe('hi\n');
  });

  it('runs a .bark file without the run command', async () => {
    const { io, result } = harness({ 'hi.bark': 'woof "hi"' });
    expect(await main(['hi.bark'], io)).toBe(0);
    expect(result.program).toBe('hi\n');
  });

  it('compiles next to the source by default', async () => {
    const { io, result, cwd } = harness({ 'hi.bark': 'woof "hi"' });
    expect(await main(['compile', 'hi.bark'], io)).toBe(0);
    expect(result.stdout).toBe('Compiled hi.bark to hi.js\n');
    expect(readFileSync(join(cwd, 'hi.js'), 'utf8')).toContain('console.log("hi");');
  });

  it('compiles to a chosen path or to stdout', async () => {
    const { io, result, cwd } = harness({ 'hi.bark': 'woof "hi"' });
    expect(await main(['compile', 'hi.bark', '-o', 'out.js'], io)).toBe(0);
    expect(existsSync(join(cwd, 'out.js'))).toBe(true);
    expect(await main(['compile', 'hi.bark', '--stdout'], io)).toBe(0);
    expect(result.stdout).toContain('console.log("hi");');
  });

  it('reports compile errors with location and exits 1', async () => {
    const { io, result, cwd } = harness({ 'dog.bark': 'sit treats = 3\nfetch\n' });
    expect(await main(['compile', 'dog.bark'], io)).toBe(1);
    expect(result.stderr).toContain('dog.bark:2');
    expect(result.stderr).toContain('You told Walter to FETCH,');
    expect(existsSync(join(cwd, 'dog.js'))).toBe(false);
  });

  it('reports runtime errors and exits 1', async () => {
    const { io, result } = harness({ 'oops.bark': 'sit dog = empty bowl\nwoof dog.name\n' });
    expect(await main(['run', 'oops.bark'], io)).toBe(1);
    expect(result.stderr).toContain('oops.bark:2');
    expect(result.stderr).toContain('Walter tripped');
  });

  it('checks without running', async () => {
    const { io, result } = harness({ 'ok.bark': 'woof 1', 'bad.bark': 'woof x' });
    expect(await main(['check', 'ok.bark'], io)).toBe(0);
    expect(result.stdout).toBe('ok.bark: no problems. Good boy.\n');
    expect(result.program).toBe('');
    expect(await main(['check', 'bad.bark'], io)).toBe(1);
  });

  it('explains missing files and unknown commands', async () => {
    const { io, result } = harness();
    expect(await main(['run', 'nope.bark'], io)).toBe(1);
    expect(result.stderr).toContain("can't find `nope.bark`");
    expect(await main(['roll-over'], io)).toBe(2);
    expect(result.stderr).toContain("doesn't know the command `roll-over`");
    expect(await main(['run'], io)).toBe(1);
  });
});
