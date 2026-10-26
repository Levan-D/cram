// The "Unresolved" page: every ???, idk, todo, open task and ➕ line across the notes, grouped
// by note, filterable by kind. Clicking a line opens the note there. The sidebar button carries
// the count. Scanning: lib/unresolved.ts.
import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { closeUnresolved, openNoteAtLine, toggleUnresolved } from '../actions';
import { countByKind, hitsFor, KIND_INFO, KINDS, type Hit, type Kind } from '../lib/unresolved';
import { Icon } from './Icon';

export function UnresolvedButton() {
  const notes = useApp((s) => s.notes);
  const open = useApp((s) => s.unresolvedOpen);
  const count = hitsFor(notes).length;
  return (
    <button id="unresolved-btn" type="button" className={`icon-btn${open ? ' active' : ''}`} aria-pressed={open}
      title="Unresolved: ???, idk, todo, ➕ lines across all notes (Ctrl+Shift+U)" aria-label={`Unresolved (${count})`} onClick={toggleUnresolved}>
      <Icon name="flag" />
      {count > 0 && <span className="badge">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}

export function Unresolved() {
  const open = useApp((s) => s.unresolvedOpen);
  const notes = useApp((s) => s.notes);
  const byPath = useApp((s) => s.byPath);
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const hits = hitsFor(notes);
  const counts = useMemo(() => countByKind(hits), [hits]);
  if (!open) return <section id="unresolved" aria-label="Unresolved" hidden />;

  const shown = kind === 'all' ? hits : hits.filter((h) => h.kinds.includes(kind));
  const groups: { note: string; items: Hit[] }[] = [];
  for (const h of shown) {
    const g = groups[groups.length - 1];
    if (g && g.note === h.note) g.items.push(h); else groups.push({ note: h.note, items: [h] });
  }
  const noteCount = new Set(hits.map((h) => h.note)).size;

  return (
    <section id="unresolved" aria-label="Unresolved">
      <header className="quiz-head">
        <button type="button" className="quiz-back" aria-label="Back to notes" onClick={closeUnresolved}><Icon name="back" /><span className="label">Back to notes</span></button>
        <span className="quiz-head-title">Unresolved</span>
        <span className="muted small">{hits.length ? `${hits.length} in ${noteCount} note${noteCount === 1 ? '' : 's'}` : ''}</span>
      </header>
      <div className="quiz-scroll"><div className="unres">
        <div className="chips" role="group" aria-label="Kind">
          <button type="button" className="chip" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>All <span className="muted">{hits.length}</span></button>
          {KINDS.map((k) => (
            <button key={k} type="button" className="chip" data-kind={k} aria-pressed={kind === k} disabled={!counts[k]} title={KIND_INFO[k].title} onClick={() => setKind(k)}>
              {KIND_INFO[k].label} <span className="muted">{counts[k]}</span>
            </button>
          ))}
        </div>
        <p className="unres-guide small muted">
          Write these in a note and they show up here (whole words, any case; code blocks skipped).
          <b> Confused:</b> {code(['???', '??', '?!', 'idk', 'wtf', 'huh', 'no idea', "don't get it", 'confused'])}
          <b> To do:</b> {code(['todo', 'fixme', 'tbd', 'wip', 'do it later', 'revisit', 'come back to this'])}
          <b> Claude's:</b> {code(['➕'])} lines Claude added, for you to rewrite in your own words. Click a line to open the note there.
        </p>
        {!hits.length && <p className="muted unres-empty">Nothing flagged. Clearing this list is the study list.</p>}
        {groups.map((g) => {
          const note = byPath.get(g.note);
          return (
            <section className="unres-note" key={g.note}>
              <h2>
                <button type="button" className="unres-title" title={g.note} onClick={() => void openNoteAtLine(g.note, 0)}>{note?.title ?? g.note}</button>
                {note?.dir && <span className="muted small">{note.dir}</span>}
                <span className="count muted small">{g.items.length}</span>
              </h2>
              <ul>
                {g.items.map((h) => (
                  <li key={h.line}>
                    <button type="button" className="unres-item" data-line={h.line} title={`Line ${h.line + 1}`} onClick={() => void openNoteAtLine(h.note, h.line)}>
                      <span className={`tag ${h.kinds[0]}`}>{KIND_INFO[h.kinds[0]!].label}</span>
                      <span className="text"><Highlighted text={h.text} match={h.match} /></span>
                      {h.section && <span className="where muted small">{h.section}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div></div>
    </section>
  );
}

const code = (words: string[]) => words.map((w, i) => <span key={w}>{i ? ' ' : ''}<code>{w}</code></span>);

function Highlighted({ text, match }: { text: string; match: string }) {
  const i = match ? text.toLowerCase().indexOf(match.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + match.length)}</mark>{text.slice(i + match.length)}</>;
}
