// Find-in-note using the CSS Custom Highlight API: highlights text ranges without touching
// the rendered DOM, so it can't break links or code blocks.
import { termsRegex } from './search.js';

const supported = typeof CSS !== 'undefined' && 'highlights' in CSS;

export function createFinder(container) {
  let ranges = [];
  let current = -1;

  function clear() {
    ranges = [];
    current = -1;
    if (supported) { CSS.highlights.delete('find'); CSS.highlights.delete('find-current'); }
  }

  // Either a literal string (find bar) or a list of whole words (from a notes search).
  function run({ text = '', words = null } = {}) {
    clear();
    const re = words?.length
      ? termsRegex(words)
      : text.trim() ? new RegExp(text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu') : null;
    if (!re || !supported) return 0;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
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

  function go(step) {
    if (!ranges.length) return;
    current = (current + step + ranges.length) % ranges.length;
    CSS.highlights.set('find-current', new Highlight(ranges[current]));
    const el = ranges[current].startContainer.parentElement;
    el?.scrollIntoView({ block: 'center', behavior: 'instant' });
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
