// Pomodoro timer: focus blocks with breaks between them (every 4th break is a long one); the
// run ends with its last focus block. Lives in the sidebar footer (countdown, cycle, stop),
// opens into a popover with the details and, while nothing is running, the settings. Phases
// follow each other on their own; the end of each one plays a soft chime and shows a system
// notification.
import { create } from 'zustand';
import { api, type PomodoroSettings } from './api';
import { useApp } from './store';
import { hooks, setTimerRunning, toast } from './actions';
import { chime, type Cue } from './lib/chime';

// A run is ~1.5 h (3 × 25 + 2 × 5 = 85 min); three a day is a full study day.
export const DEFAULT_POMODORO: PomodoroSettings = { focus: 25, shortBreak: 5, longBreak: 10, cycles: 3 };
// The break after every 4th focus block is the long one (classic Pomodoro). A break only
// comes between two blocks, so runs of 4 blocks or fewer never have one.
export const LONG_EVERY = 4;
// A tick that comes this long after the previous one means the computer was asleep (or the app
// frozen): the run pauses there instead of counting that time as focus or break.
const SLEEP_GAP_MS = 90_000;
export const SESSIONS_TARGET = 3; // sessions per day: 1 ok, 2 good, 3 sexy; more aren't counted
// Minutes: [min, max, step] per setting (also validated in main.js).
export const LIMITS: Record<keyof PomodoroSettings, [number, number, number]> = {
  focus: [5, 90, 5], shortBreak: [1, 30, 1], longBreak: [5, 60, 5], cycles: [1, 8, 1],
};

export type Phase = 'focus' | 'short' | 'long';

interface PomoStore {
  phase: Phase | null;        // null: nothing running (settings shown)
  cycle: number;              // which focus block of the run, 1-based
  endsAt: number | null;      // running
  pausedLeft: number | null;  // paused: ms left
  now: number;                // ticks while running, so components re-render
  open: boolean;              // the popover
  counted: boolean;           // this run already counted as one of today's sessions
  today: { date: string; sessions: number; focus: number }; // from the main process (activity.json)
}

const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const usePomo = create<PomoStore>()(() => ({
  phase: null, cycle: 1, endsAt: null, pausedLeft: null, now: Date.now(), open: false, counted: false,
  today: { date: '', sessions: 0, focus: 0 },
}));
const get = usePomo.getState;
const set = usePomo.setState;

export const settings = (): PomodoroSettings => ({ ...DEFAULT_POMODORO, ...(useApp.getState().prefs.pomodoro || {}) });
export const phaseMinutes = (phase: Phase, s = settings()) => (phase === 'focus' ? s.focus : phase === 'short' ? s.shortBreak : s.longBreak);
// The break after focus block `cycle`, or null after the last one (the run is over).
export const breakAfter = (cycle: number, s = settings()): Phase | null => (cycle >= s.cycles ? null : cycle % LONG_EVERY === 0 ? 'long' : 'short');
export const hasLongBreak = (s = settings()) => s.cycles > LONG_EVERY;
export function sessionMinutes(s = settings()) {
  let min = s.focus * s.cycles;
  for (let c = 1; c < s.cycles; c++) min += phaseMinutes(breakAfter(c, s)!, s);
  return min;
}
export const PHASE_LABEL: Record<Phase, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' };
export const running = () => get().phase !== null;

// ---------- today's sessions ----------
// A session is a run that got at least one focus block to the end. Counted by the main process
// (quizzes/activity.json) so the heatmap and the pill agree.

export const sessionsToday = (s = get()) => (s.today.date === localDay() ? s.today.sessions : 0);
export function refreshToday() {
  return api.activityToday().then((t) => set({ today: { date: localDay(), ...t } }), () => {});
}
hooks.refreshToday = refreshToday;
// The number this run is (or will be) for today.
export const sessionNumber = (s = get()) => Math.min(SESSIONS_TARGET + 1, sessionsToday(s) + (s.counted || !s.phase ? 0 : 1));

// ms left in the current phase (full length while idle).
export function msLeft(s = get()): number {
  if (s.endsAt != null) return Math.max(0, s.endsAt - s.now);
  if (s.pausedLeft != null) return s.pausedLeft;
  return phaseMinutes(s.phase ?? 'focus') * 60_000;
}
// ms until the whole session is over (the current phase plus everything after it).
export function sessionLeftMs(s = get()): number {
  if (!s.phase) return sessionMinutes() * 60_000;
  const p = settings();
  const breakMs = (c: number) => { const b = breakAfter(c, p); return b ? phaseMinutes(b, p) * 60_000 : 0; };
  let ms = msLeft(s);
  if (s.phase === 'focus') ms += breakMs(s.cycle);
  for (let k = s.cycle + 1; k <= p.cycles; k++) ms += p.focus * 60_000 + breakMs(k);
  return ms;
}
export function nextPhaseLabel(s = get()): string {
  const p = settings();
  if (s.phase === 'focus') {
    const b = breakAfter(s.cycle, p);
    return b ? `${phaseMinutes(b, p)} min ${b === 'long' ? 'long ' : ''}break` : 'Session complete';
  }
  return `Focus ${s.cycle + 1} of ${p.cycles}`;
}
export const fmtLeft = (ms: number) => {
  const sec = Math.ceil(ms / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
};

// ---------- settings ----------

export function setSetting<K extends keyof PomodoroSettings>(name: K, value: number) {
  const [min, max] = LIMITS[name];
  const next = { ...settings(), [name]: Math.min(max, Math.max(min, value)) };
  useApp.setState({ prefs: { ...useApp.getState().prefs, pomodoro: next } });
  void api.setPref('pomodoro', next);
}
export function resetSettings() {
  useApp.setState({ prefs: { ...useApp.getState().prefs, pomodoro: { ...DEFAULT_POMODORO } } });
  void api.setPref('pomodoro', { ...DEFAULT_POMODORO });
}

// ---------- running ----------

let timer = 0;
function tick() {
  const s = get();
  if (s.endsAt == null) return;
  const now = Date.now();
  if (now - s.now > SLEEP_GAP_MS) {
    // Asleep since the last tick: pause with the time that was left then.
    set({ pausedLeft: Math.max(0, s.endsAt - s.now), endsAt: null, now });
    stopTicking();
    toast('Pomodoro paused: the computer was asleep');
    return;
  }
  set({ now });
  if (now >= s.endsAt) advance(true);
}
function startTicking() { clearInterval(timer); timer = window.setInterval(tick, 250); }
function stopTicking() { clearInterval(timer); timer = 0; }

// `from`: when the phase starts. When a phase runs out, the next one starts at its end time,
// not at the (possibly late) tick that noticed it, so the run doesn't drift.
function begin(phase: Phase, cycle: number, from = Date.now()) {
  set({ phase, cycle, endsAt: from + phaseMinutes(phase) * 60_000, pausedLeft: null, now: Date.now() });
  startTicking();
  setTimerRunning(true);
}

export function start() {
  if (running()) return;
  set({ counted: false });
  begin('focus', 1);
}
export function pause() {
  const s = get();
  if (s.endsAt == null) return;
  set({ pausedLeft: Math.max(0, s.endsAt - Date.now()), endsAt: null });
  stopTicking();
}
export function resume() {
  const s = get();
  if (s.pausedLeft == null) return;
  set({ endsAt: Date.now() + s.pausedLeft, pausedLeft: null, now: Date.now() });
  startTicking();
}
export function togglePause() { if (get().endsAt != null) pause(); else resume(); }
export const skip = () => { if (running()) advance(false); };

export function stop() {
  stopTicking();
  set({ phase: null, cycle: 1, endsAt: null, pausedLeft: null, counted: false });
  setTimerRunning(false);
}

// Move to the next phase. `elapsed`: the clock ran out (chime + notify), as opposed to Skip.
function advance(elapsed: boolean) {
  const s = get();
  if (!s.phase) return;
  const n = settings().cycles;
  const from = elapsed && s.endsAt != null ? s.endsAt : Date.now();
  if (s.phase === 'focus') {
    const next = breakAfter(s.cycle);
    if (elapsed) {
      // The first finished block makes this run one of today's sessions.
      const session = !s.counted ? sessionsToday(s) + 1 : 0;
      const tag = session ? ` · session ${Math.min(session, SESSIONS_TARGET)} today${session === SESSIONS_TARGET ? ' 🍅 sexy' : session > SESSIONS_TARGET ? ' (bonus)' : ''}` : '';
      if (next) cue('rest', `Focus ${s.cycle} of ${n} done${tag}`, `${phaseMinutes(next)} min ${next === 'long' ? 'long ' : ''}break. Step away from the screen.`);
      else cue('done', `Session complete 🍅${tag}`, `${n} focus block${n === 1 ? '' : 's'} done. Start another when you're ready.`);
      api.activityBump('focus').then((t) => set({ today: { date: localDay(), ...t } }), () => {});
      if (session) {
        set({ counted: true });
        api.activityBump('session').then((t) => set({ today: { date: localDay(), ...t } }), () => {});
      }
    }
    if (next) begin(next, s.cycle, from);
    else stop();
  } else {
    if (elapsed) cue('work', 'Break over', `Focus ${s.cycle + 1} of ${n}: ${settings().focus} min.`);
    begin('focus', s.cycle + 1, from);
  }
}

// The day's dots are read from activity.json; after midnight they'd still show yesterday's.
let dayTimer = 0;
export function watchDay() {
  clearInterval(dayTimer);
  dayTimer = window.setInterval(() => { if (get().today.date && get().today.date !== localDay()) void refreshToday(); }, 60_000);
  return () => clearInterval(dayTimer);
}

function cue(kind: Cue, title: string, body: string) {
  chime(kind);
  toast(title);
  try {
    if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') new Notification(title, { body, silent: true });
  } catch { /* notifications unavailable */ }
}

export const setOpen = (open: boolean) => set({ open });
