# The bark command

```text
bark run <file.bark>              compile and run a program
bark compile <file.bark>          write readable JavaScript next to the source
    -o, --out <file.js>           choose where the JavaScript goes
    --stdout                      print the JavaScript instead of writing a file
bark check <file.bark>...         report problems without running anything
bark <file.bark>                  same as bark run
bark --help                       show this help
bark --version                    print the version
```

## bark run

Compiles the program and runs it in the same Node.js process. Output goes to stdout, `beg`
reads lines from stdin, so piping works:

```sh
printf '50\n25\n37\n' | bark run examples/guess.bark
```

The exit code is `0` when the program finishes or calls `play dead`, and `1` when it fails to
compile or throws at runtime.

## bark compile

Writes a standalone JavaScript file. It runs with plain `node`, in CommonJS and ESM projects
alike, and only includes the helpers the program uses.

```sh
bark compile examples/fizzbuzz.bark            # writes examples/fizzbuzz.js
bark compile examples/fizzbuzz.bark -o fb.js   # writes fb.js
bark compile examples/fizzbuzz.bark --stdout   # prints it
```

Nothing is written when the program has an error.

## bark check

Parses and checks the program without running it. Useful in editors and CI.

```sh
bark check examples/*.bark
```

## Colour

Errors are coloured when stderr is a terminal. Set `NO_COLOR=1` to turn that off.

## Using the compiler from code

```js
import { compile, run, diagnose, formatError } from 'barkscript';

const { code } = compile('woof "hi"');          // standalone JavaScript
await run('woof "hi"', { io: { write: (t) => process.stdout.write(t) } });

const error = diagnose('fetch');                // BarkError or undefined
if (error) console.error(formatError(error, 'fetch', 'dog.bark'));
```

`compile(source, { filename, mode })` takes `mode: 'script'` (the default, a runnable Node.js
program) or `mode: 'hosted'` (a function body for runners that supply `__host.ask`, `console`
and `process`; this is what `bark run` and the playground use).
