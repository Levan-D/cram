import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { renderApp, list } from '../render-app';
import { useQuiz, openQuiz } from '../../src/quiz';
import type { QuizData, QuizQuestion } from '../../src/api';

vi.mock('../../src/lib/editor', () => import('../fake-editor'));

const base = { note: 'dsa/heaps.md', section: 'Heaps > Insert', outdated: false, stats: null, explainHtml: '<p>Because.</p>', answers: [] as string[], options: [] as QuizQuestion['options'] };
const Q: QuizQuestion[] = [
  { ...base, key: 'h#h-1', id: 'h-1', concept: 'h-1', type: 'single', promptHtml: '<p>Where does a new item go?</p>',
    options: [{ html: 'At the end', correct: true }, { html: 'At the root', correct: false }] },
  { ...base, key: 'h#h-2', id: 'h-2', concept: 'h-2', type: 'multi', promptHtml: '<p>Which are true?</p>',
    options: [{ html: 'Complete tree', correct: true }, { html: 'Stored in an array', correct: true }, { html: 'Sorted', correct: false }] },
  { ...base, key: 'h#h-3', id: 'h-3', concept: 'h-3', type: 'input', promptHtml: '<p>Insert cost?</p>', answers: ['O(log n)', 'log n'] },
  { ...base, key: 'h#h-4', id: 'h-4', concept: 'h-4', type: 'recall', promptHtml: '<p>Why move the last one up?</p>', explainHtml: '<p>It keeps the tree complete.</p>', outdated: true },
  { ...base, key: 'h#h-4b', id: 'h-4b', concept: 'h-4', type: 'single', promptHtml: '<p>Variant of h-4</p>',
    options: [{ html: 'a', correct: true }, { html: 'b', correct: false }] },
];
const DATA: QuizData = {
  quizRoot: 'C:/quizzes',
  files: [
    { note: 'dsa/heaps.md', quiz: 'dsa/heaps.quiz.md', exists: true, count: 5, inSync: false, changed: ['Heaps > Remove'], added: [], removed: [], errors: 0 },
    { note: 'dsa/lists.md', quiz: 'dsa/lists.quiz.md', exists: false },
  ],
  questions: Q,
};

async function startPage(opts = {}) {
  // Math.random → ~1 makes every shuffle a no-op: questions and options come in file order.
  vi.spyOn(Math, 'random').mockReturnValue(0.9999);
  const r = await renderApp({ quiz: DATA, state: { lastNote: 'dsa/heaps.md' }, ...opts });
  await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('heaps'));
  await act(() => openQuiz('note', 'dsa/heaps.md'));
  return r;
}

describe('quiz start page', () => {
  it('shows the scope, stale warning, missing quizzes, and settings', async () => {
    const { user, api } = await startPage();
    expect(document.body).toHaveClass('quiz-open');
    expect(screen.getByRole('heading', { name: 'heaps' })).toBeInTheDocument();
    expect(screen.getByText('5 questions · 1 note')).toBeInTheDocument();
    expect(screen.getByText(/changed since its quiz was written \(Remove\)/)).toBeInTheDocument();
    expect(within(document.querySelector('.quiz-status')!).getByText('lists')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start 4 questions/i })).toBeEnabled(); // 4 ideas
    await user.click(screen.getByRole('button', { name: 'Copy /quiz-gen sync' }));
    expect(api.copyText).toHaveBeenCalledWith('/quiz-gen sync notes/dsa/heaps.md');

    const scope = within(screen.getByRole('group', { name: 'What to quiz' }));
    expect(scope.getAllByRole('button').map((b) => b.textContent)).toEqual(['This note', 'Folder: dsa', 'All notes']);
    await user.click(scope.getByText('All notes'));
    await waitFor(() => expect(api.quizLoad).toHaveBeenLastCalledWith('folder', ''));

    await user.click(screen.getByRole('button', { name: '5' }));
    expect(api.setPref).toHaveBeenLastCalledWith('quiz', expect.objectContaining({ count: 5 }));
    await user.click(screen.getByRole('button', { name: /explain/i }));
    expect(api.setPref).toHaveBeenLastCalledWith('quiz', expect.objectContaining({ types: ['single', 'multi', 'input'] }));
    expect(screen.getByRole('button', { name: /start 4 questions/i })).toBeInTheDocument(); // h-4b still covers idea h-4
  });

  it('goes back to the notes', async () => {
    const { user } = await startPage();
    await user.click(screen.getByRole('button', { name: /back to notes/i }));
    expect(document.body).not.toHaveClass('quiz-open');
    expect(useQuiz.getState().view).toBe('closed');
  });
});

describe('taking a quiz', () => {
  it('runs every question type, then shows and logs the results', async () => {
    const { user, api } = await startPage();
    await user.click(screen.getByRole('button', { name: /start 4 questions/i }));

    // 1. single, answered with the keyboard (wrong)
    expect(screen.getByText('Where does a new item go?')).toBeInTheDocument();
    await user.keyboard('2');
    expect(screen.getByText('Not quite')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /at the end/i })).toHaveClass('correct');
    expect(screen.getByRole('option', { name: /at the root/i })).toHaveClass('wrong');
    await user.keyboard('{Enter}');

    // 2. multi: pick both right ones, check
    await user.click(screen.getByRole('option', { name: /complete tree/i }));
    await user.click(screen.getByRole('option', { name: /stored in an array/i }));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByText('Correct')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // 3. input: typed answers are normalized
    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), 'o(LOGN){Enter}');
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.getByText(/also: log n/)).toBeInTheDocument();
    await user.keyboard('{Enter}');

    // 4. recall: reveal, see the outdated warning, grade yourself
    await user.click(screen.getByRole('button', { name: 'Reveal answer' }));
    expect(screen.getByText('It keeps the tree complete.')).toBeInTheDocument();
    expect(screen.getByText(/changed after the question was written/)).toBeInTheDocument();
    await user.keyboard('2'); // partly
    await user.click(screen.getByRole('button', { name: /see results/i }));

    expect(screen.getByText('2.5')).toBeInTheDocument();
    expect(screen.getByText('63%')).toBeInTheDocument();
    expect(api.quizLog).toHaveBeenCalledWith({
      scope: 'note:dsa/heaps.md',
      answers: [
        { q: 'h#h-1', r: 'wrong', ms: expect.any(Number) },
        { q: 'h#h-2', r: 'right', ms: expect.any(Number) },
        { q: 'h#h-3', r: 'right', ms: expect.any(Number) },
        { q: 'h#h-4', r: 'partly', ms: expect.any(Number) },
      ],
    });

    await user.click(screen.getByRole('button', { name: /copy misses for claude/i }));
    const copied = api.copyText!.mock.calls.at(-1)![0] as string;
    expect(copied).toMatch(/^App quiz misses \(heaps, \d{4}-\d\d-\d\d\): 2 of 4/);
    expect(copied).toContain('- [h-1] Where does a new item go?\n  me: At the root · answer: At the end');

    const row = screen.getByRole('button', { name: /where does a new item go/i });
    await user.click(row);
    const detail = row.closest('li')!.querySelector('.res-detail')!;
    expect(detail).toBeVisible();
    expect(detail).toHaveTextContent('You: At the root');
    expect(detail).toHaveTextContent('Answer: At the end');

    await user.click(screen.getByRole('button', { name: /retry the 2 missed/i }));
    expect(document.querySelector('.quiz-progress')).toHaveTextContent('Question 1 of 2');
  });

  it('times out a question when the clock runs out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = await startPage({ state: { lastNote: 'dsa/heaps.md', quiz: { count: 0, seconds: 15, types: [], order: 'random' } } });
    await user.click(screen.getByRole('button', { name: /start 4 questions/i }));
    expect(screen.getByText('15s')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(15_500); });
    expect(screen.getByText("Time's up")).toBeInTheDocument();
  });
});

describe('leaving and stopping', () => {
  it('minimizes into the sidebar box and resumes', async () => {
    const { user } = await startPage();
    await user.click(screen.getByRole('button', { name: /start 4 questions/i }));
    await user.keyboard('1');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: /^notes$/i }));
    expect(document.body).not.toHaveClass('quiz-open');
    const pill = document.getElementById('quiz-pill')!;
    expect(pill).toBeVisible();
    expect(pill).toHaveTextContent('Quiz in progress 2/4heaps');

    // Opening another note keeps it waiting.
    await user.click(within(list()).getByText('react'));
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('react'));
    expect(pill).toBeVisible();

    await user.click(within(pill).getByRole('button', { name: /resume/i }));
    expect(document.body).toHaveClass('quiz-open');
    expect(document.querySelector('.quiz-progress')).toHaveTextContent('Question 2 of 4');
    expect(pill).not.toBeVisible();
  });

  it('asks before stopping; keep going or stop and see what you answered', async () => {
    const { user, api } = await startPage();
    await user.click(screen.getByRole('button', { name: /start 4 questions/i }));
    await user.keyboard('1');
    await user.keyboard('{Enter}');

    await user.click(screen.getByRole('button', { name: /stop/i }));
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveTextContent("Stop this quiz?You've answered 1 of 4. The answers so far are kept in your results.");
    await user.click(within(dlg).getByRole('button', { name: 'Keep going' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('.quiz-progress')).toHaveTextContent('Question 2 of 4');

    await user.keyboard('{Escape}');
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Stop quiz' }));
    expect(screen.getByText('Results')).toBeInTheDocument();
    expect(api.quizLog).toHaveBeenCalledWith({ scope: 'note:dsa/heaps.md', answers: [{ q: 'h#h-1', r: 'right', ms: expect.any(Number) }] });
  });

  it('Esc in the sidebar search stays in the search; results wait in the box after "Open in note"', async () => {
    const { user } = await startPage();
    // Esc while typing in the notes search clears the search instead of closing the quiz.
    const search = screen.getByRole('searchbox', { name: /search all notes/i });
    await user.type(search, 'he');
    await user.keyboard('{Escape}');
    expect(search).toHaveValue('');
    expect(document.body).toHaveClass('quiz-open');

    await user.click(screen.getByRole('button', { name: /start 4 questions/i }));
    await user.keyboard('1'); // single: right
    await user.keyboard('{Enter}');
    await user.keyboard('1'); // multi: only one of two → wrong
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), 'nope{Enter}'); // input: wrong
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Reveal answer' }));
    await user.keyboard('3'); // recall: right
    await user.click(screen.getByRole('button', { name: /see results/i }));

    await user.click(screen.getByRole('button', { name: /where does a new item go/i }));
    await user.click(screen.getByRole('button', { name: /open in note/i }));
    expect(document.body).not.toHaveClass('quiz-open');
    const pill = () => document.getElementById('quiz-pill')!;
    expect(pill()).toHaveTextContent('Quiz finished 2/4heaps');
    await user.click(within(pill()).getByRole('button', { name: /^quiz finished/i }));
    expect(screen.getByText('Results')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back to notes/i }));
    await user.click(within(pill()).getByRole('button', { name: /close the results/i }));
    expect(pill()).not.toBeVisible();
    expect(useQuiz.getState().view).toBe('closed');
  });

  it('refreshes the start page when a quiz file changes on disk', async () => {
    const { api } = await startPage();
    const onChanged = api.onQuizzesChanged!.mock.calls[0]![0] as () => void;
    api.quizLoad!.mockResolvedValue({ ...DATA, questions: DATA.questions.slice(0, 2) });
    await act(() => { onChanged(); });
    await waitFor(() => expect(screen.getByText('2 questions · 1 note')).toBeInTheDocument());
  });

  it('starting another quiz while one waits asks to resume or replace it', async () => {
    const { user } = await startPage();
    await user.click(screen.getByRole('button', { name: /start 4 questions/i }));
    await user.click(screen.getByRole('button', { name: /^notes$/i }));
    void act(() => openQuiz('folder', 'dsa'));
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveTextContent('A quiz is in progress');
    await user.click(within(dlg).getByRole('button', { name: 'Resume quiz' }));
    await waitFor(() => expect(document.body).toHaveClass('quiz-open'));
    expect(document.querySelector('.quiz-progress')).toHaveTextContent('Question 1 of 4');
  });
});
