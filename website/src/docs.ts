import './styles.css';
import { marked, type Tokens } from 'marked';
import guide from '../../docs/LANGUAGE.md?raw';
import browser from '../../docs/BROWSER.md?raw';
import cli from '../../docs/CLI.md?raw';
import grammar from '../../docs/GRAMMAR.md?raw';
import { encodeSource } from './playground.js';
import { highlightBark, highlightHtml, highlightJs, troop } from './shared.js';

const PAGES = [
  { id: 'guide', title: 'Language guide', source: guide },
  { id: 'web', title: 'On a web page', source: browser },
  { id: 'cli', title: 'CLI and API', source: cli },
  { id: 'grammar', title: 'Grammar', source: grammar },
];

const FILE_TO_PAGE: Record<string, string> = { 'LANGUAGE.md': 'guide', 'BROWSER.md': 'web', 'CLI.md': 'cli', 'GRAMMAR.md': 'grammar' };

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = (text: string) => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

const renderer = new marked.Renderer();
renderer.code = ({ text, lang }: Tokens.Code) => {
  if (lang === 'bark') {
    const href = `./#code=${encodeSource(text + '\n')}`;
    return `<div class="doc-code"><pre class="code-block">${highlightBark(text)}</pre><a class="try" href="${href}">Open in the playground</a></div>`;
  }
  if (lang === 'js') return `<pre class="code-block">${highlightJs(text)}</pre>`;
  if (lang === 'html') return `<pre class="code-block">${highlightHtml(text)}</pre>`;
  return `<pre class="code-block plain">${escape(text)}</pre>`;
};
renderer.heading = function ({ tokens, depth }: Tokens.Heading) {
  const html = this.parser.parseInline(tokens);
  return `<h${depth} id="${slug(html)}">${html}</h${depth}>`;
};
renderer.link = function ({ href, tokens }: Tokens.Link) {
  const text = this.parser.parseInline(tokens);
  const [file, hash] = href.split('#');
  if (FILE_TO_PAGE[file]) return `<a href="#${FILE_TO_PAGE[file]}${hash ? `/${hash}` : ''}">${text}</a>`;
  if (!file && hash) return `<a href="#${current}/${hash}">${text}</a>`;
  if (/^\.\.?\//.test(href) || /^[A-Z]+\.md$/.test(file)) {
    return `<a href="https://github.com/mpge/barkscript/blob/main/docs/${href}">${text}</a>`;
  }
  return `<a href="${href}">${text}</a>`;
};

let current = 'guide';
const docEl = document.querySelector<HTMLElement>('[data-doc]')!;
const tabsEl = document.querySelector<HTMLElement>('[data-doc-tabs]')!;
const tocEl = document.querySelector<HTMLElement>('[data-toc]')!;

tabsEl.innerHTML = PAGES.map((p) => `<li><a href="#${p.id}" data-page="${p.id}">${p.title}</a></li>`).join('');

function show(): void {
  const [pageId, anchor] = location.hash.slice(1).split('/');
  const page = PAGES.find((p) => p.id === pageId) ?? PAGES[0];
  const changed = page.id !== current || !docEl.innerHTML;
  current = page.id;
  if (changed) {
    // Drop the in-page "Contents" list; the sidebar shows it.
    const source = page.source.replace(/## Contents\n[\s\S]*?(?=\n## )/, '');
    docEl.innerHTML = marked.parse(source, { renderer, async: false });
    for (const tab of tabsEl.querySelectorAll('a')) tab.toggleAttribute('aria-current', tab.dataset.page === page.id);
    const headings = [...docEl.querySelectorAll('h2')];
    tocEl.innerHTML = headings.length ? `<ul>${headings.map((h) => `<li><a href="#${page.id}/${h.id}">${h.textContent}</a></li>`).join('')}</ul>` : '';
    document.title = `${page.title} · BarkScript`;
  }
  const target = anchor ? document.getElementById(anchor) : null;
  if (target) target.scrollIntoView();
  else if (changed) window.scrollTo(0, 0);
}

window.addEventListener('hashchange', show);
show();
troop();
