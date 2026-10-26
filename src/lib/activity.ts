// The study heatmap: one cell per day for the last N weeks, GitHub-style. A day's "units" are
// finished focus blocks + quizzes taken (both from the main process); sessions (Pomodoro runs
// with at least one finished block) drive the streak. Pure, for tests.

export interface DayCount { focus: number; quizzes: number; sessions?: number }
export interface Cell { date: string; focus: number; quizzes: number; sessions: number; level: 0 | 1 | 2 | 3 | 4; future: boolean; title: string }
export interface Column { month: string | null; cells: Cell[] }
export interface Grid { columns: Column[]; totals: { days: number; focus: number; quizzes: number; sessions: number }; streak: number }

const pad = (n: number) => String(n).padStart(2, '0');
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const levelFor = (units: number): Cell['level'] => (units <= 0 ? 0 : units === 1 ? 1 : units <= 3 ? 2 : units <= 5 ? 3 : 4);

export function buildGrid(days: Record<string, DayCount>, today: Date, weeks = 26): Grid {
  const todayKey = localDay(today);
  // Columns are Monday-to-Sunday weeks, the last one holding today.
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const start = addDays(monday, -7 * (weeks - 1));
  const columns: Column[] = [];
  const totals = { days: 0, focus: 0, quizzes: 0, sessions: 0 };
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const cells: Cell[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, w * 7 + i);
      const date = localDay(d);
      const future = date > todayKey;
      const c = days[date] ?? { focus: 0, quizzes: 0 };
      const sessions = c.sessions ?? 0;
      const units = future ? 0 : c.focus + c.quizzes;
      if (!future && units) { totals.days++; totals.focus += c.focus; totals.quizzes += c.quizzes; totals.sessions += sessions; }
      const when = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
      const what = units
        ? [sessions && plural(sessions, 'session'), c.focus && plural(c.focus, 'focus block'), c.quizzes && plural(c.quizzes, 'quiz', 'quizzes')].filter(Boolean).join(' · ')
        : 'nothing';
      cells.push({ date, focus: c.focus, quizzes: c.quizzes, sessions, level: levelFor(units), future, title: `${when}: ${what}` });
    }
    const first = addDays(start, w * 7);
    const month = first.getMonth() !== lastMonth && first.getDate() <= 7 ? first.toLocaleDateString([], { month: 'short' }) : null;
    if (month) lastMonth = first.getMonth();
    columns.push({ month, cells });
  }
  // Streak: consecutive days with a session, ending today (or yesterday, if today has none yet).
  // A quiz alone doesn't keep it going: a session is the habit.
  let streak = 0;
  let d = today;
  const sessionsOn = (x: Date) => days[localDay(x)]?.sessions ?? 0;
  if (!sessionsOn(d)) d = addDays(d, -1);
  while (sessionsOn(d) > 0) { streak++; d = addDays(d, -1); }
  return { columns, totals, streak };
}
