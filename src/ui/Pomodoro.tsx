// The Pomodoro timer in the sidebar footer: a one-line pill (tomato, countdown, cycle, stop)
// that opens a popover. Running: a ring with the time left, the cycle dots, pause / skip /
// stop. Idle: the settings (focus, breaks, cycles) and Start. State and flow: pomodoro.ts.
import { useEffect, useRef } from 'react';
import type { PomodoroSettings } from '../api';
import { useApp } from '../store';
import {
  usePomo, settings, msLeft, fmtLeft, phaseMinutes, sessionMinutes, sessionLeftMs, nextPhaseLabel, PHASE_LABEL, LIMITS, LONG_EVERY, hasLongBreak,
  DEFAULT_POMODORO, SESSIONS_TARGET, sessionsToday, sessionNumber, refreshToday, watchDay, start, stop, togglePause, skip, setOpen, setSetting, resetSettings,
} from '../pomodoro';
import { Icon } from './Icon';

const fmtTotal = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const SESSION_WORD = ['', 'ok', 'good', 'sexy'] as const; // 1, 2, 3 sessions

export function Pomodoro() {
  const s = usePomo();
  useApp((a) => a.prefs.pomodoro); // re-render on settings changes
  useEffect(watchDay, []);
  const n = settings().cycles;
  const left = msLeft(s);
  const paused = s.pausedLeft != null;
  const done = Math.min(SESSIONS_TARGET, sessionsToday(s));
  const tone = s.phase === 'focus' ? 'focus' : s.phase ? 'rest' : done >= SESSIONS_TARGET ? 'full' : '';
  const label = s.phase
    ? `Pomodoro: ${PHASE_LABEL[s.phase]} ${fmtLeft(left)}${paused ? ' (paused)' : ''}, focus ${s.cycle} of ${n}`
    : `Pomodoro: ${done} of ${SESSIONS_TARGET} sessions today`;

  return (
    <div id="pomodoro" className={tone}>
      <button type="button" className={`pomo-pill${paused ? ' paused' : ''}`} aria-label={label} aria-expanded={s.open}
        title={s.phase ? 'Pomodoro details' : `${done} of ${SESSIONS_TARGET} sessions today${done ? ` · ${SESSION_WORD[done]}` : ''}`} onClick={() => setOpen(!s.open)}>
        <Icon name="tomato" className="pomo-icon" />
        {s.phase ? (
          <>
            <span className="pomo-time">{fmtLeft(left)}</span>
            <span className="pomo-cycle muted small">{`${s.cycle}/${n}`}</span>
            {paused && <span className="pomo-paused small">paused</span>}
          </>
        ) : (
          <>
            <span className="muted">Pomodoro</span>
            <span className="pomo-dots" aria-hidden="true">
              {Array.from({ length: SESSIONS_TARGET }, (_, i) => <span key={i} className={i < done ? 'on' : ''} />)}
            </span>
          </>
        )}
      </button>
      {s.phase && (
        <button type="button" className="icon-btn pomo-stop" title="Stop the timer" aria-label="Stop the timer" onClick={stop}>
          <Icon name="stop" />
        </button>
      )}
      {s.open && <Popover />}
    </div>
  );
}

function Popover() {
  const s = usePomo();
  useApp((a) => a.prefs.pomodoro);
  const ref = useRef<HTMLDivElement>(null);

  // Close on a click outside or Esc.
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!(e.target as Element).closest('#pomodoro')) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, []);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('.primary-btn, button')?.focus({ preventScroll: true }); void refreshToday(); }, []);

  const p = settings();
  const head = (sub: string) => (
    <header className="pomo-head">
      <Icon name="tomato" className="pomo-icon" />
      <b>Pomodoro</b>
      <span className="muted small">{sub}</span>
      <button type="button" className="icon-btn" title="Close" aria-label="Close" onClick={() => setOpen(false)}><Icon name="close" /></button>
    </header>
  );

  if (!s.phase) {
    const isDefault = (Object.keys(DEFAULT_POMODORO) as (keyof PomodoroSettings)[]).every((k) => p[k] === DEFAULT_POMODORO[k]);
    return (
      <div className="pomo-pop" role="dialog" aria-label="Pomodoro" ref={ref}>
        {head('Settings')}
        <div className="pomo-settings">
          <Stepper name="focus" label="Focus" unit="min" />
          <Stepper name="shortBreak" label="Short break" unit="min" />
          <Stepper name="longBreak" label="Long break" unit="min" disabled={!hasLongBreak(p)} hint={`From ${LONG_EVERY + 1} focus blocks: the break after every ${LONG_EVERY}th block is the long one`} />
          <Stepper name="cycles" label="Focus blocks" unit="" />
        </div>
        <p className="small muted pomo-total">
          {`${p.cycles} × ${p.focus} min focus${p.cycles > 1 ? ` with ${p.shortBreak} min breaks` : ''}${hasLongBreak(p) ? ` and a ${p.longBreak} min long break after every ${LONG_EVERY}th block` : ''} ≈ ${fmtTotal(sessionMinutes(p))}.`}
          <br />
          {`A run with at least one finished focus block is a session: ${sessionsToday(s)} of ${SESSIONS_TARGET} today.`}
        </p>
        <div className="pomo-actions">
          <button type="button" className="small" disabled={isDefault} onClick={resetSettings}>Reset to defaults</button>
        </div>
        <button type="button" className="primary-btn pomo-start" onClick={start}><Icon name="play" />{`Start focus · ${p.focus} min`}</button>
      </div>
    );
  }

  const left = msLeft(s);
  const total = phaseMinutes(s.phase) * 60_000;
  const paused = s.pausedLeft != null;
  const pct = Math.min(100, Math.max(0, (1 - left / total) * 100));
  return (
    <div className="pomo-pop" role="dialog" aria-label="Pomodoro" ref={ref}>
      {head(PHASE_LABEL[s.phase])}
      <div className={`pomo-ring${paused ? ' paused' : ''}`} style={{ '--pct': pct } as React.CSSProperties}>
        <span className="pomo-big">{fmtLeft(left)}</span>
        <span className="small muted">{paused ? 'Paused' : PHASE_LABEL[s.phase]}</span>
      </div>
      <div className="pomo-dots" role="img" aria-label={`Focus ${s.cycle} of ${p.cycles}`}>
        {Array.from({ length: p.cycles }, (_, i) => {
          const done = i < s.cycle - 1 || (i === s.cycle - 1 && s.phase !== 'focus');
          return <span key={i} className={done ? 'done' : i === s.cycle - 1 ? 'now' : ''} />;
        })}
      </div>
      <p className="small muted pomo-next">{`Next: ${nextPhaseLabel(s)} · run ends ~${clock(Date.now() + sessionLeftMs(s))}`}</p>
      <p className="small muted pomo-session">
        {sessionNumber(s) > SESSIONS_TARGET
          ? `Bonus run · ${SESSIONS_TARGET} sessions already today`
          : `Session ${sessionNumber(s)} today${s.counted ? '' : ' (counts after the first focus block)'}${sessionNumber(s) === SESSIONS_TARGET - 1 && s.counted ? ` · ${SESSIONS_TARGET} makes it sexy` : ''}`}
      </p>
      <div className="pomo-actions">
        <button type="button" onClick={togglePause}><Icon name={paused ? 'play' : 'pause'} />{paused ? 'Resume' : 'Pause'}</button>
        <button type="button" onClick={skip}><Icon name="skip" />Skip</button>
        <button type="button" className="danger-btn" onClick={stop}><Icon name="stop" />Stop</button>
      </div>
    </div>
  );
}

// disabled: the setting doesn't apply to the current run length (it keeps its value); hint says when it does.
function Stepper({ name, label, unit, disabled = false, hint }: { name: keyof PomodoroSettings; label: string; unit: string; disabled?: boolean; hint?: string }) {
  const value = settings()[name];
  const [min, max, step] = LIMITS[name];
  return (
    <div className={`pomo-row${disabled ? ' off' : ''}`} title={disabled ? hint : undefined}>
      <span className="lbl">{label}</span>
      <span className="stepper">
        <button type="button" aria-label={`Less ${label.toLowerCase()}`} disabled={disabled || value <= min} onClick={() => setSetting(name, value - step)}>−</button>
        <span className="val">{unit ? `${value} ${unit}` : value}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={disabled || value >= max} onClick={() => setSetting(name, value + step)}>+</button>
      </span>
    </div>
  );
}
