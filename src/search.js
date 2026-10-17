// Ranked, semi-fuzzy search across notes (MiniSearch, BM25-style scoring).
// "Google-ish": every word must match (AND), the word being typed matches as a prefix,
// and typo tolerance only kicks in for longer words so short queries stay strict.
import MiniSearch from 'minisearch';

const headingsOf = (text) => (text.match(/^#{1,6}\s+.+$/gm) || []).map((h) => h.replace(/^#+\s+/, '')).join('\n');

export function buildIndex(notes) {
  const index = new MiniSearch({
    idField: 'path',
    fields: ['title', 'headings', 'text'],
    storeFields: ['path'],
    searchOptions: {
      boost: { title: 4, headings: 2 },
      combineWith: 'AND',
      prefix: (_term, i, terms) => i === terms.length - 1, // only the word you're still typing
      fuzzy: (term) => (term.length >= 5 ? 0.2 : false),  // ≤1 typo for 5–9 letters, ≤2 for 10+
      maxFuzzy: 2,
    },
  });
  index.addAll(notes.map((n) => ({ path: n.path, title: n.title.replace(/[-_]+/g, ' '), headings: headingsOf(n.text), text: n.text })));
  return index;
}

// -> [{ path, score, terms }] where terms are the actual words in the note that matched.
export function search(index, query) {
  return index.search(query).map((r) => ({ path: r.id, score: r.score, terms: r.terms }));
}

// Regex that matches any of the given whole words (letters/digits aware, case-insensitive).
export function termsRegex(terms) {
  const alts = [...new Set(terms)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!alts.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

// A short plain-text excerpt around the first match, as DOM nodes with <mark>s (no innerHTML).
export function snippetNodes(text, terms, radius = 70) {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const re = termsRegex(terms);
  const first = re ? plain.search(re) : -1;
  if (first < 0) return [];
  const start = Math.max(0, first - radius);
  const end = Math.min(plain.length, first + radius * 2);
  const slice = (start ? '…' : '') + plain.slice(start, end) + (end < plain.length ? '…' : '');

  const nodes = [];
  let last = 0;
  for (const m of slice.matchAll(termsRegex(terms))) {
    if (m.index > last) nodes.push(document.createTextNode(slice.slice(last, m.index)));
    const mark = document.createElement('mark');
    mark.textContent = m[0];
    nodes.push(mark);
    last = m.index + m[0].length;
  }
  if (last < slice.length) nodes.push(document.createTextNode(slice.slice(last)));
  return nodes;
}
