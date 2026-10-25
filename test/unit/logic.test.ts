import { describe, expect, it } from 'vitest';
import { buildIndex, search, snippetParts, termsRegex } from '../../src/lib/search';
import { ancestors, browseRows, colorFor, treeRows } from '../../src/lib/tree';
import { lineAt, yForLine, type Mark } from '../../src/lib/position';
import { countWords, errMsg, fmtSize, pagesFor, plural, shortName, stem } from '../../src/lib/text';
import { headingKey, idHeadings, markdownHeadings, slugify } from '../../src/lib/toc';
import { rowsFor } from '../../src/store';
import type { NoteListItem } from '../../src/api';

const note = (path: string, text = ''): NoteListItem => {
  const slash = path.lastIndexOf('/');
  return { path, dir: slash < 0 ? '' : path.slice(0, slash), title: path.slice(slash + 1).replace(/\.md$/, ''), text };
};
const NOTES = [
  note('dsa/heaps.md', '# Heaps\n\nA complexity analysis of heaps. Insert bubbles up.'),
  note('dsa/trees/avl.md', '# AVL\n\nBalanced trees with rotations.'),
  note('networking/http.md', '# HTTP\n\n## Caching\n\nETag and complexity budget.'),
  note('readme.md', 'Just text.'),
];

describe('search', () => {
  const index = buildIndex(NOTES);
  it('requires every word (AND) and ranks title matches first', () => {
    expect(search(index, 'heaps insert').map((r) => r.path)).toEqual(['dsa/heaps.md']);
    expect(search(index, 'complexity').map((r) => r.path).sort()).toEqual(['dsa/heaps.md', 'networking/http.md']);
    expect(search(index, 'heaps')[0]!.path).toBe('dsa/heaps.md'); // title boost
  });
  it('matches the word being typed as a prefix', () => {
    expect(search(index, 'rotat').map((r) => r.path)).toEqual(['dsa/trees/avl.md']);
  });
  it('tolerates typos only in longer words', () => {
    expect(search(index, 'complxity').length).toBe(2);
    expect(search(index, 'htp')).toEqual([]);
  });
  it('builds whole-word, unicode-aware regexes', () => {
    const re = termsRegex(['heap', 'a.b'])!;
    expect('a heap!'.match(re)).toEqual(['heap']);
    expect('heaps'.match(re)).toBeNull();
    expect('x a.b y'.match(re)).toEqual(['a.b']);
    expect(termsRegex([''])).toBeNull();
  });
  it('makes a marked snippet around the first match', () => {
    const parts = snippetParts(`${'x '.repeat(80)}the **heap** grows\n\`\`\`code heap\`\`\``, ['heap'], 10);
    expect(parts[0]).toEqual({ text: '…x x x the ', mark: false });
    expect(parts.find((p) => p.mark)).toEqual({ text: 'heap', mark: true });
    expect(parts.at(-1)!.text.endsWith('…')).toBe(false);
    expect(snippetParts('nothing here', ['heap'])).toEqual([]);
  });
});

describe('sidebar tree', () => {
  it('inherits folder colors from the nearest colored ancestor', () => {
    const colors = { dsa: 'green' as const, 'dsa/trees': 'blue' as const };
    expect(colorFor('dsa/trees/x', colors)).toBe('blue');
    expect(colorFor('dsa', colors)).toBe('green');
    expect(colorFor('networking', colors)).toBe('');
    expect(colorFor('', colors)).toBe('');
  });
  it('nests folders before notes, counts every note below, and hides collapsed folders', () => {
    const rows = treeRows(NOTES, new Set(), {});
    expect(rows.map((r) => (r.type === 'folder' ? `${'  '.repeat(r.depth)}${r.name}/ (${r.count})` : r.type === 'note' ? `${'  '.repeat(r.depth)}${r.note.title}` : ''))).toEqual([
      'dsa/ (2)', '  trees/ (1)', '    avl', '  heaps', 'networking/ (1)', '  http', 'readme',
    ]);
    const collapsed = treeRows(NOTES, new Set(['dsa']), {});
    expect(collapsed.filter((r) => r.type === 'note').map((r) => r.type === 'note' && r.note.title)).toEqual(['http', 'readme']);
    expect(collapsed[0]).toMatchObject({ type: 'folder', collapsed: true, count: 2 });
  });
  it('puts favorites on top with section headers', () => {
    const rows = browseRows(NOTES, new Set(['networking/http.md']), new Set(), {});
    expect(rows.slice(0, 3).map((r) => r.type)).toEqual(['header', 'note', 'header']);
    expect(rows[1]).toMatchObject({ fav: true, showDir: true });
    expect(browseRows(NOTES, new Set(), new Set(), {})[0]!.type).toBe('folder');
  });
  it('lists the folders above a note', () => {
    expect(ancestors('a/b/c.md')).toEqual(['a', 'a/b']);
    expect(ancestors('c.md')).toEqual([]);
  });
  it('switches between tree and search results (rowsFor)', () => {
    const base = { notes: NOTES, byPath: new Map(NOTES.map((n) => [n.path, n])), index: buildIndex(NOTES), favorites: new Set<string>(), collapsed: new Set<string>(), folderColors: { dsa: 'red' as const } };
    expect(rowsFor({ ...base, query: '' })[0]!.type).toBe('folder');
    const results = rowsFor({ ...base, query: 'insert' });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ type: 'note', showDir: true, color: 'red', terms: ['insert'] });
  });
});

describe('read ⇄ edit position math', () => {
  const marks: Mark[] = [{ line: 0, top: 100 }, { line: 10, top: 200 }, { line: 12, top: 400 }];
  it('maps a viewport y to a fractional source line', () => {
    expect(lineAt(marks, 50, 600, 20)).toBe(0);          // above the first block
    expect(lineAt(marks, 150, 600, 20)).toBe(5);         // halfway through block 0 (lines 0–10)
    expect(lineAt(marks, 300, 600, 20)).toBe(11);        // halfway through block 1 (lines 10–12)
    expect(lineAt(marks, 500, 600, 20)).toBe(16);        // last block runs to the end of the note
    expect(lineAt([], 10, 20, 5)).toBe(0);
  });
  it('maps a line back to y (inverse of lineAt)', () => {
    for (const y of [100, 150, 199, 250, 450]) expect(yForLine(marks, lineAt(marks, y, 600, 20), 600, 20)).toBeCloseTo(y, 6);
    expect(yForLine(marks, 99, 600, 20)).toBe(600);
    expect(yForLine([], 3, 10, 5)).toBe(0);
  });
});

describe('text helpers', () => {
  it('counts words and pages', () => {
    expect(countWords("It's a well-known fact — 42 apples.")).toBe(6); // It's · a · well-known · fact · 42 · apples
    expect(pagesFor('')).toBe(1);
    expect(pagesFor('w '.repeat(301))).toBe(2);
  });
  it('formats sizes, names and errors', () => {
    expect(fmtSize(512)).toBe('512 B');
    expect(fmtSize(2048)).toBe('2 KB');
    expect(fmtSize(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(stem('a.b.png')).toBe('a.b');
    expect(shortName('database-types-schema-relationships-overview')).toBe('database-types-s…-overview');
    expect(shortName('short')).toBe('short');
    expect(errMsg(new Error("Error invoking remote method 'save-note': Error: Disk full"))).toBe('Disk full');
    expect(plural(1, 'note')).toBe('1 note');
    expect(plural(2, 'note')).toBe('2 notes');
  });
});

describe('headings', () => {
  it('slugifies like GitHub and de-duplicates ids', () => {
    expect(slugify('Hash Table (Map)!')).toBe('hash-table-map');
    expect(slugify('???')).toBe('section');
    const div = document.createElement('div');
    div.innerHTML = '<h2>Types</h2><p>x</p><h3>Types</h3><h4>Other</h4><h5>skip</h5>';
    expect(idHeadings(div).map((h) => h.id)).toEqual(['types', 'types-1', 'other']);
  });
  it('finds markdown headings outside code fences, with their offsets', () => {
    const src = '# A\ntext\n```\n# not\n```\n## B ##\n';
    expect(markdownHeadings(src)).toEqual([{ level: 1, text: 'A', pos: 0 }, { level: 2, text: 'B', pos: src.indexOf('## B') }]);
    expect(headingKey('➕ **AVL**  Tree')).toBe('avl tree');
  });
});
