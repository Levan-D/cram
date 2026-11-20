// Create / Update quiz on the quiz start page: copy the prompt, paste the reply, save.
// The fake API runs the real quiz-gen.js over in-memory files.
import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../render-app';
import { openQuiz } from '../../src/quiz';
import type { QuizData } from '../../src/api';
import { prepareQuiz } from '../../quiz-gen.js';
import { compareSections, parseQuiz } from '../../quiz-format.js';

vi.mock('../../src/lib/editor', () => import('../fake-editor'));

const HEAPS = '# Heaps\n\nA heap is a tree.\n\n## Insert\n\nAdd at the end, bubble up.\n\n## Remove\n\nMove the last one up.\n';
const LISTS = '# Lists\n\nLinked lists use `next`.\n\n## Reverse\n\nThree pointers.\n';
const NOTES = { 'dsa/heaps.md': HEAPS, 'dsa/lists.md': LISTS, 'react.md': '# React\n\nKeys.\n' };

const REPLY = `Sure, here's the quiz:

\`\`\`\`markdown
# Lists

## Reverse

### lists-001 · single
How many pointers does an in-place reverse need?

- [ ] 1
- [x] 3

> prev, current and next.

### lists-002 · recall
Why keep \`next\` before relinking?

> Relinking overwrites current.next, so the rest of the list would be lost.
\`\`\`\`
`;

const quizFiles = (api: Record<string, unknown>) => api.quizFiles as Record<string, string>;
const status = (files: QuizData['files']): QuizData => ({ quizRoot: 'C:/quizzes', files, questions: [] });

async function startPage(opts: Parameters<typeof renderApp>[0], rel = 'dsa') {
  const r = await renderApp({ notes: NOTES, state: { lastNote: 'react.md' }, ...opts });
  await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('react'));
  await act(() => openQuiz('folder', rel));
  return r;
}

describe('Create quiz', () => {
  it('copies a prompt, checks the pasted reply as you go, and saves a stamped quiz', async () => {
    const { user, api } = await startPage({ quiz: status([{ note: 'dsa/lists.md', quiz: 'dsa/lists.quiz.md', exists: false }]) });
    await user.click(screen.getByRole('button', { name: 'Create quiz' }));
    const dlg = await screen.findByRole('dialog', { name: 'Create a quiz for lists' });
    const save = within(dlg).getByRole('button', { name: 'Save quiz' });
    expect(save).toBeDisabled();

    await waitFor(() => expect(within(dlg).getByRole('button', { name: 'Copy prompt' })).toBeEnabled());
    await user.click(within(dlg).getByRole('button', { name: 'Copy prompt' }));
    const prompt = api.copyText!.mock.calls.at(-1)![0] as string;
    expect(prompt).toContain('Write a quiz for my note "dsa/lists.md"');
    expect(prompt).toContain('Linked lists use `next`.');

    // A broken reply: the problems show, Save stays off.
    const box = within(dlg).getByRole('textbox', { name: 'AI reply' });
    await user.click(box);
    await user.paste(REPLY.replace('- [ ] 1', '- [x] 1'));
    expect(await within(dlg).findByText(/single needs exactly 1 correct option/)).toBeInTheDocument();
    expect(within(dlg).getByText(/Can't save yet: 1 problem/)).toBeInTheDocument();
    expect(save).toBeDisabled();

    await user.clear(box);
    await user.paste(REPLY);
    expect(await within(dlg).findByText('Ready: 2 questions')).toBeInTheDocument();
    await user.click(save);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Quiz saved: 2 questions')).toBeInTheDocument();

    const saved = quizFiles(api)['dsa/lists.md']!;
    expect(saved).toMatch(/^---\nnote: dsa\/lists\.md\nnote-hash: /);
    expect(parseQuiz(saved).questions.map((q) => q.id)).toEqual(['lists-001', 'lists-002']);
    expect(compareSections(parseQuiz(saved).meta, LISTS).inSync).toBe(true);
    expect(api.quizLoad).toHaveBeenLastCalledWith('folder', 'dsa'); // the start page reloaded
  });

  it('lets you pick the note when several have no quiz', async () => {
    const { user } = await startPage({
      quiz: status([{ note: 'dsa/heaps.md', quiz: 'dsa/heaps.quiz.md', exists: false }, { note: 'dsa/lists.md', quiz: 'dsa/lists.quiz.md', exists: false }]),
    });
    await user.click(screen.getByRole('button', { name: 'Create quiz' }));
    const dlg = await screen.findByRole('dialog', { name: 'Create a quiz' });
    const pick = within(dlg).getByRole('combobox');
    expect([...pick.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['dsa/heaps.md', 'dsa/lists.md']);
    await user.selectOptions(pick, 'dsa/lists.md');
    await user.click(within(dlg).getByRole('textbox', { name: 'AI reply' }));
    await user.paste(REPLY);
    expect(await within(dlg).findByText('Ready: 2 questions')).toBeInTheDocument();
  });
});

describe('Update quiz', () => {
  // A quiz written for an older version of the note: "Remove" changed since.
  const OLD_HEAPS = HEAPS.replace('Move the last one up.', 'Swap the root out.');
  const OLD_QUIZ = prepareQuiz({
    noteRel: 'dsa/heaps.md', noteText: OLD_HEAPS, date: '2026-11-01',
    reply: '## Insert\n\n### heaps-001 · input\nInsert cost?\n\nAnswer: O(log n)\n\n> Tree height.\n\n## Remove\n\n### heaps-002 · recall\nWhat happens to the root?\n\n> It is swapped out.\n',
  }).text;
  const outOfDate = status([{ note: 'dsa/heaps.md', quiz: 'dsa/heaps.quiz.md', exists: true, count: 2, inSync: false, changed: ['Remove'], added: [], removed: [], errors: 0 }]);

  it('says what changed and replaces only those questions', async () => {
    const { user, api } = await startPage({ quiz: outOfDate, quizFiles: { 'dsa/heaps.md': OLD_QUIZ } });
    await user.click(screen.getByRole('button', { name: 'Update quiz' }));
    const dlg = await screen.findByRole('dialog', { name: 'Update the quiz for heaps' });
    expect(await within(dlg).findByText(/Changed:/)).toHaveTextContent('Changed: Remove.');

    await user.click(within(dlg).getByRole('textbox', { name: 'AI reply' }));
    await user.paste('## Remove\n\n### heaps-003 · single\nWhich item moves to the top?\n\n- [x] The last one\n- [ ] The smallest child\n\n> The last leaf.\n');
    expect(await within(dlg).findByText('Ready: 2 questions (1 kept, 1 from the reply, 1 dropped)')).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: 'Update quiz' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const saved = parseQuiz(quizFiles(api)['dsa/heaps.md']!);
    expect(saved.questions.map((q) => q.id)).toEqual(['heaps-001', 'heaps-003']);
    expect(compareSections(saved.meta, HEAPS).inSync).toBe(true);
  });

  it('"Keep the questions" marks the quiz as up to date without a reply', async () => {
    const { user, api } = await startPage({ quiz: outOfDate, quizFiles: { 'dsa/heaps.md': OLD_QUIZ } });
    await user.click(screen.getByRole('button', { name: 'Update quiz' }));
    const dlg = await screen.findByRole('dialog', { name: 'Update the quiz for heaps' });
    await waitFor(() => expect(within(dlg).getByRole('button', { name: 'Keep the questions' })).toBeEnabled());
    await user.click(within(dlg).getByRole('button', { name: 'Keep the questions' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const saved = parseQuiz(quizFiles(api)['dsa/heaps.md']!);
    expect(saved.questions.map((q) => q.id)).toEqual(['heaps-001', 'heaps-002']);
    expect(compareSections(saved.meta, HEAPS).inSync).toBe(true);
  });
});
