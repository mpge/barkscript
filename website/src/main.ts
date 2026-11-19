import './styles.css';
import { diagnose } from '../../src/compiler.js';
import { formatError } from '../../src/errors.js';
import { runScripts } from '../../src/browser.js';
import { highlightBark } from './highlight.js';
import { Playground } from './playground.js';
import { copyButtons, highlightHtml, troop } from './shared.js';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ------------------------------------------------------------------ playground

const playground = new Playground(document.querySelector<HTMLElement>('[data-playground]')!);
const hasSharedCode = location.hash.startsWith('#code=');
if (!hasSharedCode) void playground.demo();

// ------------------------------------------------------- errors, compiled live

const ERROR_SAMPLES: Array<[file: string, source: string]> = [
  ['dog.bark', 'sit treats = 3\nfetch\n'],
  ['dog.bark', 'sit treats = 3\nsit double = good boy * 2\n'],
  ['rover.bark', 'stay name = "Rover"\nname = "Rex"\n'],
  ['treats.bark', 'sit treats = 3\nwoof treat + 1\n'],
  ['stash.bark', 'come here treats.setItem("bones", 3)\n'],
  ['habits.bark', 'fetch double(x)\n    return x * 2\nend\n'],
];

const errorList = document.querySelector('[data-errors]')!;
for (const [file, source] of ERROR_SAMPLES) {
  const error = diagnose(source);
  if (!error) continue;
  const text = escape(formatError(error, source, file))
    .replace(/^(\s+\|\s*)(\^+)$/m, '$1<span class="caret">$2</span>')
    .replace(/^hint:/m, '<span class="hint">hint:</span>');
  const pre = document.createElement('pre');
  pre.className = 'terminal';
  pre.innerHTML = text;
  errorList.append(pre);
}

// ------------------------------------------------------ BarkScript on the page

const demoScript = document.querySelector<HTMLScriptElement>('script[type="text/barkscript"]');
const snippet = document.querySelector<HTMLElement>('[data-highlight="html"]');
if (demoScript && snippet) {
  const body = demoScript.textContent!.replace(/^\n/, '').replace(/\s+$/, '');
  const html = `<script src="https://barkscript.com/barkscript.min.js"></script>

<div id="woofs"></div>
<script type="text/barkscript" data-output="#woofs">
${body}
</script>`;
  snippet.innerHTML = highlightHtml(html);
}
void runScripts();

for (const block of document.querySelectorAll<HTMLElement>('[data-highlight="bark"]')) {
  block.innerHTML = highlightBark(block.textContent ?? '');
}

copyButtons();
troop();
