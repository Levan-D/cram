// Quiz state and flow: start screen (scope + settings), one question at a time, results.
// Questions come from quizzes/<note>.quiz.md via the main process (already rendered to HTML);
// answers are checked here and each finished quiz is logged to quizzes/results.jsonl.
// A quiz in progress survives leaving the page: it minimizes into a box above the sidebar
// footer with its timer paused, until you finish it or stop it.
import { create } from 'zustand';
import { api, type QuizData, type QuizPrefs, type QuizQuestion, type QuizResult } from './api';
import { answerMatches, type QuestionType } from '../quiz-format.js';
import { useApp } from './store';
import { toast, openNoteAtSection, closeFindbar, setTocPopover, NARROW, setDrawer, hooks } from './actions';
import { ask } from './ui/Ask';
import { chooseQuestions, ideasOf, lastSection, noteName, plainText, shuffle } from './lib/quiz-logic';
import { errMsg } from './lib/text';

export const TYPES: QuestionType[] = ['single', 'multi', 'input', 'recall'];
export const DEFAULT_PREFS: QuizPrefs = { count: 10, seconds: 0, types: [], order: 'random' };

export interface ScopeOption { kind: 'note' | 'folder'; rel: string; label: string }
export interface RunQuestion extends QuizQuestion { shown: { html: string; correct: boolean; i: number }[] }
export interface Answer { q: string; r: QuizResult; ms: number; given: string; question: RunQuestion }

export interface Run {
  questions: RunQuestion[];
  index: number;
  answers: Answer[];
  seconds: number;
  startedAt: number;
  done: boolean;
  logged: boolean;
  // the question on screen
  picked: number[];
  given: string;           // text typed into the answer box
  answered: QuizResult | null;
  revealed: boolean;       // recall: model answer shown
  timedOut: boolean;
  qStartedAt: number;
  recallMs: number;        // recall: time until reveal
  ends: number | null;     // timer deadline while running
  paused: number | null;   // ms left while the quiz is minimized / a dialog is open
}

export type QuizView = 'closed' | 'start' | 'question' | 'results';

interface QuizStore {
  view: QuizView;
  shown: boolean; // the quiz page is on screen (otherwise closed or minimized)
  scope: { options: ScopeOption[]; current: ScopeOption } | null;
  data: QuizData | null;
  run: Run | null;
}

export const useQuiz = create<QuizStore>()(() => ({ view: 'closed', shown: false, scope: null, data: null, run: null }));
const get = useQuiz.getState;
const set = useQuiz.setState;
const patchRun = (patch: Partial<Run>) => { const r = get().run; if (r) set({ run: { ...r, ...patch } }); };

export const quizPrefs = (): QuizPrefs => ({ ...DEFAULT_PREFS, ...(useApp.getState().prefs.quiz || {}) });
export const enabledTypes = (): QuestionType[] => { const t = quizPrefs().types; return t.length ? t : TYPES; };
export const active = () => { const r = get().run; return Boolean(r && !r.done); };
export const current = () => { const r = get().run!; return r.questions[r.index]!; };
const progressText = () => { const r = get().run!; return `You've answered ${r.answers.length} of ${r.questions.length}`; };

export function scopeOptions(kind: 'note' | 'folder', rel: string): ScopeOption[] {
  const opts: ScopeOption[] = [];
  if (kind === 'note') {
    opts.push({ kind: 'note', rel, label: 'This note' });
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    if (dir) opts.push({ kind: 'folder', rel: dir, label: `Folder: ${dir.split('/').pop()}` });
  } else if (rel) {
    opts.push({ kind: 'folder', rel, label: `Folder: ${rel.split('/').pop()}` });
  }
  opts.push({ kind: 'folder', rel: '', label: 'All notes' });
  return opts;
}

export function eligible(): QuizQuestion[] {
  const types = enabledTypes();
  return (get().data?.questions || []).filter((q) => types.includes(q.type));
}

// ---------- opening / showing ----------

// Open the start page for a note / folder. With a quiz already running: resume it, or stop it first.
export async function openQuiz(kind: 'note' | 'folder', rel: string) {
  if (active()) {
    const choice = await ask({
      title: 'A quiz is in progress',
      text: `${progressText()}. Finish it or stop it before starting another one.`,
      icon: 'quiz',
      actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'stop', label: 'Stop it and start new' }, { id: 'resume', label: 'Resume quiz', primary: true }],
    });
    if (choice === 'resume') { showQuiz(); return; }
    if (choice !== 'stop') return;
    endRun();
  }
  const options = scopeOptions(kind, rel);
  set({ scope: { options, current: options[0]! } });
  await loadScope(options[0]!);
  if (get().view === 'start') showQuiz();
}

export async function loadScope(target: ScopeOption) {
  const scope = get().scope;
  if (!scope) return;
  let data: QuizData;
  try { data = await api.quizLoad(target.kind, target.rel); } catch (err) { toast(`Couldn't load quizzes: ${errMsg(err)}`); return; }
  set({ scope: { ...scope, current: target }, data, run: null, view: 'start' });
}

export function showQuiz() {
  if (get().view === 'closed') return;
  closeFindbar();
  setTocPopover(false);
  if (NARROW()) setDrawer(false);
  useApp.setState({ unresolvedOpen: false });
  const r = get().run;
  set({ shown: true });
  if (get().view === 'question' && r && r.paused != null) patchRun({ ends: Date.now() + r.paused, paused: null });
}

// Leave the page: a running quiz minimizes (timer paused), finished results wait in the same
// box (so you can read up on a miss and come back); the start page just closes.
export function hideQuiz() {
  if (!get().shown) return;
  if (active()) { pauseTimer(); set({ shown: false }); }
  else if (get().view === 'results') set({ shown: false });
  else set({ shown: false, view: 'closed', run: null });
}

// Drop the quiz entirely (changing the notes folder, closing finished results). A quiz in
// progress logs what was answered.
export function closeQuiz() {
  if (active()) endRun();
  set({ view: 'closed', shown: false, run: null, scope: null, data: null });
}

// The quiz files changed on disk (Claude wrote or re-synced one): refresh the start page.
export async function quizzesChanged() {
  const t = get().scope?.current;
  if (t && get().view === 'start') await loadScope(t);
}

hooks.openQuiz = openQuiz;
hooks.hideQuiz = hideQuiz;
hooks.closeQuiz = closeQuiz;

function pauseTimer() {
  const r = get().run;
  if (r?.ends != null) patchRun({ paused: Math.max(0, r.ends - Date.now()), ends: null });
}
function resumeTimer() {
  const r = get().run;
  if (r?.paused != null) patchRun({ ends: Date.now() + r.paused, paused: null });
}

// Stop button / Esc / the box's ✕: ask, then end the run and show what you answered.
export async function confirmStop() {
  if (!active()) { hideQuiz(); return; }
  const wasShown = get().shown;
  if (wasShown) pauseTimer();
  const answeredBefore = get().run!.answers.length;
  const choice = await ask({
    title: 'Stop this quiz?',
    text: `${progressText()}. ${answeredBefore ? 'The answers so far are kept in your results.' : 'Nothing has been answered yet.'}`,
    icon: 'alert',
    actions: [{ id: 'keep', label: 'Keep going', primary: true }, { id: 'stop', label: 'Stop quiz', danger: true }],
  });
  if (choice !== 'stop') {
    if (wasShown) resumeTimer();
    return;
  }
  const answered = get().run!.answers.length;
  endRun();
  if (answered && wasShown) set({ view: 'results' });
  else if (wasShown) await loadScope(get().scope!.current);
  else set({ view: 'closed', run: null });
}

// Finish a run early: log what was answered.
function endRun() {
  finishLog();
  patchRun({ done: true, ends: null, paused: null });
}

// ---------- settings ----------

export function setQuizPref<K extends keyof QuizPrefs>(name: K, value: QuizPrefs[K]) {
  const p = { ...quizPrefs(), [name]: value };
  useApp.setState({ prefs: { ...useApp.getState().prefs, quiz: p } });
  void api.setPref('quiz', p);
}

export function toggleType(t: QuestionType) {
  const on = new Set(enabledTypes());
  if (on.has(t)) on.delete(t); else on.add(t);
  setQuizPref('types', TYPES.filter((x) => on.has(x)));
}

// ---------- running ----------

const freshQuestionState = (seconds: number): Partial<Run> => ({
  picked: [], given: '', answered: null, revealed: false, timedOut: false, qStartedAt: Date.now(), recallMs: 0,
  ends: seconds ? Date.now() + seconds * 1000 : null, paused: null,
});

export function startQuiz(questions?: QuizQuestion[]) {
  const p = quizPrefs();
  const list = questions ?? chooseQuestions(eligible(), p);
  if (!list.length) return;
  set({
    view: 'question',
    run: {
      questions: list.map((q) => ({ ...q, shown: shuffle(q.options.map((o, i) => ({ ...o, i }))) })),
      index: 0,
      answers: [],
      seconds: p.seconds,
      startedAt: Date.now(),
      done: false,
      logged: false,
      ...freshQuestionState(p.seconds),
    } as Run,
  });
}

export function pick(n: number) {
  const r = get().run;
  if (!r) return;
  const q = current();
  if (r.answered || n >= q.shown.length) return;
  if (q.type === 'single') {
    patchRun({ picked: [n] });
    settle(q.shown[n]!.correct ? 'right' : 'wrong');
  } else if (q.type === 'multi') {
    patchRun({ picked: r.picked.includes(n) ? r.picked.filter((x) => x !== n) : [...r.picked, n] });
  }
}

export const setGiven = (given: string) => patchRun({ given });

export function submit() {
  const r = get().run;
  if (!r || r.answered) return;
  const q = current();
  if (q.type === 'multi') {
    if (!r.picked.length) { toast('Pick at least one'); return; }
    const ok = q.shown.every((o, i) => o.correct === r.picked.includes(i));
    settle(ok ? 'right' : 'wrong');
  } else if (q.type === 'input') {
    const given = r.given.trim();
    if (!given) { toast('Type an answer first (or wait for the timer)'); return; }
    settle(answerMatches(given, q.answers) ? 'right' : 'wrong');
  } else if (q.type === 'recall') {
    reveal(false);
  }
}

// Recall: show the model answer, then you grade yourself.
export function reveal(timedOut: boolean) {
  const r = get().run;
  if (!r || r.revealed) return;
  patchRun({ revealed: true, timedOut, recallMs: Date.now() - r.qStartedAt, ends: null });
}

export function grade(result: 'wrong' | 'partly' | 'right') {
  const r = get().run;
  if (!r || !r.revealed || r.answered) return;
  record(result, r.recallMs);
  patchRun({ answered: result });
}

// Lock in a result for single / multi / input.
export function settle(result: QuizResult) {
  const r = get().run;
  if (!r || r.answered) return;
  record(result, Date.now() - r.qStartedAt);
  patchRun({ answered: result, ends: null, timedOut: result === 'timeout' });
}

// The timer ran out on the question on screen.
export function timeUp() {
  const r = get().run;
  if (!r || r.answered || r.revealed) return;
  if (current().type === 'recall') reveal(true);
  else settle('timeout');
}

function record(result: QuizResult, ms: number) {
  const r = get().run!;
  const q = current();
  const given = q.type === 'single' || q.type === 'multi'
    ? get().run!.picked.map((i) => plainText(q.shown[i]!.html)).join(', ')
    : r.given.trim();
  patchRun({ answers: [...r.answers, { q: q.key, r: result, ms, given, question: q }] });
}

export function next() {
  const r = get().run;
  if (!r?.answered) return;
  if (r.index < r.questions.length - 1) patchRun({ index: r.index + 1, ...freshQuestionState(r.seconds) });
  else finish();
}

// ---------- results ----------

function finishLog() {
  const r = get().run;
  const t = get().scope?.current;
  if (!r || !t || r.logged || !r.answers.length) return;
  patchRun({ logged: true });
  api.quizLog({
    scope: `${t.kind}:${t.rel || '*'}`,
    answers: r.answers.map((a) => ({ q: a.q, r: a.r, ms: a.ms })),
  }).catch(() => toast("Couldn't save the results"));
}

function finish() {
  finishLog();
  patchRun({ done: true, ends: null });
  set({ view: 'results' });
}

export function retryMissed() {
  const r = get().run;
  if (r) startQuiz(shuffle(r.answers.filter((a) => a.r !== 'right').map((a) => a.question)));
}

export const newQuiz = () => loadScope(get().scope!.current);

export function openFromResults(i: number) {
  const q = get().run?.answers[i]?.question;
  if (!q) return;
  hideQuiz();
  void openNoteAtSection(q.note, q.section);
}

export function missesText(): string {
  const r = get().run!;
  const misses = r.answers.filter((a) => a.r !== 'right');
  const t = get().scope!.current;
  const where = t.kind === 'note' ? noteName(t.rel) : t.rel || 'all notes';
  const lines = misses.map((a) => {
    const q = a.question;
    const answer = q.type === 'input' ? q.answers[0]
      : q.type === 'recall' ? '(explain question)'
        : q.options.filter((o) => o.correct).map((o) => plainText(o.html)).join(', ');
    return `- [${q.id}] ${plainText(q.promptHtml)}\n  me: ${a.r === 'timeout' ? '(time ran out)' : a.given || `(${a.r})`} · answer: ${answer} · ${q.note}${q.section ? ` › ${q.section}` : ''}`;
  });
  return `App quiz misses (${where}, ${new Date().toLocaleDateString('sv-SE')}): ${misses.length} of ${r.answers.length}\n${lines.join('\n')}`;
}

export const scopeTitle = (t: ScopeOption) => (t.kind === 'note' ? noteName(t.rel) : t.rel ? t.rel : 'All notes');
export const pillName = (t: ScopeOption) => (t.kind === 'note' ? noteName(t.rel) : t.rel ? t.rel.split('/').pop() || t.rel : 'All notes');
export { ideasOf, lastSection, noteName };
