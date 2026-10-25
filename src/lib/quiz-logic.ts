// Picking quiz questions. Variants (rewordings of one idea) share a concept; a quiz asks one
// variant per idea.
import type { QuizQuestion, QuizResult } from '../api';

export const SCORE: Record<QuizResult, number> = { right: 1, partly: 0.5, wrong: 0, timeout: 0 };

export function shuffle<T>(arr: readonly T[], random: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function ideasOf<Q extends Pick<QuizQuestion, 'concept'>>(questions: Q[]): Q[][] {
  const map = new Map<string, Q[]>();
  for (const q of questions) {
    const list = map.get(q.concept);
    if (list) list.push(q); else map.set(q.concept, [q]);
  }
  return [...map.values()];
}

// Weak spots first: missed last time (0), never answered (1), ever missed (2), the rest (3).
// Judged per idea: its most recently answered variant decides.
export function weakRank(variants: Pick<QuizQuestion, 'stats'>[]): number {
  const seen = variants.filter((q) => q.stats);
  if (!seen.length) return 1;
  const latest = seen.reduce((a, b) => (b.stats!.lastAt > a.stats!.lastAt ? b : a));
  if (latest.stats!.last !== 'right') return 0;
  return seen.some((q) => q.stats!.misses > 0) ? 2 : 3;
}

// The variant you've seen least (never-seen first, then fewest attempts, then longest ago).
export function pickVariant<Q extends Pick<QuizQuestion, 'stats'>>(variants: Q[], random: () => number = Math.random): Q {
  const score = (q: Q): [number, string] => [q.stats?.attempts || 0, q.stats?.lastAt || ''];
  return shuffle(variants, random).reduce((best, q) => {
    const [a, t] = score(q);
    const [ba, bt] = score(best);
    return a < ba || (a === ba && t < bt) ? q : best;
  });
}

// Build the list for a new run.
export function chooseQuestions(
  pool: QuizQuestion[],
  { count, order }: { count: number; order: 'random' | 'weak' },
  random: () => number = Math.random,
): QuizQuestion[] {
  let ideas = shuffle(ideasOf(pool), random);
  if (order === 'weak') ideas.sort((a, b) => weakRank(a) - weakRank(b)); // stable: random within each rank
  if (count) ideas = ideas.slice(0, count);
  return ideas.map((v) => pickVariant(v, random));
}

export const noteName = (rel: string) => (rel.split('/').pop() || rel).replace(/\.md$/i, '');
export const lastSection = (section: string) => (section || '').split(' > ').pop() || '';
export const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const plainText = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
};
