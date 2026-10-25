import { describe, expect, it } from 'vitest';
import {
  answerMatches, compareSections, conceptOf, normalizeAnswer, noteFingerprint, noteSections, notePathFor,
  parseQuiz, quizPathFor, stampQuiz, isQuizFile, fingerprint,
} from '../../quiz-format.js';

const NOTE = `# DSA

Intro words.

## Linked Lists

Nodes point with \`next\`.

### Types

Singly and doubly.

\`\`\`js
# not a heading
\`\`\`

## ➕ Heap

Bubble up.
`;

const quiz = (body: string, front = 'note: dsa.md') => `---\n${front}\n---\n\n# DSA\n\n${body}`;

describe('paths', () => {
  it('mirrors note paths', () => {
    expect(quizPathFor('dsa/lists.md')).toBe('dsa/lists.quiz.md');
    expect(notePathFor('dsa/lists.quiz.md')).toBe('dsa/lists.md');
    expect(isQuizFile('a.quiz.md')).toBe(true);
    expect(isQuizFile('a.md')).toBe(false);
  });
  it('groups variants by id stem', () => {
    expect(conceptOf('dsa-014')).toBe('dsa-014');
    expect(conceptOf('dsa-014b')).toBe('dsa-014');
    expect(conceptOf('dsa-014c')).toBe('dsa-014');
    expect(conceptOf('weird')).toBe('weird');
  });
});

describe('noteSections', () => {
  const sections = noteSections(NOTE);
  it('builds paths under a single H1 title, skipping code fences and ➕ marks', () => {
    expect(sections.map((s) => s.path)).toEqual(['DSA', 'Linked Lists', 'Linked Lists > Types', 'Heap']);
  });
  it('numbers duplicate headings', () => {
    const dup = noteSections('# T\n\n## A\n\n### X\n\nx\n\n## B\n\n### X\n\ny\n\n## A\n\nz\n');
    expect(dup.map((s) => s.path)).toEqual(['T', 'A', 'A > X', 'B', 'B > X', 'A (2)']);
  });
  it('names text before the first heading (intro)', () => {
    expect(noteSections('hello\n\n## A\n\nx').map((s) => s.path)).toEqual(['(intro)', 'A']);
  });
  it('ignores CRLF and trailing spaces when fingerprinting', () => {
    expect(noteFingerprint(NOTE)).toBe(noteFingerprint(NOTE.replace(/\n/g, '  \r\n')));
    expect(fingerprint('a')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('parseQuiz', () => {
  it('reads all four question types', () => {
    const q = parseQuiz(quiz(`## Linked Lists

### dsa-001 · single
Which moves the variable?

- [x] \`cur = cur.next\`
- [ ] \`cur.next = prev\`

> Reassigning a variable moves it.

### dsa-001b · multi
Pick two.

- [x] a
- [x] b
- [ ] c

> a and b.

### dsa-002 · input
Big-O of search?

\`\`\`js
- [x] not an option inside a fence
\`\`\`

Answer: O(log n) | log n

> Halving.

### dsa-003 · recall
Why O(1) space?

> Only pointers change.
`));
    expect(q.errors).toEqual([]);
    expect(q.questions.map((x) => [x.id, x.concept, x.type, x.options.length])).toEqual([
      ['dsa-001', 'dsa-001', 'single', 2],
      ['dsa-001b', 'dsa-001', 'multi', 3],
      ['dsa-002', 'dsa-002', 'input', 0],
      ['dsa-003', 'dsa-003', 'recall', 0],
    ]);
    expect(q.questions[2]!.answers).toEqual(['O(log n)', 'log n']);
    expect(q.questions[2]!.prompt).toContain('not an option inside a fence');
    expect(q.questions[3]!.explain).toBe('Only pointers change.');
    expect(q.questions[0]!.section).toBe('Linked Lists');
    expect(q.meta.note).toBe('dsa.md');
  });

  it('reports format errors and skips those questions', () => {
    const q = parseQuiz(quiz(`## A

### a-1 · single
Two right.

- [x] a
- [x] b

> no

### a-2 · multi
None right.

- [ ] a
- [ ] b

### a-3 · input
No answer.

> x

### a-4 · recall
No model answer.

### a-5 · recall
Options in recall.

- [ ] x

> y

### a-6 · single
Text after options.

- [x] a
- [ ] b

stray text

> e

### a 7
bad heading

### a-8 · essay
Unknown type.

### a-9 · single

- [x] a
- [ ] b

### a-10 · recall
Fine.

> ok

### a-10 · recall
Duplicate id.

> dup
`));
    const msgs = q.errors.map((e) => e.msg);
    expect(msgs).toEqual(expect.arrayContaining([
      expect.stringContaining('exactly 1 correct'),
      expect.stringContaining('at least 1 correct'),
      expect.stringContaining('input needs'),
      expect.stringContaining('recall needs a model answer'),
      expect.stringContaining("don't take options"),
      expect.stringContaining('text after the options'),
      expect.stringContaining('bad question heading'),
      expect.stringContaining('unknown type'),
      expect.stringContaining('empty question'),
      expect.stringContaining('duplicate id'),
    ]));
    expect(q.questions.map((x) => x.id)).toEqual(['a-10']); // only the valid one survives
  });

  it('warns about missing explanations and sections, and missing front matter', () => {
    const q = parseQuiz('# T\n\n### x-1 · single\nQ?\n\n- [x] a\n- [ ] b\n');
    expect(q.errors[0]!.msg).toContain('front matter');
    expect(q.warnings.map((w) => w.msg).join(' ')).toMatch(/no > explanation.*not under a ## section/);
  });
});

describe('compareSections + stampQuiz', () => {
  it('stamps fingerprints and then reports only what changed', () => {
    const stamped = stampQuiz(quiz('## Heap\n\n### h-1 · recall\nWhy?\n\n> Because.\n', 'note: x\nauthor: me'), 'dsa.md', NOTE, '2026-10-25');
    const meta = parseQuiz(stamped).meta;
    expect(stamped).toContain('author: me'); // other keys survive
    expect(meta.note).toBe('dsa.md');
    expect(meta.synced).toBe('2026-10-25');
    expect(meta.sections.map((s) => s.path)).toEqual(['DSA', 'Linked Lists', 'Linked Lists > Types', 'Heap']);
    expect(compareSections(meta, NOTE)).toMatchObject({ inSync: true, changed: [], added: [], removed: [] });

    const edited = NOTE.replace('Bubble up.', 'Bubble up, then down.').replace('### Types', '### Kinds') + '\n## Graphs\n\nEdges.\n';
    const cmp = compareSections(meta, edited);
    expect(cmp.inSync).toBe(false);
    expect(cmp.changed).toEqual(['Heap']);
    expect(cmp.added).toEqual(['Linked Lists > Kinds', 'Graphs']);
    expect(cmp.removed).toEqual(['Linked Lists > Types']);

    // stamping again replaces the old section list instead of appending
    const restamped = stampQuiz(stamped, 'dsa.md', edited, '2026-10-26');
    expect(restamped.match(/^sections:/gm)).toHaveLength(1);
    expect(compareSections(parseQuiz(restamped).meta, edited).inSync).toBe(true);
  });
});

describe('answer matching', () => {
  it.each([
    ['O(log n)', 'o(logn)'],
    ['`jsonb`', 'JSONB'],
    ['{3, 4}', '[3,4]'],
    ['Four.', 'four'],
  ])('%s matches %s', (a, b) => expect(answerMatches(b, [a])).toBe(true));
  it('keeps commas meaningful', () => {
    expect(normalizeAnswer('3,4')).not.toBe(normalizeAnswer('34'));
    expect(answerMatches('34', ['3, 4'])).toBe(false);
  });
});
