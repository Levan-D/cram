// Find-in-note using the CSS Custom Highlight API: highlights text ranges without touching
// the rendered DOM, so it can't break links or code blocks.
import { termsRegex } from './search';

const supported = () => typeof CSS !== 'undefined' && 'highlights' in CSS;

export interface Finder {
  run(query: { text?: string; words?: string[] | null }): number;
  clear(): void;
  next(): void;
  prev(): void;
  readonly count: number;
  readonly index: number;
}

export function createFinder(getContainer: () => HTMLElement | null): Finder {
  let ranges: Range[] = [];
  let current = -1;

  function clear() {
    ranges = [];
    current = -1;
    if (supported()) { CSS.highlights.delete('find'); CSS.highlights.delete('find-current'); }
  }

  // Either a literal string (find bar) or a list of whole words (from a notes search).
  function run({ text = '', words = null }: { text?: string; words?: string[] | null }) {
    clear();
    const container = getContainer();
    const re = words?.length
      ? termsRegex(words)
      : text.trim() ? new RegExp(text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu') : null;
    if (!re || !container || !supported()) return 0;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      for (const m of node.data.matchAll(re)) {
        if (!m[0]) continue;
        const r = new Range();
        r.setStart(node, m.index);
        r.setEnd(node, m.index + m[0].length);
        ranges.push(r);
      }
    }
    if (ranges.length) CSS.highlights.set('find', new Highlight(...ranges));
    return ranges.length;
  }

  function go(step: number) {
    if (!ranges.length) return;
    current = (current + step + ranges.length) % ranges.length;
    const range = ranges[current]!;
    CSS.highlights.set('find-current', new Highlight(range));
    range.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }

  return {
    run,
    clear,
    next: () => go(1),
    prev: () => go(-1),
    get count() { return ranges.length; },
    get index() { return current; },
  };
}
