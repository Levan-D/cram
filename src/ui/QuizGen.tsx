// Create / Update quiz with any AI chat (from the quiz start page): copy a prompt, paste the
// chat's reply back, see it checked as you paste, save. The main process builds the prompt,
// checks the reply and writes the stamped quiz file (main.js + quiz-gen.js); this is the dialog.
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { api, type QuizPromptInfo, type QuizReplyCheck, type QuizReplyOpts } from '../api';
import { toast } from '../actions';
import { quizzesChanged, noteName } from '../quiz';
import { errMsg } from '../lib/text';
import { Icon } from './Icon';

// notes: the notes it's for (several: pick one in the dialog); the first is preselected.
const useQuizGen = create<{ notes: string[] | null }>()(() => ({ notes: null }));
export const openQuizGen = (notes: string[]) => { if (notes.length) useQuizGen.setState({ notes }); };
export const closeQuizGen = () => useQuizGen.setState({ notes: null });

export function QuizGenHost() {
  const notes = useQuizGen((s) => s.notes);
  return notes ? <QuizGenDialog notes={notes} /> : null;
}

const list = (items: string[]) => items.map((s) => s.split(' > ').pop()).join(', ');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function QuizGenDialog({ notes }: { notes: string[] }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState(notes[0]!);
  const [info, setInfo] = useState<QuizPromptInfo | null>(null);
  const [reply, setReply] = useState('');
  const [check, setCheck] = useState<QuizReplyCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => { if (!dlg.current?.open) dlg.current?.showModal(); }, []);

  useEffect(() => {
    let live = true;
    setInfo(null);
    setCheck(null);
    api.quizPrompt(note).then((i) => { if (live) setInfo(i); }, (err) => toast(`Couldn't read the note: ${errMsg(err)}`));
    return () => { live = false; };
  }, [note]);

  const opts = (extra: Partial<QuizReplyOpts> = {}): QuizReplyOpts => ({ reply, noteHash: info?.noteHash, mode: info?.mode, ...extra });

  // Check the reply as it's pasted / edited.
  useEffect(() => {
    const n = ++seq.current;
    if (!info || !reply.trim()) { setCheck(null); return; }
    const t = setTimeout(() => {
      api.quizCheck(note, opts()).then((c) => { if (n === seq.current) setCheck(c); }, (err) => toast(errMsg(err)));
    }, 200);
    return () => clearTimeout(t);
  }, [reply, info, note]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyPrompt = async () => {
    try {
      const fresh = await api.quizPrompt(note); // the note as it is now
      setInfo(fresh);
      await api.copyText(fresh.prompt);
      toast('Prompt copied: paste it into any AI chat');
    } catch (err) { toast(`Couldn't make the prompt: ${errMsg(err)}`); }
  };

  const save = async (keepAll = false) => {
    setBusy(true);
    try {
      const res = await api.quizSave(note, opts(keepAll ? { reply: '', keepAll: true } : {}));
      if (!res.saved) { setCheck(res); return; }
      dlg.current?.close();
      toast(info?.mode === 'sync'
        ? `Quiz updated: ${plural(res.questions, 'question')}${res.dropped ? `, ${res.dropped} dropped` : ''}`
        : `Quiz saved: ${plural(res.questions, 'question')}`);
      await quizzesChanged();
    } catch (err) { toast(`Couldn't save the quiz: ${errMsg(err)}`); } finally { setBusy(false); }
  };

  const sync = info?.mode === 'sync';
  const needsReply = !sync || Boolean(info && (info.changed.length || info.added.length));
  const title = `${sync ? 'Update the quiz' : 'Create a quiz'}${notes.length === 1 ? ` for ${noteName(note)}` : ''}`;

  return (
    <dialog ref={dlg} className="ask quiz-gen" aria-labelledby="qg-title"
      onClose={closeQuizGen}
      onKeyDown={(e) => e.stopPropagation()}>
      <h2 id="qg-title" className="ask-title">{title}</h2>
      {notes.length > 1 && (
        <label className="qg-note">
          <span className="muted small">Note</span>
          <select value={note} onChange={(e) => { setNote(e.target.value); setReply(''); }}>
            {notes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
      {sync && info && (
        <p className="ask-text qg-changes">
          {info.changed.length > 0 && <span>Changed: <b>{list(info.changed)}</b>. </span>}
          {info.added.length > 0 && <span>New: <b>{list(info.added)}</b>. </span>}
          {info.removed.length > 0 && <span>Removed: <b>{list(info.removed)}</b>{info.removedQuestions ? ` (its ${plural(info.removedQuestions, 'question')} go)` : ''}. </span>}
          Questions from the other sections stay as they are.
        </p>
      )}

      {needsReply ? (
        <ol className="qg-steps">
          <li>
            <span>Copy the prompt and paste it into any AI chat (ChatGPT, Claude, Gemini, …).</span>
            <button type="button" className="small" disabled={!info} onClick={() => void copyPrompt()}><Icon name="copy" />Copy prompt</button>
          </li>
          <li>
            <span>Paste the whole reply here (use the chat's copy button, so the formatting comes along).</span>
            <textarea aria-label="AI reply" value={reply} spellCheck={false} rows={8}
              placeholder={'# Heaps\n\n## Insert\n\n### heaps-001 · single\n…'} onChange={(e) => setReply(e.target.value)} />
          </li>
        </ol>
      ) : (
        info && <p className="ask-text">No new material to ask about, so there's nothing to paste: updating just drops the removed sections' questions and marks the quiz as up to date.</p>
      )}

      {check && <CheckResult check={check} sync={sync} />}

      <div className="ask-actions">
        {sync && needsReply && (
          <button type="button" className="qg-keep" disabled={busy || !info} title="The note changed, but the questions are still right: mark the quiz as up to date without changing them"
            onClick={() => void save(true)}>Keep the questions</button>
        )}
        <span className="spacer" />
        <button type="button" onClick={() => dlg.current?.close()}>Cancel</button>
        <button type="button" className="primary-btn" disabled={busy || !info || (needsReply && !check?.ok)} onClick={() => void save(!needsReply)}>
          {sync ? 'Update quiz' : 'Save quiz'}
        </button>
      </div>
    </dialog>
  );
}

function CheckResult({ check, sync }: { check: QuizReplyCheck; sync: boolean }) {
  const MAX = 6;
  return (
    <div className="qg-check" role="status">
      {check.ok ? (
        <p className="qg-ok"><Icon name="check" />
          {sync
            ? `Ready: ${plural(check.questions, 'question')} (${check.kept} kept, ${check.written} from the reply${check.dropped ? `, ${check.dropped} dropped` : ''})`
            : `Ready: ${plural(check.questions, 'question')}`}
        </p>
      ) : (
        <>
          <p className="qg-bad"><Icon name="alert" />{`Can't save yet: ${plural(check.errors.length, 'problem')}. Fix them here, or ask the chat to fix them.`}</p>
          <ul>{check.errors.slice(0, MAX).map((e, i) => <li key={i}>{e}</li>)}{check.errors.length > MAX && <li>{`…and ${check.errors.length - MAX} more`}</li>}</ul>
        </>
      )}
      {check.warnings.length > 0 && (
        <ul className="qg-warn">{check.warnings.slice(0, MAX).map((w, i) => <li key={i}>{w}</li>)}{check.warnings.length > MAX && <li>{`…and ${check.warnings.length - MAX} more`}</li>}</ul>
      )}
    </div>
  );
}
