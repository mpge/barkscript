import { highlightBark, highlightJs } from './highlight.js';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Highlight an HTML snippet whose <script type="text/barkscript"> bodies are BarkScript. */
export function highlightHtml(html: string): string {
  const parts = html.split(/(<script type="text\/barkscript"[^>]*>)([\s\S]*?)(<\/script>)/);
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    // split() puts captures at positions 1, 2, 3 of every group of four.
    if (i % 4 === 2) out += highlightBark(part);
    else out += tags(part);
  }
  return out;
}

function tags(html: string): string {
  return escape(html).replace(
    /(&lt;\/?)([a-z]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)(\s*\/?&gt;)/g,
    (_m, open, name, attrs, close) =>
      `<span class="t-punct">${open}</span><span class="t-declare">${name}</span>${attrs.replace(
        /([a-z-]+)(="[^"]*")?/g,
        (_a: string, key: string, value = '') => `<span class="t-call">${key}</span>${value ? `<span class="t-string">${value}</span>` : ''}`,
      )}<span class="t-punct">${close}</span>`,
  );
}

export { highlightBark, highlightJs };

/** Troop's photo appears on hover once website/public/troop.jpg exists. */
export function troop(): void {
  for (const img of document.querySelectorAll<HTMLImageElement>('.troop img')) {
    const probe = new Image();
    probe.onload = () => {
      img.hidden = false;
      img.parentElement!.classList.add('has-photo');
    };
    probe.src = img.src;
  }
}

/** Any button with data-copy copies that text and says so. */
export function copyButtons(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy!);
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Select and copy';
      }
      setTimeout(() => (button.textContent = 'Copy'), 1600);
    });
  }
}
