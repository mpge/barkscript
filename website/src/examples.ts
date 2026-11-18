const files = import.meta.glob('../../examples/*.bark', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface Example {
  name: string;
  title: string;
  blurb: string;
  source: string;
}

/** Playground order and labels. The source comes straight from examples/, the same files the tests run. */
const ORDER: Array<[name: string, title: string, blurb: string]> = [
  ['hello', 'Hello', 'The smallest BarkScript program.'],
  ['treats', 'Treats', 'Variables, a fetch, a loop and an if.'],
  ['fizzbuzz', 'FizzBuzz', 'The interview classic, counting with again ... from.'],
  ['fibonacci', 'Fibonacci', 'Recursion and lists.'],
  ['guess', 'Guess the number', 'Input with beg. Answer in the console below.'],
  ['walk', 'Walk', 'wait makes a fetch async; the compiler awaits it for you.'],
  ['kennel', 'Kennel', 'Objects, unnamed fetches and JavaScript methods.'],
];

export const EXAMPLES: Example[] = ORDER.map(([name, title, blurb]) => {
  const source = files[`../../examples/${name}.bark`];
  if (source === undefined) throw new Error(`Missing example ${name}.bark`);
  return { name, title, blurb, source: source.replace(/\r\n/g, '\n') };
});
