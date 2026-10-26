// Pomodoro timer: focus blocks with short breaks, a long break after the last one. Lives in
// the sidebar footer (countdown, cycle, stop), opens into a popover with the details and, while
// nothing is running, the settings. Phases follow each other on their own; the end of each one
// plays a soft chime and shows a system notification.
import { create } from 'zustand';
import { api, type PomodoroSettings } from './api';
import { useApp } from './store';
import { toast } from './actions';
import { chime, type Cue } from './lib/chime';

// A run is ~1.5 h (3 × 25 + 2 × 5 + 10 = 95 min); three a day is a full study day.
export const DEFAULT_POMODORO: PomodoroSettings = { focus: 25, shortBreak: 5, longBreak: 10, cycles: 3 };
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
export const sessionMinutes = (s = settings()) => s.focus * s.cycles + s.shortBreak * Math.max(0, s.cycles - 1) + s.longBreak;
export const PHASE_LABEL: Record<Phase, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' };
export const running = () => get().phase !== null;

// ---------- today's sessions ----------
// A session is a run that got at least one focus block to the end. Counted by the main process
// (quizzes/activity.json) so the heatmap and the pill agree.

export const sessionsToday = (s = get()) => (s.today.date === localDay() ? s.today.sessions : 0);
export function refreshToday() {
  return api.activityToday().then((t) => set({ today: { date: localDay(), ...t } }), () => {});
}
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
  const breakMin = (c: number) => (c < p.cycles ? p.shortBreak : p.longBreak);
  let ms = msLeft(s);
  if (s.phase === 'focus') ms += breakMin(s.cycle) * 60_000;
  if (s.phase !== 'long') for (let k = s.cycle + 1; k <= p.cycles; k++) ms += (p.focus + breakMin(k)) * 60_000;
  return ms;
}
export function nextPhaseLabel(s = get()): string {
  const p = settings();
  if (s.phase === 'focus') return s.cycle < p.cycles ? `${p.shortBreak} min break` : `${p.longBreak} min long break`;
  if (s.phase === 'short') return `Focus ${s.cycle + 1} of ${p.cycles}`;
  return 'Session complete';
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
  set({ now });
  if (now >= s.endsAt) advance(true);
}
function startTicking() { clearInterval(timer); timer = window.setInterval(tick, 250); }
function stopTicking() { clearInterval(timer); timer = 0; }

function begin(phase: Phase, cycle: number) {
  set({ phase, cycle, endsAt: Date.now() + phaseMinutes(phase) * 60_000, pausedLeft: null, now: Date.now() });
  startTicking();
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
}

// Move to the next phase. `elapsed`: the clock ran out (chime + notify), as opposed to Skip.
function advance(elapsed: boolean) {
  const s = get();
  if (!s.phase) return;
  const n = settings().cycles;
  if (s.phase === 'focus') {
    const long = s.cycle >= n;
    const next: Phase = long ? 'long' : 'short';
    if (elapsed) {
      // The first finished block makes this run one of today's sessions.
      const session = !s.counted ? sessionsToday(s) + 1 : 0;
      const tag = session ? ` · session ${Math.min(session, SESSIONS_TARGET)} today${session === SESSIONS_TARGET ? ' 🍅 sexy' : session > SESSIONS_TARGET ? ' (bonus)' : ''}` : '';
      cue('rest', `Focus ${s.cycle} of ${n} done${tag}`, `${phaseMinutes(next)} min ${long ? 'long ' : ''}break. Step away from the screen.`);
      api.activityBump('focus').then((t) => set({ today: { date: localDay(), ...t } }), () => {});
      if (session) {
        set({ counted: true });
        api.activityBump('session').then((t) => set({ today: { date: localDay(), ...t } }), () => {});
      }
    }
    begin(next, s.cycle);
  } else if (s.phase === 'short') {
    if (elapsed) cue('work', 'Break over', `Focus ${s.cycle + 1} of ${n}: ${settings().focus} min.`);
    begin('focus', s.cycle + 1);
  } else {
    if (elapsed) cue('done', 'Session complete 🍅', `${n} focus block${n === 1 ? '' : 's'} done. Start another when you're ready.`);
    stop();
  }
}

function cue(kind: Cue, title: string, body: string) {
  chime(kind);
  toast(title);
  try {
    if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') new Notification(title, { body, silent: true });
  } catch { /* notifications unavailable */ }
}

export const setOpen = (open: boolean) => set({ open });
