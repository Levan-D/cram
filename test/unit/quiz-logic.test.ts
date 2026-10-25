import { describe, expect, it } from 'vitest';
import { chooseQuestions, fmtTime, ideasOf, lastSection, noteName, pickVariant, plainText, shuffle, weakRank } from '../../src/lib/quiz-logic';
import type { QuizQuestion, QuizStats } from '../../src/api';

// Deterministic "random" for repeatable shuffles.
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const stats = (last: string, lastAt: string, attempts = 1, misses = 0): QuizStats => ({ attempts, misses, last, lastAt });
const q = (id: string, concept = id, s: QuizStats | null = null, type: QuizQuestion['type'] = 'single'): QuizQuestion => ({
  key: `f#${id}`, id, concept, note: 'n.md', type, section: 'S', outdated: false,
  promptHtml: `<p>${id}</p>`, options: [], answers: [], explainHtml: '', stats: s,
});

describe('shuffle', () => {
  it('keeps every element and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, seeded(7));
    expect(out.sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('ideasOf', () => {
  it('groups variants of one idea', () => {
    const ideas = ideasOf([q('a'), q('ab', 'a'), q('b'), q('ac', 'a')]);
    expect(ideas.map((v) => v.map((x) => x.id))).toEqual([['a', 'ab', 'ac'], ['b']]);
  });
});

describe('weakRank', () => {
  it('ranks missed-last-time, unseen, ever-missed, then solid', () => {
    expect(weakRank([q('a', 'a', stats('wrong', '2026-10-02'))])).toBe(0);
    expect(weakRank([q('a')])).toBe(1);
    expect(weakRank([q('a', 'a', stats('right', '2026-10-02', 2, 1))])).toBe(2);
    expect(weakRank([q('a', 'a', stats('right', '2026-10-02', 2, 0))])).toBe(3);
  });
  it('lets the most recently answered variant decide', () => {
    expect(weakRank([q('a', 'a', stats('wrong', '2026-10-01', 1, 1)), q('ab', 'a', stats('right', '2026-10-03'))])).toBe(2);
    expect(weakRank([q('a', 'a', stats('right', '2026-10-05')), q('ab', 'a', stats('timeout', '2026-10-06'))])).toBe(0);
  });
});

describe('pickVariant', () => {
  it('prefers never-seen, then fewest attempts, then longest ago', () => {
    const seen = q('a', 'a', stats('right', '2026-10-02', 3));
    const fresh = q('ab', 'a');
    expect(pickVariant([seen, fresh], seeded(3)).id).toBe('ab');
    const old = q('ac', 'a', stats('right', '2026-01-01', 1));
    const recent = q('ad', 'a', stats('right', '2026-10-01', 1));
    expect(pickVariant([recent, old, seen], seeded(5)).id).toBe('ac');
  });
});

describe('chooseQuestions', () => {
  const pool = [
    q('a'), q('ab', 'a'),
    q('b', 'b', stats('right', '2026-10-01', 1)),
    q('c', 'c', stats('wrong', '2026-10-01', 1, 1)),
    q('d'),
  ];
  it('asks one variant per idea and respects the count', () => {
    const list = chooseQuestions(pool, { count: 0, order: 'random' }, seeded(9));
    expect(list).toHaveLength(4);
    expect(new Set(list.map((x) => x.concept)).size).toBe(4);
    expect(chooseQuestions(pool, { count: 2, order: 'random' }, seeded(9))).toHaveLength(2);
  });
  it('puts weak spots first', () => {
    const list = chooseQuestions(pool, { count: 0, order: 'weak' }, seeded(11));
    expect(list[0]!.concept).toBe('c');            // missed last time
    expect(list.at(-1)!.concept).toBe('b');        // solid
  });
});

describe('labels', () => {
  it('formats names, sections and times', () => {
    expect(noteName('dsa/heaps.md')).toBe('heaps');
    expect(lastSection('A > B > C')).toBe('C');
    expect(lastSection('')).toBe('');
    expect(fmtTime(65_000)).toBe('1:05');
    expect(plainText('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });
});
