// Quiz files: parsing, validation, and note fingerprints. Shared by the app (main + renderer)
// and the `npm run quiz` CLI, so it has no Node or DOM imports. Format: quizzes/README.md.
//
// A note's sections are fingerprinted (FNV-1a over the section's own lines), and a quiz file
// stores the fingerprints it was written against. Comparing them tells which sections changed.

const FENCE = /^\s{0,3}(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export const QUESTION_TYPES = ['single', 'multi', 'input', 'recall'];

// Variants: rewordings of one idea share an id stem plus a letter (dsa-014, dsa-014b, dsa-014c).
// A quiz asks at most one variant of each idea.
export const conceptOf = (id) => id.match(/^(.*\d)[a-z]$/)?.[1] ?? id;

// 32-bit FNV-1a → 8 hex chars. Only used to notice changes, not for security.
export function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// CRLF and trailing spaces don't count as changes.
const normalizeLines = (text) => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd());

export const quizPathFor = (noteRel) => noteRel.replace(/\.md$/i, '') + '.quiz.md';
export const notePathFor = (quizRel) => quizRel.replace(/\.quiz\.md$/i, '.md');
export const isQuizFile = (name) => /\.quiz\.md$/i.test(name);

// Headings outside code fences: [{ level, text, line }]
function headingsOf(lines) {
  const out = [];
  let fence = null;
  lines.forEach((line, i) => {
    const f = line.match(FENCE);
    if (f) { fence = fence === null ? f[1] : fence === f[1] ? null : fence; return; }
    if (fence !== null) return;
    const m = line.match(HEADING);
    if (m) out.push({ level: m[1].length, text: m[2].replace(/[*_`➕]/g, '').replace(/\s+/g, ' ').trim(), line: i }); // ➕ marks don't count
  });
  return out;
}

// A note's sections: [{ path, level, line, hash }]. The path is the chain of headings,
// e.g. "Linked Lists > Types". A note's single top-level H1 is its title: it names the intro
// section but isn't repeated in every path. Text before the first heading is "(intro)".
export function noteSections(noteText) {
  const lines = normalizeLines(noteText);
  const hs = headingsOf(lines);
  const titleH1 = hs.length > 0 && hs[0].level === 1 && hs.filter((h) => h.level === 1).length === 1;
  const sections = [];
  const seen = new Map();
  const add = (path, level, start, end) => {
    const n = (seen.get(path) || 0) + 1;
    seen.set(path, n);
    const body = lines.slice(start, end).join('\n').trim();
    sections.push({ path: n > 1 ? `${path} (${n})` : path, level, line: start, hash: fingerprint(body) });
  };
  if (!hs.length || hs[0].line > 0) {
    const end = hs.length ? hs[0].line : lines.length;
    if (lines.slice(0, end).some((l) => l.trim())) add('(intro)', 0, 0, end);
  }
  const stack = [];
  hs.forEach((h, i) => {
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    stack.push(h);
    const chain = stack.filter((s) => !(titleH1 && s.level === 1 && s === hs[0] && h !== hs[0]));
    add(chain.map((s) => s.text).join(' > '), h.level, h.line, i + 1 < hs.length ? hs[i + 1].line : lines.length);
  });
  return sections;
}

export const noteFingerprint = (noteText) => fingerprint(normalizeLines(noteText).join('\n').trim());

// ---------- quiz files ----------

const FRONT = /^---\n([\s\S]*?)\n---\n?/;
const Q_HEAD = /^###\s+(\S+)\s*[·|]\s*(\S+)\s*$/;
const OPTION = /^[-*]\s+\[([ xX])\]\s+(.+)$/;
const ANSWER = /^Answer:\s*(.*)$/;

function parseFront(block) {
  const meta = { note: '', noteHash: '', synced: '', sections: [] };
  let inSections = false;
  for (const line of block.split('\n')) {
    const item = line.match(/^\s+-\s+([0-9a-f]{8})\s+(.+)$/);
    if (inSections && item) { meta.sections.push({ hash: item[1], path: item[2].trim() }); continue; }
    inSections = false;
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    if (key === 'note') meta.note = value.trim();
    else if (key === 'note-hash') meta.noteHash = value.trim();
    else if (key === 'synced') meta.synced = value.trim();
    else if (key === 'sections') inSections = true;
  }
  return meta;
}

// → { meta, title, questions: [{ id, type, section, prompt, options: [{ text, correct }],
//      answers: [string], explain, line }], errors: [{ line, msg }], warnings: [{ line, msg }] }
// Line numbers are 1-based, for messages.
export function parseQuiz(text) {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n'); // a BOM (PowerShell 5.1, Notepad) would hide the front matter
  const front = src.match(FRONT);
  const meta = front ? parseFront(front[1]) : parseFront('');
  const offset = front ? front[0].split('\n').length - 1 : 0;
  const lines = src.slice(front ? front[0].length : 0).split('\n');
  const errors = [];
  const warnings = [];
  const questions = [];
  if (!front) errors.push({ line: 1, msg: 'missing front matter (--- note: … ---)' });

  let title = '';
  let section = '';
  let cur = null;
  let fence = null;
  const finish = () => { if (cur) questions.push(buildQuestion(cur, errors, warnings)); cur = null; };

  lines.forEach((line, i) => {
    const lineNo = i + 1 + offset;
    const f = line.match(FENCE);
    if (f) fence = fence === null ? f[1] : fence === f[1] ? null : fence;
    else if (fence === null) {
      if (/^#\s/.test(line)) { finish(); title = line.replace(/^#\s+/, '').trim(); return; }
      if (/^##\s/.test(line)) { finish(); section = line.replace(/^##\s+/, '').trim(); return; }
      if (/^###\s/.test(line)) {
        finish();
        const m = line.match(Q_HEAD);
        if (!m) { errors.push({ line: lineNo, msg: `bad question heading "${line}" (expected "### <id> · <type>")` }); cur = { skip: true, lines: [] }; return; }
        cur = { id: m[1], type: m[2].toLowerCase(), section, line: lineNo, lines: [] };
        return;
      }
    }
    if (cur) cur.lines.push({ text: line, inFence: fence !== null || Boolean(f), lineNo });
  });
  finish();

  const ok = [];
  const ids = new Set();
  for (const q of questions) {
    if (!q) continue;
    if (ids.has(q.id)) { errors.push({ line: q.line, msg: `duplicate id ${q.id}` }); continue; }
    ids.add(q.id);
    ok.push(q);
  }
  return { meta, title, questions: ok, errors, warnings };
}

function buildQuestion(cur, errors, warnings) {
  if (cur.skip) return null;
  const { id, type, line } = cur;
  const err = (msg) => { errors.push({ line, msg: `${id}: ${msg}` }); return null; };
  if (!QUESTION_TYPES.includes(type)) return err(`unknown type "${type}" (${QUESTION_TYPES.join(', ')})`);

  // The explanation is the last top-level blockquote.
  const body = cur.lines.slice();
  while (body.length && !body[body.length - 1].text.trim()) body.pop();
  const explainLines = [];
  while (body.length && !body[body.length - 1].inFence && /^>/.test(body[body.length - 1].text)) {
    explainLines.unshift(body.pop().text.replace(/^>\s?/, ''));
  }
  const prompt = [];
  const options = [];
  const answers = [];
  let structural = false;
  for (const l of body) {
    if (!l.inFence) {
      const o = l.text.match(OPTION);
      if (o) { structural = true; options.push({ text: o[2].trim(), correct: o[1] !== ' ' }); continue; }
      const a = l.text.match(ANSWER);
      if (a) { structural = true; answers.push(...a[1].split(/\s+\|\s+/).map((s) => s.trim()).filter(Boolean)); continue; }
    }
    if (structural) {
      if (l.text.trim()) return err(`text after the options/answer (line ${l.lineNo}); the prompt goes first, the > explanation last`);
      continue;
    }
    prompt.push(l.text);
  }
  const promptText = prompt.join('\n').trim();
  const explain = explainLines.join('\n').trim();
  if (!promptText) return err('empty question');

  const correct = options.filter((o) => o.correct).length;
  if (type === 'single' || type === 'multi') {
    if (options.length < 2) return err('needs at least 2 options (- [ ] / - [x])');
    if (type === 'single' && correct !== 1) return err(`single needs exactly 1 correct option, has ${correct}`);
    if (type === 'multi' && correct < 1) return err('multi needs at least 1 correct option');
    if (answers.length) return err('Answer: is only for input questions');
  } else {
    if (options.length) return err(`${type} questions don't take options`);
    if (type === 'input' && !answers.length) return err('input needs "Answer: a | b"');
    if (type === 'recall' && answers.length) return err('recall: put the model answer in the > blockquote, not Answer:');
    if (type === 'recall' && !explain) return err('recall needs a model answer in a > blockquote');
  }
  if (!explain) warnings.push({ line, msg: `${id}: no > explanation` });
  if (!cur.section) warnings.push({ line, msg: `${id}: not under a ## section` });
  return { id, concept: conceptOf(id), type, section: cur.section, prompt: promptText, options, answers, explain, line };
}

// Which of the note's sections changed since the quiz was synced.
export function compareSections(quizMeta, noteText) {
  const now = noteSections(noteText);
  const then = new Map(quizMeta.sections.map((s) => [s.path, s.hash]));
  const nowMap = new Map(now.map((s) => [s.path, s.hash]));
  return {
    inSync: quizMeta.noteHash === noteFingerprint(noteText),
    changed: now.filter((s) => then.has(s.path) && then.get(s.path) !== s.hash).map((s) => s.path),
    added: now.filter((s) => !then.has(s.path)).map((s) => s.path),
    removed: quizMeta.sections.filter((s) => !nowMap.has(s.path)).map((s) => s.path),
    sections: now,
  };
}

// Rewrite the front matter with the note's current fingerprints (after generating / syncing).
export function stampQuiz(quizText, noteRel, noteText, date) {
  const src = quizText.replace(/\r\n?/g, '\n');
  const front = src.match(FRONT);
  const rest = front ? src.slice(front[0].length) : src;
  const keep = front ? front[1].split('\n').filter((l, i, all) => {
    if (/^(note|note-hash|synced|sections):/.test(l)) return false;
    // drop the old "  - <hash> <path>" lines under sections:
    const prev = all.slice(0, i).reverse().find((x) => !/^\s+-\s/.test(x));
    return !(/^\s+-\s/.test(l) && prev && /^sections:/.test(prev));
  }) : [];
  const sections = noteSections(noteText).map((s) => `  - ${s.hash} ${s.path}`);
  const head = [`note: ${noteRel}`, `note-hash: ${noteFingerprint(noteText)}`, `synced: ${date}`, ...keep, 'sections:', ...sections];
  return `---\n${head.join('\n')}\n---\n${rest.startsWith('\n') ? '' : '\n'}${rest}`;
}

// Typed answers: case, spaces, backticks, quotes, brackets and a trailing period don't matter,
// so "O(log n)" = "o(logn)", "`jsonb`" = "jsonb" and "{3, 4}" = "[3,4]" = "3,4". Commas do.
export const normalizeAnswer = (s) => String(s).toLowerCase().replace(/[`'"*_()[\]{}]/g, '').replace(/\s+/g, '').replace(/\.$/, '');
export const answerMatches = (given, accepted) => accepted.some((a) => normalizeAnswer(a) === normalizeAnswer(given));
