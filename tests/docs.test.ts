import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diagnose } from '../src/compiler.js';
import { CONTEXTUAL, KEYWORDS, PHRASES } from '../src/tokens.js';

const root = join(import.meta.dirname, '..');
const markdown = ['README.md', 'CONTRIBUTING.md', ...readdirSync(join(root, 'docs')).map((f) => `docs/${f}`)].filter((f) => f.endsWith('.md'));

/** Every ```bark block in the documentation must compile. Error examples use ```text. */
const blocks = markdown.flatMap((file) => {
  const text = readFileSync(join(root, file), 'utf8');
  return [...text.matchAll(/```bark\n([\s\S]*?)```/g)].map((m, i) => ({ name: `${file} #${i + 1}`, source: m[1] }));
});

describe('documentation', () => {
  it('has bark examples to check', () => {
    expect(blocks.length).toBeGreaterThan(20);
  });

  it.each(blocks.map((b) => [b.name, b.source]))('%s compiles', (_name, source) => {
    const error = diagnose(source);
    expect(error, error && `${error.message} (line ${error.loc.line})`).toBeUndefined();
  });

  it('the grammar documents every keyword', () => {
    const grammar = readFileSync(join(root, 'docs', 'GRAMMAR.md'), 'utf8');
    for (const word of [...KEYWORDS, ...PHRASES, ...CONTEXTUAL]) expect(grammar, word).toContain(`\`${word}\``);
  });

  it('the TextMate grammar highlights every keyword', () => {
    const tm = JSON.parse(readFileSync(join(root, 'editors', 'vscode', 'syntaxes', 'barkscript.tmLanguage.json'), 'utf8'));
    const patterns: RegExp[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          if (key === 'match' && typeof value === 'string') patterns.push(new RegExp(value, 'u'));
          else walk(value);
        }
      }
    };
    walk(tm.repository.keywords);
    walk(tm.repository.constants);
    for (const word of [...KEYWORDS, ...PHRASES, ...CONTEXTUAL]) {
      expect(patterns.some((p) => p.exec(word)?.[0] === word), word).toBe(true);
    }
  });
});
