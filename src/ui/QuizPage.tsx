// The quiz page: start screen (scope + settings), one question at a time, results.
// Flow and state live in quiz.ts; this renders them and handles the quiz's keyboard.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useApp } from '../store';
import { isMenuOpen } from './Menu';
import {
  useQuiz, quizPrefs, enabledTypes, eligible, TYPES, hideQuiz, confirmStop, loadScope, setQuizPref, toggleType,
  startQuiz, pick, submit, reveal, grade, next, setGiven, timeUp, retryMissed, newQuiz, openFromResults, missesText,
  scopeTitle, ideasOf, lastSection, noteName, current, type Run,
} from '../quiz';
import { SCORE, weakRank, fmtTime, plainText } from '../lib/quiz-logic';
import { toast } from '../actions';
import { api, type QuizQuestion } from '../api';
import type { QuestionType } from '../../quiz-format.js';
import { Icon } from './Icon';
import { openQuizGen } from './QuizGen';

const TYPE_CHIP: Record<QuestionType, string> = { single: 'Pick one', multi: 'Pick several', input: 'Type it', recall: 'Explain' };
const TYPE_HINT: Record<QuestionType, string> = {
  single: 'Pick one',
  multi: 'Pick all that apply',
  input: 'Type the answer',
  recall: 'Answer in your head (or type it), then reveal',
};
const COUNTS: [number, string][] = [[5, '5'], [10, '10'], [20, '20'], [30, '30'], [0, 'All']];
const SECONDS: [number, string][] = [[0, 'Off'], [15, '15s'], [30, '30s'], [60, '60s'], [90, '90s']];
const ORDERS: ['random' | 'weak', string][] = [['random', 'Random'], ['weak', 'Weak spots first']];

const copy = async (text: string) => { await api.copyText(text); toast('Copied'); };

export function QuizPage() {
  const view = useQuiz((s) => s.view);
  const shown = useQuiz((s) => s.shown);
  useQuizKeys(shown);
  if (view === 'closed') return <section id="quiz" aria-label="Quiz" hidden />;
  return (
    <section id="quiz" aria-label="Quiz" hidden={!shown}>
      {view === 'start' && <StartScreen />}
      {view === 'question' && <QuestionScreen />}
      {view === 'results' && <ResultsScreen />}
    </section>
  );
}

function Seg<T extends string | number>({ name, items, value, onPick }: { name: string; items: [T, string][]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="seg" role="group" data-pref={name}>
      {items.map(([v, label]) => (
        <button key={String(v)} type="button" data-value={v} aria-pressed={v === value} onClick={() => onPick(v)}>{label}</button>
      ))}
    </div>
  );
}

// ---------- start ----------

function StartScreen() {
  const scope = useQuiz((s) => s.scope)!;
  const data = useQuiz((s) => s.data)!;
  useApp((s) => s.prefs.quiz); // re-render when settings change
  const p = quizPrefs();
  const types = enabledTypes();
  const total = data.questions.length;
  const poolIdeas = ideasOf(eligible()).length;
  const n = p.count ? Math.min(p.count, poolIdeas) : poolIdeas;
  const byType = Object.fromEntries(TYPES.map((t) => [t, data.questions.filter((q) => q.type === t).length])) as Record<QuestionType, number>;
  const target = scope.current;
  const withQuiz = data.files.filter((f) => f.exists);
  const missing = data.files.filter((f) => !f.exists);
  const weak = ideasOf(data.questions).filter((v) => weakRank(v) === 0).length;
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => { go.current?.focus({ preventScroll: true }); }, [target]);

  return (
    <>
      <header className="quiz-head">
        <button type="button" className="quiz-back" data-act="close" aria-label="Back to notes" onClick={hideQuiz}><Icon name="back" /><span className="label">Back to notes</span></button>
        <span className="quiz-head-title">Quiz</span>
      </header>
      <div className="quiz-scroll"><div className="quiz-start">
        <h1 className="quiz-title">{scopeTitle(target)}</h1>
        <p className="muted quiz-sub">
          {total ? `${total} question${total === 1 ? '' : 's'} · ${withQuiz.length} note${withQuiz.length === 1 ? '' : 's'}${weak ? ` · ${weak} missed last time` : ''}` : 'No questions yet'}
        </p>
        <StatusRows />
        <button ref={go} type="button" className="primary-btn quiz-go" data-act="start" disabled={!n} onClick={() => startQuiz()}>
          <Icon name="play" />
          <span>{n ? `Start ${n} question${n === 1 ? '' : 's'}` : total ? 'No questions match the settings' : 'Nothing to quiz yet'}</span>
        </button>
        <p className="muted small quiz-go-hint">
          {n ? `${p.seconds ? `${p.seconds}s per question` : 'No time limit'} · Enter to start` : total ? 'Turn on more question types below.' : missing.length ? 'Make one with any AI chat: Create quiz, above.' : 'No notes here.'}
        </p>

        <section className="quiz-settings" aria-label="Settings">
          {scope.options.length > 1 && (
            <div className="setting">
              <span className="setting-label">Quiz on</span>
              <div className="seg" role="group" aria-label="What to quiz">
                {scope.options.map((o, i) => (
                  <button key={i} type="button" data-scope={i} aria-pressed={o === target} onClick={() => void loadScope(o)}>{o.label}</button>
                ))}
              </div>
            </div>
          )}
          <div className="setting"><span className="setting-label">Questions</span><Seg name="count" items={COUNTS} value={p.count} onPick={(v) => setQuizPref('count', v)} /></div>
          <div className="setting"><span className="setting-label">Time per question</span><Seg name="seconds" items={SECONDS} value={p.seconds} onPick={(v) => setQuizPref('seconds', v)} /></div>
          <div className="setting">
            <span className="setting-label">Question types</span>
            <div className="chips">
              {TYPES.map((t) => (
                <button key={t} type="button" className="chip" data-type={t} aria-pressed={types.includes(t)} disabled={!byType[t]} onClick={() => toggleType(t)}>
                  {TYPE_CHIP[t]} <span className="muted">{byType[t]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="setting"><span className="setting-label">Order</span><Seg name="order" items={ORDERS} value={p.order} onPick={(v) => setQuizPref('order', v)} /></div>
        </section>
      </div></div>
    </>
  );
}

function StatusRows() {
  const data = useQuiz((s) => s.data)!;
  const rows = [];
  for (const f of data.files) {
    if (!f.exists || f.inSync) continue;
    const changed = [...f.changed, ...f.removed];
    rows.push(
      <li key={`s:${f.note}`} className="warn">
        <Icon name="alert" />
        <span>
          <b>{noteName(f.note)}</b> changed since its quiz was written
          {changed.length ? ` (${changed.map(lastSection).slice(0, 4).join(', ')}${changed.length > 4 ? ', …' : ''})` : ''}. Questions from changed sections are marked.
        </span>
        <button type="button" className="small" title="Update the questions of the changed sections with any AI chat, or mark the quiz as up to date" onClick={() => openQuizGen([f.note])}>Update quiz</button>
      </li>,
    );
  }
  for (const f of data.files) {
    if (f.exists && f.errors) {
      rows.push(
        <li key={`e:${f.note}`} className="warn">
          <Icon name="alert" />
          <span><b>{noteName(f.note)}</b>: {f.errors} question(s) skipped because of format errors in <code>{`quizzes/${f.quiz}`}</code>.</span>
        </li>,
      );
    }
  }
  const missing = data.files.filter((f) => !f.exists);
  if (missing.length) {
    rows.push(
      <li key="missing" className="muted">
        <Icon name="plus" />
        <span>
          No quiz yet for {missing.slice(0, 5).map((f, i) => <span key={f.note}>{i ? ', ' : ''}<b>{noteName(f.note)}</b></span>)}
          {missing.length > 5 ? ` and ${missing.length - 5} more` : ''}.
        </span>
        <button type="button" className="small" title="Make a quiz for a note with any AI chat" onClick={() => openQuizGen(missing.map((f) => f.note))}>Create quiz</button>
      </li>,
    );
  }
  return rows.length ? <ul className="quiz-status">{rows}</ul> : null;
}

// ---------- question ----------

function QuestionScreen() {
  const run = useQuiz((s) => s.run)!;
  const q = run.questions[run.index]!;
  const total = run.questions.length;
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const card = useRef<HTMLElement>(null);
  const actions = useRef<HTMLDivElement>(null);

  // Focus: the answer box (or the card) for a new question; Next / "Got it" once answered / revealed.
  useEffect(() => { (field.current || card.current)?.focus({ preventScroll: true }); }, [run.index]);
  useEffect(() => {
    if (run.answered) actions.current?.querySelector<HTMLButtonElement>('[data-act=next]')?.focus({ preventScroll: true });
    else if (run.revealed) actions.current?.querySelector<HTMLButtonElement>('.grade.right')?.focus({ preventScroll: true });
  }, [run.answered, run.revealed]);

  // Enter in the answer box: submit (input) / reveal (recall: Ctrl+Enter, plain Enter makes a new line).
  const onFieldKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    if (q.type === 'input' || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      if (useQuiz.getState().run?.answered) next(); else submit();
    }
  };

  const optionClass = (i: number, correct: boolean) => {
    if (!run.answered) return 'q-option';
    const chosen = run.picked.includes(i);
    return ['q-option', correct && 'correct', chosen && 'chosen', chosen && !correct && 'wrong', !chosen && correct && q.type === 'multi' && 'missed'].filter(Boolean).join(' ');
  };

  return (
    <>
      <header className="quiz-head">
        <button type="button" className="quiz-back" data-act="close" aria-label="Notes" title="Back to your notes; the quiz waits in the sidebar" onClick={hideQuiz}>
          <Icon name="back" /><span className="label">Notes</span>
        </button>
        <div className="quiz-progress">
          <span className="small"><span className="q-word">Question </span>{`${run.index + 1} of ${total}`}</span>
          <div className="bar"><div style={{ width: `${(run.index / total) * 100}%` }} /></div>
        </div>
        {run.seconds > 0 && <Timer run={run} />}
        <button type="button" className="quiz-stop" data-act="quit" aria-label="Stop" title="Stop the quiz (Esc)" onClick={() => void confirmStop()}>
          <Icon name="close" /><span className="label">Stop</span>
        </button>
      </header>
      <div className="quiz-scroll">
        <article className="quiz-card" tabIndex={-1} ref={card} key={run.index}>
          <div className="q-meta">
            <span className="q-type">{TYPE_HINT[q.type]}</span>
            <span className="q-where" title={`${q.note}${q.section ? ` › ${q.section}` : ''}`}>{lastSection(q.section) || noteName(q.note)}</span>
          </div>
          <div className="q-prompt markdown" dangerouslySetInnerHTML={{ __html: q.promptHtml }} />

          {(q.type === 'single' || q.type === 'multi') && (
            <div className={`q-options${q.type === 'multi' ? ' multi' : ''}`} role="listbox" aria-multiselectable={q.type === 'multi' || undefined}>
              {q.shown.map((o, i) => (
                <button key={i} type="button" className={optionClass(i, o.correct)} data-opt={i} role="option"
                  aria-selected={run.picked.includes(i)} disabled={Boolean(run.answered)} onClick={() => pick(i)}>
                  <span className="q-key">{i < 9 ? i + 1 : ''}</span>
                  <span className="q-label" dangerouslySetInnerHTML={{ __html: o.html }} />
                </button>
              ))}
            </div>
          )}
          {q.type === 'input' && (
            <div className="q-input">
              <input ref={field} type="text" className="q-text" placeholder="Your answer" autoComplete="off" spellCheck={false} aria-label="Your answer"
                value={run.given} disabled={Boolean(run.answered)} onChange={(e) => setGiven(e.target.value)} onKeyDown={onFieldKey} />
            </div>
          )}
          {q.type === 'recall' && (
            <div className="q-input">
              <textarea ref={field} className="q-text" rows={3} placeholder="Optional: type your answer to compare" spellCheck aria-label="Your answer"
                value={run.given} onChange={(e) => setGiven(e.target.value)} onKeyDown={onFieldKey} />
            </div>
          )}

          <Feedback run={run} q={q} />

          <div className="q-actions" ref={actions}>
            <Actions run={run} q={q} />
          </div>
        </article>
      </div>
    </>
  );
}

const outdatedNote = (q: QuizQuestion) => q.outdated && (
  <p className="outdated small"><Icon name="alert" />This section of the note changed after the question was written, so it may be out of date.</p>
);

function Feedback({ run, q }: { run: Run; q: QuizQuestion }) {
  if (q.type === 'recall') {
    if (!run.revealed) return null;
    return (
      <div className="q-feedback reveal">
        {run.timedOut && <div className="verdict timeout"><Icon name="clock" />Time's up. Compare with the answer:</div>}
        <div className="model-label small muted">Model answer</div>
        <div className="markdown" dangerouslySetInnerHTML={{ __html: q.explainHtml }} />
        {outdatedNote(q)}
      </div>
    );
  }
  if (!run.answered) return null;
  const r = run.answered === 'partly' ? 'wrong' : run.answered;
  const verdict = { right: ['check', 'Correct'], wrong: ['close', 'Not quite'], timeout: ['clock', "Time's up"] } as const;
  return (
    <div className={`q-feedback ${r}`}>
      <div className="verdict"><Icon name={verdict[r][0]} />{verdict[r][1]}</div>
      {q.type === 'input' && (
        <div className="small">
          Answer: <b>{q.answers[0]}</b>
          {q.answers.length > 1 && <span className="muted">{` (also: ${q.answers.slice(1).join(', ')})`}</span>}
        </div>
      )}
      {q.explainHtml && <div className="markdown" dangerouslySetInnerHTML={{ __html: q.explainHtml }} />}
      {outdatedNote(q)}
    </div>
  );
}

function Actions({ run, q }: { run: Run; q: QuizQuestion & { shown: unknown[] } }) {
  const last = run.index === run.questions.length - 1;
  if (run.answered) {
    return (
      <>
        <span className="muted small">Enter</span>
        <button type="button" className="primary-btn" data-act="next" onClick={next}>{last ? 'See results' : 'Next'}<Icon name="forward" /></button>
      </>
    );
  }
  if (q.type === 'recall' && run.revealed) {
    return (
      <>
        <span className="muted small grade-label">How did you do?</span>
        <button type="button" className="grade wrong" data-grade="wrong" onClick={() => grade('wrong')}><span className="q-key">1</span>Missed it</button>
        <button type="button" className="grade partly" data-grade="partly" onClick={() => grade('partly')}><span className="q-key">2</span>Partly</button>
        <button type="button" className="grade right" data-grade="right" onClick={() => grade('right')}><span className="q-key">3</span>Got it</button>
      </>
    );
  }
  if (q.type === 'recall') {
    return (
      <>
        <button type="button" className="primary-btn" data-act="reveal" onClick={() => reveal(false)}>Reveal answer</button>
        <span className="muted small">Enter (outside the box) / Ctrl+Enter</span>
      </>
    );
  }
  if (q.type === 'single') return <span className="muted small">{`Click an answer or press 1–${Math.min(9, q.shown.length)}`}</span>;
  return (
    <>
      <button type="button" className="primary-btn" data-act="submit" onClick={submit}>Check</button>
      <span className="muted small">Enter</span>
    </>
  );
}

// Counts down while the question is open; paused (ends = null) while minimized or a dialog is up.
function Timer({ run }: { run: Run }) {
  const [now, setNow] = useState(() => Date.now());
  const ends = run.ends;
  useEffect(() => {
    if (ends == null) return;
    setNow(Date.now());
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= ends) { clearInterval(id); timeUp(); }
    }, 200);
    return () => clearInterval(id);
  }, [ends]);
  const total = run.seconds * 1000;
  const last = useRef(total);
  // Running: count down. Paused: what was left. Answered: frozen where it stopped.
  const left = Math.min(total, ends != null ? Math.max(0, ends - now) : run.paused ?? last.current);
  last.current = left;
  useEffect(() => { last.current = total; }, [run.index, total]);
  const frac = Math.min(1, left / total);
  return (
    <span className={`quiz-timer${left <= 5000 ? ' low' : ''}`} aria-live="off">
      <span className="t">{`${Math.ceil(left / 1000)}s`}</span>
      <span className="tbar"><span style={{ width: `${frac * 100}%`, transition: ends != null ? 'width 0.2s linear' : 'none' } as CSSProperties} /></span>
    </span>
  );
}

// ---------- results ----------

function ResultsScreen() {
  const run = useQuiz((s) => s.run)!;
  const [open, setOpen] = useState<Set<number>>(new Set());
  const firstBtn = useRef<HTMLDivElement>(null);
  useEffect(() => { firstBtn.current?.querySelector('button')?.focus({ preventScroll: true }); }, []);

  const total = run.answers.length;
  const score = run.answers.reduce((s, a) => s + SCORE[a.r], 0);
  const pct = total ? Math.round((score / total) * 100) : 0;
  const misses = run.answers.filter((a) => a.r !== 'right');
  const [took] = useState(() => Date.now() - run.startedAt);
  const ICON = { right: 'check', wrong: 'close', timeout: 'clock', partly: 'half' } as const;
  const LABEL = { right: 'Right', wrong: 'Missed', timeout: 'Time ran out', partly: 'Partly' };
  const tone = pct >= 85 ? 'great' : pct >= 60 ? 'ok' : 'low';

  return (
    <>
      <header className="quiz-head">
        <button type="button" className="quiz-back" data-act="close" aria-label="Back to notes" onClick={hideQuiz}><Icon name="back" /><span className="label">Back to notes</span></button>
        <span className="quiz-head-title">Results</span>
      </header>
      <div className="quiz-scroll"><div className="quiz-results">
        <div className={`score ${tone}`} style={{ '--pct': pct } as CSSProperties}>
          <div className="ring"><span className="num">{score % 1 ? score.toFixed(1) : score}<small>{`/${total}`}</small></span></div>
          <div className="score-text"><b>{`${pct}%`}</b><span className="muted small">{`${fmtTime(took)} · saved to your quiz results`}</span></div>
        </div>
        <div className="results-actions" ref={firstBtn}>
          {misses.length > 0 && <button type="button" className="primary-btn" data-act="retry" onClick={retryMissed}><Icon name="retry" />{`Retry the ${misses.length} missed`}</button>}
          <button type="button" data-act="again" onClick={() => void newQuiz()}><Icon name="play" />New quiz</button>
          {misses.length > 0 && (
            <button type="button" data-act="copy" title="A summary of what you missed, to paste into an AI chat or your notes" onClick={() => void copy(missesText())}>
              <Icon name="copy" />Copy misses
            </button>
          )}
        </div>
        <ol className="results-list">
          {run.answers.map((a, i) => {
            const q = a.question;
            const expanded = open.has(i);
            return (
              <li key={i} className={`res ${a.r}`}>
                <button type="button" className="res-row" data-res={i} aria-expanded={expanded}
                  onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                  <Icon name={ICON[a.r]} className="res-icon" />
                  <span className="res-q">{plainText(q.promptHtml).slice(0, 160)}</span>
                  <span className="res-where muted small">{lastSection(q.section) || noteName(q.note)}</span>
                </button>
                <div className="res-detail" hidden={!expanded}>
                  {a.given && <div className="small"><span className="muted">You:</span> {a.given}</div>}
                  {q.type === 'input' && <div className="small"><span className="muted">Answer:</span> <b>{q.answers[0]}</b></div>}
                  {(q.type === 'single' || q.type === 'multi') && (
                    <div className="small"><span className="muted">Answer:</span> <span dangerouslySetInnerHTML={{ __html: q.options.filter((o) => o.correct).map((o) => o.html).join(', ') }} /></div>
                  )}
                  {q.explainHtml && <div className="markdown" dangerouslySetInnerHTML={{ __html: q.explainHtml }} />}
                  <button type="button" className="small" data-open={i} onClick={() => openFromResults(i)}>
                    <Icon name="read" />{`Open in note${q.section ? `: ${lastSection(q.section)}` : ''}`}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </div></div>
    </>
  );
}

// ---------- keyboard ----------
// 1–9 answer (or grade a recall), Enter checks / goes on, → next, Esc stops (asks) or leaves.
function useQuizKeys(shown: boolean) {
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || document.querySelector('dialog[open]') || isMenuOpen()) return;
      const s = useQuiz.getState();
      const target = e.target as HTMLElement;
      const typing = target.closest?.('input, textarea, [contenteditable="true"]');
      const mod = e.ctrlKey || e.metaKey;
      const handled = () => { e.preventDefault(); e.stopPropagation(); };
      if (e.key === 'Escape') {
        if (typing && !target.closest('#quiz')) return; // the sidebar search handles its own Esc
        if (typing && s.view === 'question' && !s.run?.answered) { target.blur(); handled(); return; }
        handled();
        if (s.view === 'question') void confirmStop(); else hideQuiz();
        return;
      }
      if (typing || mod) return;
      if (s.view === 'start' && e.key === 'Enter' && !target.closest('button')) { handled(); if (eligible().length) startQuiz(); return; }
      if (s.view !== 'question' || !s.run) return;
      const run = s.run;
      if (run.answered) {
        if (e.key === 'Enter' || e.key === 'ArrowRight') {
          if (e.key === 'Enter' && target.closest('button')) return; // let the focused button click itself
          handled();
          next();
        }
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        handled();
        const n = Number(e.key) - 1;
        if (current().type === 'recall' && run.revealed) { const g = (['wrong', 'partly', 'right'] as const)[n]; if (g) grade(g); }
        else pick(n);
        return;
      }
      if (e.key === 'Enter' && !target.closest('button')) { handled(); submit(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [shown]);
}
