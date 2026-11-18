import { run } from '../src/run.js';

/** Run a program in-process and return everything it printed. */
export async function output(source: string, answers: string[] = []): Promise<string> {
  let text = '';
  await run(source, {
    io: {
      write: (chunk) => {
        text += chunk;
      },
      ask: async (question) => {
        text += question;
        return answers.shift() ?? '';
      },
    },
  });
  return text;
}

/** Strip the indentation used to keep inline programs readable in tests. */
export function bark(strings: TemplateStringsArray, ...values: unknown[]): string {
  const raw = strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ''), '');
  const lines = raw.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
  return lines.map((l) => l.slice(indent)).join('\n') + '\n';
}
