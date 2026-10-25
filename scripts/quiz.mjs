#!/usr/bin/env node
// Quiz files for notes: status, validation, fingerprint stamping, results summary.
// Run from the repo root: npm run quiz -- <command>. Format: quizzes/README.md.
//
//   status (default)          every note: quiz size, in sync / STALE (which sections) / missing
//   check [quiz…]             validate quiz files (all by default); exit 1 on errors
//   sections <note>           the note's section paths, for "## <section>" headings
//   stamp <quiz|note>…        after writing or syncing: record the note's current fingerprints
//   misses [--since DATE]     questions answered wrong in the app (from quizzes/results.jsonl)
//
// Options: --notes <dir> (default notes), --quizzes <dir> (default quizzes)
import fs from 'node:fs';
import path from 'node:path';
import { parseQuiz, noteSections, compareSections, stampQuiz, quizPathFor, notePathFor, isQuizFile } from '../quiz-format.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const NOTES = path.resolve(opt('--notes', 'notes'));
const QUIZZES = path.resolve(opt('--quizzes', 'quizzes'));
const since = opt('--since', '');
const [cmd = 'status', ...rest] = args;
const posix = (p) => p.split(path.sep).join('/');
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD, local time

function walk(dir, keep) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, keep));
    else if (keep(e.name)) out.push(full);
  }
  return out;
}
const notes = () => walk(NOTES, (n) => /\.md$/i.test(n) && !isQuizFile(n)).map((f) => posix(path.relative(NOTES, f))).sort();
const quizzes = () => walk(QUIZZES, isQuizFile).map((f) => posix(path.relative(QUIZZES, f))).sort();
const read = (f) => fs.readFileSync(f, 'utf8');

// Accepts a quiz path, a note path, or either relative to its root.
function resolveQuiz(arg) {
  const inside = (root) => {
    const r = posix(path.relative(root, path.resolve(arg)));
    return r.startsWith('..') || path.isAbsolute(r) ? null : r;
  };
  const p = posix(arg);
  return isQuizFile(p) ? inside(QUIZZES) ?? p : quizPathFor(inside(NOTES) ?? p);
}

function status() {
  const qs = new Set(quizzes());
  let problems = 0;
  const rows = [];
  for (const n of notes()) {
    const q = quizPathFor(n);
    if (!qs.has(q)) { rows.push([n, '-', 'no quiz']); continue; }
    qs.delete(q);
    const parsed = parseQuiz(read(path.join(QUIZZES, q)));
    const cmp = compareSections(parsed.meta, read(path.join(NOTES, n)));
    let state = cmp.inSync ? 'in sync' : 'STALE';
    if (!parsed.meta.noteHash) {
      problems++;
      state = 'not stamped yet (npm run quiz -- stamp <quiz>)';
    } else if (!cmp.inSync) {
      problems++;
      const parts = [];
      if (cmp.changed.length) parts.push(`changed: ${cmp.changed.join('; ')}`);
      if (cmp.added.length) parts.push(`new: ${cmp.added.join('; ')}`);
      if (cmp.removed.length) parts.push(`removed: ${cmp.removed.join('; ')}`);
      if (!parts.length) parts.push(parsed.meta.noteHash ? 'only formatting/blank lines changed' : 'never stamped');
      state += ` (${parts.join(' | ')})`;
    }
    if (parsed.errors.length) { problems++; state += ` · ${parsed.errors.length} format error(s), run check`; }
    rows.push([n, `${new Set(parsed.questions.map((x) => x.concept)).size} / ${parsed.questions.length}`, state]);
  }
  const w = Math.max(4, ...rows.map((r) => r[0].length));
  console.log(`${'note'.padEnd(w)}  ideas / questions  status`);
  for (const [n, c, s] of rows) console.log(`${n.padEnd(w)}  ${c.padStart(17)}  ${s}`);
  for (const orphan of qs) { problems++; console.log(`orphan quiz: quizzes/${orphan} (no notes/${notePathFor(orphan)})`); }
  return problems;
}

function check(files) {
  const list = files.length ? files.map(resolveQuiz) : quizzes();
  let bad = 0;
  for (const q of list) {
    const full = path.join(QUIZZES, q);
    if (!fs.existsSync(full)) { console.log(`✗ quizzes/${q}: not found`); bad++; continue; }
    const parsed = parseQuiz(read(full));
    const notePath = path.join(NOTES, notePathFor(q));
    const sectionPaths = fs.existsSync(notePath) ? new Set(noteSections(read(notePath)).map((s) => s.path)) : null;
    const extra = [];
    if (!sectionPaths) extra.push({ line: 1, msg: `note notes/${notePathFor(q)} not found` });
    else {
      for (const s of new Set(parsed.questions.map((x) => x.section))) {
        if (s && !sectionPaths.has(s)) extra.push({ line: parsed.questions.find((x) => x.section === s).line, msg: `section "${s}" is not in the note (renamed or removed?)` });
      }
    }
    if (parsed.meta.note && parsed.meta.note !== notePathFor(q)) extra.push({ line: 1, msg: `front matter note: ${parsed.meta.note} doesn't match the file path (${notePathFor(q)})` });
    const counts = Object.entries(parsed.questions.reduce((m, x) => ({ ...m, [x.type]: (m[x.type] || 0) + 1 }), {})).map(([t, c]) => `${c} ${t}`).join(', ');
    console.log(`${parsed.errors.length ? '✗' : '✓'} quizzes/${q}: ${new Set(parsed.questions.map((x) => x.concept)).size} ideas, ${parsed.questions.length} questions (${counts || 'none'})`);
    for (const e of parsed.errors) console.log(`    error   line ${e.line}: ${e.msg}`);
    for (const e of [...parsed.warnings, ...extra]) console.log(`    warning line ${e.line}: ${e.msg}`);
    if (parsed.errors.length) bad++;
  }
  return bad;
}

function sections(arg) {
  const full = path.resolve(arg);
  const file = fs.existsSync(full) ? full : path.join(NOTES, arg);
  for (const s of noteSections(read(file))) console.log(`${'  '.repeat(Math.max(0, s.level - 1))}${s.path}`);
}

function stamp(files) {
  let bad = 0;
  for (const arg of files) {
    const q = resolveQuiz(arg);
    const quizFile = path.join(QUIZZES, q);
    const noteRel = notePathFor(q);
    const noteFile = path.join(NOTES, noteRel);
    if (!fs.existsSync(quizFile) || !fs.existsSync(noteFile)) { console.log(`✗ ${q}: quiz or note missing`); bad++; continue; }
    const text = read(quizFile);
    const parsed = parseQuiz(text);
    if (parsed.errors.length) { console.log(`✗ quizzes/${q}: fix ${parsed.errors.length} format error(s) first (npm run quiz -- check ${q})`); bad++; continue; }
    fs.writeFileSync(quizFile, stampQuiz(text, noteRel, read(noteFile), today()));
    console.log(`✓ stamped quizzes/${q} (${parsed.questions.length} questions) against notes/${noteRel}`);
  }
  return bad;
}

function misses() {
  const log = path.join(QUIZZES, 'results.jsonl');
  if (!fs.existsSync(log)) { console.log('No results yet (quizzes/results.jsonl is written by the app).'); return 0; }
  const stats = new Map();
  for (const line of read(log).split('\n')) {
    if (!line.trim()) continue;
    let run;
    try { run = JSON.parse(line); } catch { continue; }
    if (since && String(run.at).slice(0, 10) < since) continue;
    for (const a of run.answers || []) {
      const s = stats.get(a.q) || { attempts: 0, wrong: 0, last: '', lastAt: '' };
      s.attempts++;
      if (a.r !== 'right') s.wrong += a.r === 'partly' ? 0.5 : 1;
      s.last = a.r;
      s.lastAt = String(run.at).slice(0, 10);
      stats.set(a.q, s);
    }
  }
  const prompts = new Map();
  for (const q of quizzes()) {
    for (const x of parseQuiz(read(path.join(QUIZZES, q))).questions) prompts.set(`${q}#${x.id}`, x);
  }
  const rows = [...stats].filter(([, s]) => s.wrong > 0).sort((a, b) => b[1].wrong - a[1].wrong || (a[1].lastAt < b[1].lastAt ? 1 : -1));
  if (!rows.length) { console.log('No misses. 🎉'); return 0; }
  for (const [key, s] of rows) {
    const q = prompts.get(key);
    const first = q ? q.prompt.split('\n')[0].slice(0, 100) : '(question no longer exists)';
    console.log(`${key}  missed ${s.wrong}/${s.attempts}, last ${s.last} on ${s.lastAt}${q ? `  [${q.section}]` : ''}\n    ${first}`);
  }
  return 0;
}

const commands = { status: () => status(), check: () => check(rest), sections: () => sections(rest[0]), stamp: () => stamp(rest), misses };
if (!commands[cmd]) {
  console.log('usage: npm run quiz -- [status | check [quiz…] | sections <note> | stamp <quiz|note>… | misses [--since YYYY-MM-DD]]');
  process.exit(2);
}
process.exitCode = commands[cmd]() ? 1 : 0;
