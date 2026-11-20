// Making quiz files with any AI chat: the prompt to copy, and turning the pasted reply into a
// checked, stamped quiz file. Shared by the main process and the tests, so (like quiz-format.js)
// it has no Node or DOM imports. Nothing here writes files: main.js does that.
//
// New quiz: the reply is the whole quiz. Out-of-sync quiz: the reply only has questions for the
// sections that changed or were added; every other section keeps its questions as they are,
// byte for byte, and questions from removed sections are dropped. Either way the result is
// stamped with the note's current fingerprints (stampQuiz), so the app sees it as in sync.
import { parseQuiz, noteSections, compareSections, stampQuiz } from './quiz-format.js';

const FRONT = /^---\n([\s\S]*?)\n---\n?/;
const FENCE = /^\s{0,3}(```|~~~)/; // same rule as quiz-format.js
const WRAPPER = /^(`{3,}|~{3,})\s*(?:markdown|md)?\s*$/i;

const normalize = (text) => String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');

// ---------- the prompt ----------

export const QUIZ_FORMAT = `Quiz format:

# <note title>

## <section name>

### <id> · <type>
<the question: any markdown, code blocks allowed>

<answer part, depends on the type>

> <explanation>

Types and their answer part:
- single: 2 to 5 options, one per line: "- [ ] wrong answer" and "- [x] right answer", exactly one [x]. Options get shuffled, so never "all of the above".
- multi: the same, with one or more [x]. Say "(pick all that apply)" in the question.
- input: one line "Answer: <answer> | <another accepted spelling> | ...". Matching ignores case, spaces, backticks, quotes, brackets and a final period; commas count. If case matters, use single instead.
- recall: no answer part; the > blockquote is the model answer (2 to 4 sentences). For "explain why / how / compare" questions.

Rules:
- Every question ends with a > blockquote (every line of it starts with "> "), and nothing comes after it.
- Inside a question: the prompt first, then the options or Answer:, then the blockquote.
- Variants: to ask the same idea a second way, reuse its id with a letter: css-003, css-003b. A quiz asks one variant per idea.
- No front matter (--- ... ---): the app adds it.

Example (a made-up note):

# Box model

## Box model > box-sizing

### css-001 · single
A card has \`width: 200px; padding: 20px; border: 1px solid\`. With \`box-sizing: border-box\`, how wide is it on screen?

- [ ] 242px
- [x] 200px
- [ ] 240px

> With \`border-box\`, \`width\` already includes padding and border, so the box stays 200px. 242px is the \`content-box\` answer (200 + 2×20 + 2×1).

### css-002 · input
Which \`box-sizing\` value makes \`width\` include padding and border?

Answer: border-box

> \`border-box\`. The default, \`content-box\`, adds padding and border on top of \`width\`.

### css-001b · recall
Why do most CSS resets set \`box-sizing: border-box\` on everything?

> So \`width\` is the size you see: padding and border eat into the content instead of growing the box, and layouts stop overflowing when you add padding.`;

const GOOD_QUESTIONS = `What makes a good question here:
- One question per idea worth remembering: usually 2 to 4 per section, more for dense sections, none for sections with nothing to test (links, references, a one-line intro).
- Test understanding, not wording: why, when, what happens if, which one fits. No trivia, no "what did the note say".
- Mix the types: mostly single and recall; multi when several things are really true; input only for a short exact answer (a term, a number, a Big-O).
- Wrong options are real misconceptions, not jokes, and about as long as the right one.
- Each explanation says why the right answer is right and why the most tempting wrong one is wrong.
- Stick to what the note says; if the note looks wrong somewhere, skip that point.
- Write in the language the note is written in.`;

const REPLY_SHAPE = 'Reply with only the quiz, inside one code block that opens with ````markdown (four backticks) and closes with ```` so the code blocks inside it survive. No comments before or after.';

const fenced = (label, text) => `<<<<<<<< ${label}\n${text.trim()}\n>>>>>>>> END OF ${label}`;
const bullets = (items) => items.map((s) => `- ${s}`).join('\n');

// Id stem from the note's file name: "dsa/Binary Heaps.md" → "binary-heaps".
export function idStem(noteRel) {
  const base = String(noteRel).split('/').pop().replace(/\.md$/i, '');
  const slug = base.normalize('NFKD').toLowerCase().replace(/[^a-z0-9\s_-]/g, '').trim()
    .replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 16).replace(/^-|-$/g, '');
  return slug || 'q';
}

// The next free ids for a quiz: the stem its ids already use (or the file name's), and the
// number after the highest one. → { stem: 'dsa-', next: 15, id(n) }
export function nextIds(noteRel, ids) {
  const counts = new Map();
  let max = 0;
  for (const id of ids) {
    const m = id.match(/^(.*?)(\d+)[a-z]?$/);
    if (!m) continue;
    counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    max = Math.max(max, Number(m[2]));
  }
  const stem = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? `${idStem(noteRel)}-`;
  return { stem, next: max + 1, id: (n) => `${stem}${String(n).padStart(3, '0')}` };
}

// What syncing a quiz needs: which sections changed, and which questions stay.
function syncPlan(noteText, oldQuiz, keepAll = false) {
  const old = parseQuiz(oldQuiz);
  const cmp = compareSections(old.meta, noteText);
  const replace = new Set(keepAll ? cmp.removed : [...cmp.changed, ...cmp.removed]);
  const wanted = new Set(keepAll ? [] : [...cmp.changed, ...cmp.added]);
  const kept = old.questions.filter((q) => !replace.has(q.section));
  return { old, cmp, replace, wanted, kept };
}

// The text to paste into an AI chat. Without an old quiz: write a quiz for the note. With one
// that's out of sync: write questions for the changed and new sections only.
export function buildQuizPrompt({ noteRel, noteText, oldQuiz = null }) {
  const sections = noteSections(noteText).map((s) => s.path);
  const note = fenced('NOTE', normalize(noteText));
  if (oldQuiz == null) {
    const ids = nextIds(noteRel, []);
    return [
      `I'm studying with a quiz app. Write a quiz for my note "${noteRel}" (at the end), in the app's quiz format.`,
      GOOD_QUESTIONS,
      QUIZ_FORMAT,
      `Use these section names for the "## " headings, copied exactly (a " > " in a name is part of it):\n${bullets(sections)}`,
      `Ids: ${ids.id(1)}, ${ids.id(2)}, ${ids.id(3)}, and so on.`,
      REPLY_SHAPE,
      note,
    ].join('\n\n');
  }

  const { old, cmp, kept } = syncPlan(noteText, oldQuiz);
  const ids = nextIds(noteRel, old.questions.map((q) => q.id));
  const { blocks } = splitBody(bodyOf(oldQuiz));
  const asBlocks = (sections) => blocks.filter((b) => sections.includes(b.section)).map((b) => [`## ${b.section}`, ...b.lines].join('\n')).join('\n\n');
  const current = asBlocks(cmp.changed);
  const staying = asBlocks(cmp.added); // a quiz that was never stamped: its sections all count as new
  const parts = [
    `I'm studying with a quiz app, and I changed my note "${noteRel}" (at the end) since its quiz was written. Update the quiz for the parts that changed.`,
  ];
  if (cmp.changed.length) parts.push(`Changed sections (go over their questions):\n${bullets(cmp.changed)}`);
  if (cmp.added.length) parts.push(`New sections (write questions for them):\n${bullets(cmp.added)}`);
  parts.push([
    'Reply with questions for these sections only, each under its "## " heading. The questions of the other sections are kept as they are, so leave them out.',
    cmp.changed.length ? '- For a changed section, give its complete new set of questions: keep the ones below that are still right (same id), fix the ones the change made wrong (same id if it still tests the same idea), drop the ones that no longer apply, and add questions for new material.' : '',
    `- New questions get new ids: ${ids.id(ids.next)}, ${ids.id(ids.next + 1)}, and so on.`,
    kept.length ? `- These ids belong to questions that stay, so don't use them: ${kept.map((q) => q.id).join(', ')}.` : '',
  ].filter(Boolean).join('\n'));
  parts.push(GOOD_QUESTIONS, QUIZ_FORMAT, REPLY_SHAPE);
  if (current.trim()) parts.push(`The current questions of the changed sections:\n\n${fenced('CURRENT QUESTIONS', current)}`);
  if (staying.trim()) parts.push(`The new sections already have these questions. They stay, so don't repeat them; only add what they miss:\n\n${fenced('QUESTIONS THAT STAY', staying)}`);
  parts.push(note);
  return parts.join('\n\n');
}

// ---------- the reply ----------

// The quiz inside an AI chat reply: drops any chatter before it, the ````markdown wrapper and a
// front matter block. → { body, firstLine } (firstLine: the reply's line number of body's first line)
export function cleanReply(reply) {
  const lines = normalize(reply).split('\n');
  let start = lines.findIndex((l) => WRAPPER.test(l) || /^(?:---\s*$|#{1,3}\s)/.test(l));
  if (start < 0) start = 0;
  let end = lines.length;
  const wrap = lines[start].match(WRAPPER);
  if (wrap) {
    const close = new RegExp(`^${wrap[1][0] === '`' ? '`' : '~'}{${wrap[1].length},}\\s*$`);
    let j = lines.length - 1;
    while (j > start && !close.test(lines[j])) j--;
    if (j > start) end = j;
    start++;
  }
  let body = lines.slice(start, end).join('\n');
  const front = body.match(FRONT);
  if (front) {
    start += front[0].split('\n').length - 1;
    body = body.slice(front[0].length);
  }
  return { body: body.replace(/\s+$/, ''), firstLine: start + 1 };
}

const bodyOf = (quizText) => normalize(quizText).replace(FRONT, '');

// A quiz body split at its "## section" headings (outside code fences).
function splitBody(body) {
  const head = [];
  const blocks = [];
  let cur = null;
  let fence = null;
  body.split('\n').forEach((line, i) => {
    const f = line.match(FENCE);
    if (f) fence = fence === null ? f[1] : fence === f[1] ? null : fence;
    else if (fence === null && /^##\s/.test(line)) {
      cur = { section: line.replace(/^##\s+/, '').trim(), lines: [], line: i };
      blocks.push(cur);
      return;
    }
    (cur ? cur.lines : head).push(line);
  });
  return { head, blocks };
}

const trimBlank = (lines) => {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
};

const noteTitle = (noteRel, noteText) => {
  const h1 = normalize(noteText).match(/^#\s+(.+?)\s*#*\s*$/m);
  return h1 ? h1[1].replace(/[*_`]/g, '').trim() : String(noteRel).split('/').pop().replace(/\.md$/i, '');
};

// Check a pasted reply and build the quiz file from it.
//   noteRel, noteText: the note; oldQuiz: its current quiz file (null for a new quiz);
//   reply: what was pasted; date: YYYY-MM-DD; keepAll: sync without a reply (the questions
//   are still right): keep every question except those of removed sections.
// → { ok, text, errors: string[], warnings: string[], questions, kept, written, dropped }
export function prepareQuiz({ noteRel, noteText, oldQuiz = null, reply = '', date, keepAll = false }) {
  const errors = [];
  const warnings = [];
  const paths = new Set(noteSections(noteText).map((s) => s.path));

  // The reply, parsed under a stand-in front matter (3 lines), with line numbers mapped back.
  const { body, firstLine } = keepAll ? { body: '', firstLine: 1 } : cleanReply(reply);
  const parsed = parseQuiz(`---\nnote: -\n---\n${body}`);
  const at = (n) => n - 4 + firstLine;
  const msg = (p) => `Line ${at(p.line)}: ${p.msg.replace(/\(line (\d+)\)/g, (_, n) => `(line ${at(Number(n))})`)}`;
  errors.push(...parsed.errors.map(msg));
  warnings.push(...parsed.warnings.filter((w) => !/not under a ## section/.test(w.msg)).map(msg));
  for (const q of parsed.questions) {
    if (!q.section) errors.push(`Line ${at(q.line)}: ${q.id} isn't under a "## section" heading`);
  }
  const replyBlocks = splitBody(body).blocks;
  for (const b of replyBlocks) {
    if (!paths.has(b.section)) errors.push(`Line ${firstLine + b.line}: "## ${b.section}" isn't a section of the note. Use one of: ${[...paths].join(' · ')}`);
  }
  const result = (text, counts) => ({ ok: !errors.length, text: errors.length ? '' : text, errors, warnings, ...counts });

  if (oldQuiz == null) {
    if (!parsed.questions.length && !errors.length) errors.push('No questions found. Paste the whole reply: it starts with "# <title>" or the first "## <section>".');
    const title = parsed.title ? '' : `# ${noteTitle(noteRel, noteText)}\n\n`;
    const text = stampQuiz(`${title}${body.replace(/^\s+/, '')}\n`, noteRel, noteText, date);
    const n = parsed.questions.length;
    return result(text, { questions: n, kept: 0, written: n, dropped: 0 });
  }

  const { old, cmp, replace, wanted, kept } = syncPlan(noteText, oldQuiz, keepAll);
  const fresh = parsed.questions.filter((q) => wanted.has(q.section));
  if (!keepAll && wanted.size && !fresh.length && !errors.length) {
    errors.push(`No questions found for ${[...wanted].join(', ')}. Paste the whole reply, or use "Keep the questions" if they're still right.`);
  }
  const ignored = [...new Set(parsed.questions.filter((q) => paths.has(q.section) && !wanted.has(q.section)).map((q) => q.section))];
  if (ignored.length) warnings.push(`Skipped the reply's questions for ${ignored.join(', ')}: ${ignored.length === 1 ? 'that section' : 'those sections'} didn't change, so the existing questions stay.`);
  const keptIds = new Set(kept.map((q) => q.id));
  for (const q of fresh) {
    if (keptIds.has(q.id)) errors.push(`Line ${at(q.line)}: id ${q.id} is already used by a question that stays. Give it a new id.`);
  }
  for (const section of cmp.changed) {
    const before = old.questions.filter((q) => q.section === section).length;
    if (!keepAll && before && !fresh.some((q) => q.section === section)) {
      warnings.push(`The reply has no questions for "${section}": its ${before} old question${before === 1 ? '' : 's'} will be dropped.`);
    }
  }

  // Merge: note order, then any old sections the note never had (kept as they are).
  const group = (blocks) => {
    const map = new Map();
    for (const b of blocks) map.set(b.section, [...(map.get(b.section) || []), ...trimBlank(b.lines), '']);
    return map;
  };
  const was = splitBody(bodyOf(oldQuiz));
  const oldBlocks = group(was.blocks);
  const newBlocks = group(replyBlocks.filter((b) => wanted.has(b.section)));
  const order = [...paths, ...[...oldBlocks.keys()].filter((s) => !paths.has(s))];
  const head = trimBlank(was.head);
  const out = head.some((l) => /^#\s/.test(l)) ? [...head, ''] : [`# ${noteTitle(noteRel, noteText)}`, ''];
  for (const section of order) {
    const lines = [
      ...(!replace.has(section) ? oldBlocks.get(section) || [] : []),
      ...(wanted.has(section) ? newBlocks.get(section) || [] : []),
    ];
    if (trimBlank(lines).length) out.push(`## ${section}`, '', ...trimBlank(lines), '');
  }
  const text = stampQuiz(`${trimBlank(out).join('\n')}\n`, noteRel, noteText, date);
  const freshIds = new Set(fresh.map((q) => q.id));
  const dropped = old.questions.filter((q) => replace.has(q.section) && !freshIds.has(q.id)).length;
  return result(text, { questions: parseQuiz(text).questions.length, kept: kept.length, written: fresh.length, dropped });
}
