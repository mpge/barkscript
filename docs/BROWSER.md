# BarkScript on a web page

Load one script, then write BarkScript straight into your HTML.

```html
<script src="https://barkscript.com/barkscript.min.js"></script>

<script type="text/barkscript">
  woof "Hello from the page"
</script>
```

Every `<script type="text/barkscript">` runs once the page has loaded, in the order they
appear. Indentation inside the tag is removed first, so you can indent it with the rest of
your HTML.

## Where the output goes

`woof` prints to the browser console. Add `data-output` with a CSS selector to also print each
line into an element:

```html
<div id="woofs"></div>
<script type="text/barkscript" data-output="#woofs">
  woof "Rover says hi"
</script>
```

Each line becomes a `<div class="bark-line">`. Errors become a `<pre class="bark-error">` and
are also logged with `console.error`, with the same line, excerpt and hint the CLI prints.

## Programs in their own file

```html
<script type="text/barkscript" src="rover.bark"></script>
```

The file is fetched, so it has to be on the same site or allow cross-origin requests.

## Using the page

Browser globals such as `document`, `window`, `localStorage`, `location` and `alert` are
available, and `new` constructs objects:

```bark
stay heading = document.querySelector("h1")
heading.textContent = "Rover was here"

sit visits = (treats.grab("visits") or 0) + 1
come here treats.bury("visits", visits)
woof "Visit {visits}, started {new Date().toLocaleTimeString()}"
```

`treats` is the page's `localStorage` (see [Saving things](LANGUAGE.md#saving-things-treats)).
If storage is switched off, treats last until the page is closed.

`beg` uses `window.prompt`. `wait` works as usual. `play dead` stops that script, and the next
one still runs.

## Running code yourself

Add `data-manual` to the loader to stop it running scripts on its own, then use the global
`BarkScript` object:

```html
<script src="https://barkscript.com/barkscript.min.js" data-manual></script>
<script>
  BarkScript.run('woof "hi"', { output: document.querySelector("#out") });
  const { code } = BarkScript.compile('woof "hi"');   // JavaScript as a string
  BarkScript.runScripts();                              // run the <script> tags now
</script>
```

`run(source, { filename, output, ask })` resolves with the exit code and never throws; `ask`
replaces `window.prompt` for `beg`.

## Other ways to load it

| Where | URL |
|---|---|
| barkscript.com | `https://barkscript.com/barkscript.min.js` |
| jsDelivr (from npm) | `https://cdn.jsdelivr.net/npm/barkscript/dist/browser/barkscript.min.js` |
| unpkg (from npm) | `https://unpkg.com/barkscript` |
| ES module | `import { run } from "https://barkscript.com/barkscript.mjs"` |
| A bundler | `import { run, runScripts } from "barkscript/browser"` |

The minified script is about 45 KB, or 14 KB gzipped. It compiles in the page, so there is no
build step and no server.
