// Study activity: the calendar button next to the Pomodoro in the sidebar footer. Opens a
// GitHub-style heatmap of the last 26 weeks (sessions and focus blocks from the Pomodoro,
// quizzes taken), with totals and the session streak.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api } from '../api';
import { buildGrid, type DayCount } from '../lib/activity';
import { Icon } from './Icon';

const WEEKS = 26;

export function Activity() {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<Record<string, DayCount> | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setDays(null);
    api.activityGet().then((r) => { if (live) setDays(r.days); }, () => { if (live) setDays({}); });
    const onDown = (e: MouseEvent) => { if (!(e.target as Element).closest('#activity')) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { live = false; document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);

  const grid = useMemo(() => (days ? buildGrid(days, new Date(), WEEKS) : null), [days]);
  const t = grid?.totals;

  return (
    <div id="activity">
      <button id="activity-btn" type="button" className={`icon-btn${open ? ' active' : ''}`} aria-expanded={open} aria-label="Study activity"
        title="Study activity: Pomodoro sessions and quizzes per day" onClick={() => setOpen(!open)}>
        <Icon name="calendar" />
      </button>
      {open && (
        <div className="activity-pop" role="dialog" aria-label="Study activity">
          <header className="activity-head"><b>Study activity</b><span className="muted small">{`last ${WEEKS} weeks`}</span></header>
          {!grid || !t ? <p className="muted small">Loading…</p> : (
            <>
              <div className="heat" style={{ '--cols': grid.columns.length } as CSSProperties}>
                <div className="heat-months" aria-hidden="true">{grid.columns.map((c, i) => <span key={i}>{c.month ?? ''}</span>)}</div>
                <div className="heat-days" aria-hidden="true"><span>Mon</span><span>Wed</span><span>Fri</span></div>
                <div className="heat-grid" role="img" aria-label={`${t.days} study days in the last ${WEEKS} weeks`}>
                  {grid.columns.map((c, i) => (
                    <div className="heat-col" key={i}>
                      {c.cells.map((cell) => <span key={cell.date} className={`cell l${cell.level}${cell.future ? ' future' : ''}`} title={cell.title} />)}
                    </div>
                  ))}
                </div>
              </div>
              <p className="activity-totals small muted">
                {`${t.days} study day${t.days === 1 ? '' : 's'} · ${t.sessions} session${t.sessions === 1 ? '' : 's'} · ${t.focus} focus block${t.focus === 1 ? '' : 's'} · ${t.quizzes} quiz${t.quizzes === 1 ? '' : 'zes'}`}
                {grid.streak > 1 ? ` · ${grid.streak}-day streak` : ''}
              </p>
              <p className="activity-how small muted">
                A session is a Pomodoro run with at least one finished focus block (the tomato next door); quizzes count too. The streak is days with a session.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
