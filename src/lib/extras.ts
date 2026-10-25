// Read-mode extras applied to a rendered note: copy buttons on code blocks and
// ```mermaid diagrams.
import { icons } from './icons';

const DARK = matchMedia('(prefers-color-scheme: dark)');

type Mermaid = NonNullable<Window['__mermaid']>;
let mermaidReady: Promise<Mermaid> | null = null;
function loadMermaid(): Promise<Mermaid> {
  mermaidReady ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'mermaid.bundle.js';
    s.onload = () => resolve(window.__mermaid!);
    s.onerror = () => { mermaidReady = null; reject(new Error('Could not load the diagram renderer')); };
    document.head.append(s);
  });
  return mermaidReady;
}

let diagramId = 0;
async function renderDiagrams(container: HTMLElement) {
  const blocks = [...container.querySelectorAll<HTMLElement>('pre > code.language-mermaid')];
  if (!blocks.length) return;
  let mermaid;
  try {
    mermaid = await loadMermaid();
  } catch {
    blocks.forEach((code) => code.parentElement!.classList.add('diagram-error'));
    return;
  }
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: DARK.matches ? 'dark' : 'default',
    fontFamily: '"Segoe UI", system-ui, sans-serif',
  });
  for (const code of blocks) {
    const pre = code.parentElement!;
    if (!pre.isConnected) continue; // note changed while Mermaid was loading
    const figure = document.createElement('figure');
    figure.className = 'diagram';
    if (pre.dataset.line) figure.dataset.line = pre.dataset.line; // keeps read/edit sync anchors
    try {
      const { svg } = await mermaid.render(`mermaid-${++diagramId}`, code.textContent || '');
      figure.innerHTML = svg;
    } catch (err) {
      figure.classList.add('diagram-error');
      figure.textContent = `Diagram error: ${String((err as Error)?.message || err).split('\n')[0]}`;
    }
    pre.replaceWith(figure);
  }
}

function addCopyButtons(container: HTMLElement, copyText: (text: string) => Promise<void>) {
  for (const pre of container.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    if (!code || code.classList.contains('language-mermaid')) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn icon-btn';
    btn.title = 'Copy code';
    btn.setAttribute('aria-label', 'Copy code');
    btn.innerHTML = icons.copy;
    btn.addEventListener('click', async () => {
      await copyText(code.textContent || '');
      btn.innerHTML = icons.check;
      btn.classList.add('done');
      setTimeout(() => { btn.innerHTML = icons.copy; btn.classList.remove('done'); }, 1200);
    });
    pre.append(btn);
  }
}

export function enhanceNote(container: HTMLElement, { copyText }: { copyText: (text: string) => Promise<void> }) {
  addCopyButtons(container, copyText);
  return renderDiagrams(container);
}

// Re-render the note when the OS theme flips, so diagrams match.
export function onThemeChange(cb: () => void) {
  DARK.addEventListener('change', cb);
  return () => DARK.removeEventListener('change', cb);
}
