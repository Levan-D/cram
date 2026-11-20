import { describe, expect, it } from 'vitest';
import { buildQuizPrompt, cleanReply, idStem, nextIds, prepareQuiz, QUIZ_FORMAT } from '../../quiz-gen.js';
import { compareSections, parseQuiz } from '../../quiz-format.js';

const NOTE = `# Heaps

A heap is a complete binary tree.

## Insert

Add at the end, then bubble up.

## Remove

Move the last one up, then sink it.
`;

const QUIZ_BODY = `# Heaps

## Insert

### heaps-001 · single
Where does a new item go first?

\`\`\`js
heap.push(x);
\`\`\`

- [x] At the end
- [ ] At the root

> It's appended, then bubbles up.

## Remove

### heaps-002 · recall
Why move the last item to the top?

> It keeps the tree complete.
`;

const DATE = '2026-11-20';
const make = (reply: string, noteText = NOTE) => prepareQuiz({ noteRel: 'dsa/heaps.md', noteText, reply, date: DATE });
const inSync = (quiz: string, noteText: string) => compareSections(parseQuiz(quiz).meta, noteText).inSync;

describe('ids', () => {
  it('makes an id stem from the file name', () => {
    expect(idStem('dsa/Binary Heaps.md')).toBe('binary-heaps');
    expect(idStem('a/über_cool notes.md')).toBe('uber-cool-notes');
    expect(idStem('ქართული.md')).toBe('q'); // no latin letters
  });
  it('continues the ids a quiz already uses', () => {
    const ids = nextIds('x.md', ['dsa-001', 'dsa-014', 'dsa-014b', 'weird']);
    expect(ids.stem).toBe('dsa-');
    expect(ids.id(ids.next)).toBe('dsa-015');
    expect(nextIds('dsa/heaps.md', []).id(1)).toBe('heaps-001');
  });
});

describe('buildQuizPrompt', () => {
  it('asks for a new quiz: format, exact section names, ids, and the note', () => {
    const p = buildQuizPrompt({ noteRel: 'dsa/heaps.md', noteText: NOTE });
    expect(p).toContain(QUIZ_FORMAT);
    expect(p).toContain('- Heaps\n- Insert\n- Remove');
    expect(p).toContain('heaps-001, heaps-002');
    expect(p).toContain('````markdown');
    expect(p).toContain('<<<<<<<< NOTE\n# Heaps');
    expect(p).toContain('Move the last one up, then sink it.\n>>>>>>>> END OF NOTE');
  });

  it('asks an update for the changed and new sections only, with their current questions', () => {
    const quiz = make(QUIZ_BODY).text;
    const note2 = NOTE.replace('then sink it', 'then sift it down') + '\n## Build\n\nHeapify in O(n).\n';
    const p = buildQuizPrompt({ noteRel: 'dsa/heaps.md', noteText: note2, oldQuiz: quiz });
    expect(p).toContain('Changed sections (go over their questions):\n- Remove');
    expect(p).toContain('New sections (write questions for them):\n- Build');
    expect(p).toContain('New questions get new ids: heaps-003, heaps-004');
    expect(p).toContain("don't use them: heaps-001.");
    expect(p).toContain('<<<<<<<< CURRENT QUESTIONS\n## Remove\n\n### heaps-002 · recall');
    expect(p).not.toContain('Where does a new item go first?'); // an unchanged section's question
    expect(p).toContain('then sift it down');
  });

  it('shows a never-stamped quiz\'s questions as ones that stay', () => {
    const p = buildQuizPrompt({ noteRel: 'dsa/heaps.md', noteText: NOTE, oldQuiz: `---\nnote: dsa/heaps.md\n---\n\n${QUIZ_BODY}` });
    expect(p).toContain('New sections (write questions for them):\n- Heaps\n- Insert\n- Remove');
    expect(p).toContain('<<<<<<<< QUESTIONS THAT STAY\n## Insert');
    expect(p).not.toContain('CURRENT QUESTIONS');
    expect(p).toContain("don't use them: heaps-001, heaps-002.");
  });
});

describe('cleanReply', () => {
  it('takes the quiz out of a chat reply: chatter, the ````markdown wrapper and front matter go', () => {
    const reply = `Sure! Here's your quiz:\r\n\r\n\`\`\`\`markdown\r\n---\r\nnote: x\r\n---\r\n${QUIZ_BODY}\`\`\`\`\r\n\r\nGood luck!`;
    const { body, firstLine } = cleanReply(reply);
    expect(body).toBe(QUIZ_BODY.trimEnd());
    expect(firstLine).toBe(7); // "# Heaps" is line 7 of the reply
  });
  it('keeps a plain reply as it is', () => {
    expect(cleanReply(`\n${QUIZ_BODY}`)).toEqual({ body: QUIZ_BODY.trimEnd(), firstLine: 2 });
  });
  it('closes a ``` wrapper at its last fence, keeping code blocks inside', () => {
    expect(cleanReply(`\`\`\`markdown\n${QUIZ_BODY}\`\`\``).body).toContain('heap.push(x);\n```\n\n- [x] At the end');
  });
});

describe('prepareQuiz: a new quiz', () => {
  it('saves the reply stamped with the note, so it is in sync', () => {
    const res = make(`Here you go:\n\n\`\`\`\`markdown\n${QUIZ_BODY}\`\`\`\``);
    expect(res).toMatchObject({ ok: true, errors: [], warnings: [], questions: 2, written: 2, kept: 0, dropped: 0 });
    expect(res.text).toMatch(/^---\nnote: dsa\/heaps\.md\nnote-hash: [0-9a-f]{8}\nsynced: 2026-11-20\nsections:\n {2}- [0-9a-f]{8} Heaps\n/);
    expect(res.text.endsWith(QUIZ_BODY)).toBe(true);
    expect(inSync(res.text, NOTE)).toBe(true);
    expect(parseQuiz(res.text).errors).toEqual([]);
  });

  it('adds the title when the reply has none', () => {
    const res = make(QUIZ_BODY.replace('# Heaps\n\n', ''));
    expect(res.ok).toBe(true);
    expect(parseQuiz(res.text).title).toBe('Heaps');
  });

  it('reports problems with line numbers of the pasted reply', () => {
    const reply = `Intro chatter\n\n## Insert\n\n### a-1 · single\nQ?\n\n- [x] a\n- [x] b\n\n> e\n\n## Nope\n\n### a-2 · recall\nWhy?\n`;
    const res = make(reply);
    expect(res.ok).toBe(false);
    expect(res.text).toBe('');
    expect(res.errors).toEqual([
      'Line 5: a-1: single needs exactly 1 correct option, has 2',
      'Line 15: a-2: recall needs a model answer in a > blockquote',
      'Line 13: "## Nope" isn\'t a section of the note. Use one of: Heaps · Insert · Remove',
    ]);
  });

  it('needs at least one question', () => {
    expect(make('I can\'t help with that.').errors[0]).toMatch(/^No questions found/);
  });

  it('passes on warnings (a missing explanation)', () => {
    const res = make('## Insert\n\n### a-1 · input\nCost?\n\nAnswer: O(log n)\n');
    expect(res.ok).toBe(true);
    expect(res.warnings).toEqual(['Line 3: a-1: no > explanation']);
  });
});

describe('prepareQuiz: updating an out-of-date quiz', () => {
  const old = make(QUIZ_BODY).text;
  const note2 = NOTE.replace('then sink it', 'then sift it down') + '\n## Build\n\nHeapify in O(n).\n';
  const sync = (reply: string, extra: { keepAll?: boolean; noteText?: string } = {}) =>
    prepareQuiz({ noteRel: 'dsa/heaps.md', noteText: extra.noteText ?? note2, oldQuiz: old, reply, date: '2026-11-21', keepAll: extra.keepAll });

  it('keeps unchanged sections as they were, replaces changed ones, adds new ones, and stamps', () => {
    const reply = '## Remove\n\n### heaps-002 · recall\nWhy move the last item up?\n\n> Completeness.\n\n### heaps-003 · single\nThen?\n\n- [x] Sift down\n- [ ] Bubble up\n\n> Down.\n\n## Build\n\n### heaps-004 · input\nCost of heapify?\n\nAnswer: O(n)\n\n> Most nodes are near the bottom.\n';
    const res = sync(reply);
    expect(res).toMatchObject({ ok: true, errors: [], warnings: [], questions: 4, kept: 1, written: 3, dropped: 0 });
    const insert = QUIZ_BODY.slice(QUIZ_BODY.indexOf('## Insert'), QUIZ_BODY.indexOf('## Remove'));
    expect(res.text).toContain(insert); // byte for byte
    expect(res.text).not.toContain('It keeps the tree complete.'); // the old Remove question was replaced
    expect(res.text.indexOf('## Remove')).toBeLessThan(res.text.indexOf('## Build')); // note order
    expect(res.text).toContain('synced: 2026-11-21');
    expect(inSync(res.text, note2)).toBe(true);
    expect(parseQuiz(res.text).errors).toEqual([]);
  });

  it('drops the questions of removed sections', () => {
    const note3 = NOTE.replace(/## Remove[\s\S]*/, '');
    const res = sync('', { noteText: note3 });
    expect(res).toMatchObject({ ok: true, questions: 1, kept: 1, written: 0, dropped: 1 });
    expect(res.text).not.toContain('## Remove');
    expect(inSync(res.text, note3)).toBe(true);
  });

  it('"Keep the questions": marks the quiz up to date without a reply', () => {
    const res = sync('', { keepAll: true });
    expect(res).toMatchObject({ ok: true, questions: 2, kept: 2, written: 0, dropped: 0 });
    expect(res.text).toContain('It keeps the tree complete.');
    expect(inSync(res.text, note2)).toBe(true);
  });

  it('needs questions when sections changed', () => {
    expect(sync('').errors[0]).toMatch(/^No questions found for Remove, Build/);
  });

  it("won't reuse the id of a question that stays, ignores unchanged sections, and warns about drops", () => {
    const res = sync('## Insert\n\n### heaps-009 · recall\nX?\n\n> Y.\n\n## Build\n\n### heaps-001 · recall\nWhy O(n)?\n\n> Sum.\n');
    expect(res.errors).toEqual(['Line 10: id heaps-001 is already used by a question that stays. Give it a new id.']);
    expect(res.warnings).toEqual([
      "Skipped the reply's questions for Insert: that section didn't change, so the existing questions stay.",
      'The reply has no questions for "Remove": its 1 old question will be dropped.',
    ]);
  });

  it('keeps old questions under headings the note never had', () => {
    const odd = old.replace('## Remove', '## Old name');
    const res = prepareQuiz({ noteRel: 'dsa/heaps.md', noteText: NOTE, oldQuiz: odd, reply: '## Remove\n\n### heaps-003 · recall\nQ?\n\n> A.\n', date: DATE });
    expect(res.ok).toBe(true);
    expect(res.text).toContain('## Old name\n\n### heaps-002 · recall');
  });
});
