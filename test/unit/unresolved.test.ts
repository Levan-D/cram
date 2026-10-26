import { describe, expect, it } from 'vitest';
import { classify, countByKind, scanNote, scanNotes } from '../../src/lib/unresolved';

const NOTE = `# Heaps

A heap is a complete tree. ??? why complete
- [ ] draw the array layout
- [x] done one

## Insert

Add at the end, **bubble up**. idk why \`log n\`
> TODO: compare with a BST
Sure? No: one question mark is normal prose.

\`\`\`ts
// TODO inside code doesn't count, idk
\`\`\`

## Remove ???

➕ Claude: the last leaf keeps the tree complete.
Revisit this part later.
`;

describe('unresolved markers', () => {
  it('classifies lines', () => {
    expect(classify('idk why').kinds).toEqual(['confused']);
    expect(classify('TODO: x').kinds).toEqual(['todo']);
    expect(classify('- [ ] a checklist item').kinds).toEqual([]); // checklists aren't markers
    expect(classify('- [x] done').kinds).toEqual([]);
    expect(classify('➕ added by Claude').kinds).toEqual(['claude']);
    expect(classify('➕ idk, do it later').kinds).toEqual(['confused', 'todo', 'claude']);
    expect(classify('A question? Fine.').kinds).toEqual([]);
    expect(classify('the kidknapper').kinds).toEqual([]); // whole words only
    expect(classify('WTF is this').match).toBe('WTF');
    // Prose words are not markers.
    for (const s of ['DNS lookup is hierarchical', 'verify the certificate', 'if we need to expand it', 'the line can be fairly unclear', "I'm not sure", 'requests come back empty']) {
      expect(classify(s).kinds, s).toEqual([]);
    }
  });

  it('scans a note: sections, fences skipped, bullets stripped', () => {
    const hits = scanNote('dsa/heaps.md', NOTE);
    expect(hits.map((h) => [h.line, h.kinds[0], h.section, h.text])).toEqual([
      [2, 'confused', 'Heaps', 'A heap is a complete tree. ??? why complete'],
      [8, 'confused', 'Insert', 'Add at the end, bubble up. idk why log n'], // ** and ` stripped
      [9, 'todo', 'Insert', 'TODO: compare with a BST'],
      [16, 'confused', 'Remove ???', 'Remove ???'],
      [18, 'claude', 'Remove ???', '➕ Claude: the last leaf keeps the tree complete.'],
      [19, 'todo', 'Remove ???', 'Revisit this part later.'],
    ]);
    expect(countByKind(hits)).toEqual({ confused: 3, todo: 2, claude: 1 });
  });

  it('scans several notes in order', () => {
    const hits = scanNotes([{ path: 'a.md', dir: '', title: 'a', text: 'fine\n' }, { path: 'b.md', dir: '', title: 'b', text: 'wip\n' }]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.note).toBe('b.md');
  });
});
