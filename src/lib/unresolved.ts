// "Unresolved" markers in notes: the places you flagged as not understood or to do later, and
// the lines Claude added (➕) that you may want to rewrite in your own words. Unchecked
// `- [ ]` boxes are deliberately not markers: in these notes they're study checklists.
// Pure text scanning over the notes already in memory for search.
import type { NoteListItem } from '../api';

export type Kind = 'confused' | 'todo' | 'claude';

export const KIND_INFO: Record<Kind, { label: string; title: string }> = {
  confused: { label: 'Confused', title: '???, idk, wtf, huh, no idea, don\'t get it, confused' },
  todo: { label: 'To do', title: 'todo, fixme, tbd, wip, do it later, revisit, come back to this' },
  claude: { label: 'Claude\'s ➕', title: 'Lines Claude added to your notes (with your OK)' },
};
export const KINDS: Kind[] = ['confused', 'todo', 'claude'];

// Deliberate markers only: whole words, any case. Words that also show up in normal prose
// (lookup, verify, expand, unclear, not sure) flagged half the notes, so they're out.
// `?` alone would flag every question, so it takes two.
const CONFUSED = /\?{2,}|\?!|!\?|\bidk\b|\bwtf\b|\bhuh\b|\bconfused\b|\bdon'?t get (?:it|this)\b|\bno idea\b|\bwhat does this (?:even )?mean\b/i;
const TODO = /\btodo\b|\bfixme\b|\btbd\b|\bwip\b|\bdo (?:it |this )?later\b|\brevisit\b|\bcome back to this\b/i;
const CLAUDE = /➕/;
const FENCE = /^\s{0,3}(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export interface Hit {
  note: string;      // note path
  line: number;      // 0-based source line
  kinds: Kind[];     // every kind that matched; kinds[0] is the tag shown
  text: string;      // the line, trimmed, markdown bullets stripped
  section: string;   // nearest heading above, '' before the first one
  match: string;     // what matched, for highlighting
}

// Returns the kinds a line matches, in display priority, with what matched.
export function classify(line: string): { kinds: Kind[]; match: string } {
  const kinds: Kind[] = [];
  let match = '';
  const take = (kind: Kind, re: RegExp) => {
    const m = line.match(re);
    if (m) { kinds.push(kind); match ||= m[0]; }
  };
  take('confused', CONFUSED);
  take('todo', TODO);
  take('claude', CLAUDE);
  return { kinds, match };
}

export function scanNote(path: string, text: string): Hit[] {
  const out: Hit[] = [];
  let fence: string | null = null;
  let section = '';
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    const f = line.match(FENCE);
    if (f) { fence = fence === null ? f[1]! : fence === f[1] ? null : fence; return; }
    if (fence !== null) return;
    const h = line.match(HEADING);
    if (h) { section = h[2]!.replace(/[*_`]/g, '').trim(); if (!CLAUDE.test(line) && !CONFUSED.test(line) && !TODO.test(line)) return; }
    const { kinds, match } = classify(line);
    if (!kinds.length) return;
    const text = line
      .replace(/^\s*(?:>\s*)+/, '')                                     // quote marks
      .replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, '')            // bullets, checkboxes
      .replace(/^#+\s+/, '')                                            // heading marks
      .replace(/\*\*|__|`/g, '')                                        // bold / code marks
      .trim();
    out.push({ note: path, line: i, kinds, match, section, text });
  });
  return out;
}

export const scanNotes = (notes: NoteListItem[]): Hit[] => notes.flatMap((n) => scanNote(n.path, n.text));

// The hits for the current notes list (one scan per list refresh, shared by the badge and the page).
let cache: { notes: NoteListItem[]; hits: Hit[] } | null = null;
export function hitsFor(notes: NoteListItem[]): Hit[] {
  if (cache?.notes !== notes) cache = { notes, hits: scanNotes(notes) };
  return cache.hits;
}

export const countByKind = (hits: Hit[]): Record<Kind, number> => {
  const c: Record<Kind, number> = { confused: 0, todo: 0, claude: 0 };
  for (const h of hits) for (const k of h.kinds) c[k]++;
  return c;
};
