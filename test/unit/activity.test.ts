import { describe, expect, it } from 'vitest';
import { buildGrid, levelFor, localDay } from '../../src/lib/activity';

describe('study heatmap grid', () => {
  const today = new Date(2026, 9, 25); // Sunday 25 Oct 2026
  const days = {
    '2026-10-25': { focus: 3, quizzes: 1, sessions: 2 },
    '2026-10-24': { focus: 1, quizzes: 0, sessions: 1 },
    '2026-10-23': { focus: 0, quizzes: 2 },               // a quiz-only day (no session)
    '2026-10-22': { focus: 2, quizzes: 0, sessions: 1 },
    '2026-10-20': { focus: 6, quizzes: 1, sessions: 3 },
    '2026-05-01': { focus: 1, quizzes: 0, sessions: 1 }, // outside the window
  };

  it('lays out whole weeks ending today, with month labels', () => {
    const g = buildGrid(days, today, 4);
    expect(g.columns).toHaveLength(4);
    expect(g.columns.every((c) => c.cells.length === 7)).toBe(true);
    expect(g.columns[0]!.cells[0]!.date).toBe('2026-09-28'); // a Monday
    expect(g.columns[3]!.cells[6]!.date).toBe('2026-10-25'); // today, last cell
    expect(g.columns.map((c) => c.month)).toEqual([null, 'Oct', null, null]);
  });

  it('levels, titles, totals and streak', () => {
    const g = buildGrid(days, today, 4);
    const cell = (date: string) => g.columns.flatMap((c) => c.cells).find((c) => c.date === date)!;
    expect(cell('2026-10-25').level).toBe(3);
    expect(cell('2026-10-25').title).toMatch(/: 2 sessions · 3 focus blocks · 1 quiz$/);
    expect(cell('2026-10-24').level).toBe(1);
    expect(cell('2026-10-23').title).toMatch(/: 2 quizzes$/);
    expect(cell('2026-10-20').level).toBe(4);
    expect(cell('2026-10-21').title).toMatch(/nothing$/);
    expect(g.totals).toEqual({ days: 5, focus: 12, quizzes: 4, sessions: 7 });
    expect(g.streak).toBe(2); // 24, 25: the quiz-only 23rd breaks it (sessions are the habit)
  });

  it('marks future days and counts a streak from yesterday when today is empty', () => {
    const g = buildGrid({ '2026-10-24': { focus: 1, quizzes: 0, sessions: 1 }, '2026-10-23': { focus: 1, quizzes: 0, sessions: 1 } }, new Date(2026, 9, 25), 2);
    expect(g.streak).toBe(2);
    const g2 = buildGrid({}, new Date(2026, 9, 21), 1); // Wednesday
    expect(g2.columns[0]!.cells.map((c) => c.future)).toEqual([false, false, false, true, true, true, true]);
    expect(levelFor(0)).toBe(0);
    expect(localDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
