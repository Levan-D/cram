import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './fixtures';

test.use({ config: { lastNote: 'dsa/heaps.md', quiz: { count: 0, seconds: 0, types: [], order: 'random' } } });

test('take a quiz, leave it, come back, finish, and log the results', async ({ page, ws }) => {
  await expect(page.locator('#note-title')).toHaveText('heaps');
  await page.keyboard.press('Control+Shift+Q');
  await expect(page.locator('.quiz-title')).toHaveText('heaps');
  await expect(page.locator('.quiz-sub')).toHaveText('3 questions · 1 note');
  await page.getByRole('button', { name: /Start 3 questions/ }).click();

  // Leave after the first answer: the quiz waits in the sidebar.
  const answer = async () => {
    const type = await page.locator('.q-type').textContent();
    if (type === 'Pick one') await page.keyboard.press('1');
    else if (type === 'Type the answer') { await page.locator('.q-text').fill('o(logn)'); await page.keyboard.press('Enter'); }
    else { await page.getByRole('button', { name: 'Reveal answer' }).click(); await page.keyboard.press('3'); }
    await expect(page.locator('[data-act=next]')).toBeVisible();
  };
  await answer();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /^Notes$/ }).click();
  const pill = page.locator('#quiz-pill');
  await expect(pill).toContainText('Quiz in progress 2/3');
  await page.locator('#list').getByText('react').click();
  await expect(page.locator('#note-title')).toHaveText('react');
  await pill.getByText('Resume').click();
  await expect(page.locator('.quiz-progress')).toContainText('Question 2 of 3');

  await answer();
  await page.keyboard.press('Enter');
  await answer();
  await page.getByRole('button', { name: 'See results' }).click();
  await expect(page.locator('.quiz-head-title')).toHaveText('Results');

  const log = fs.readFileSync(path.join(ws.quizzes, 'results.jsonl'), 'utf8').trim().split('\n');
  expect(log).toHaveLength(1);
  expect(JSON.parse(log[0]!)).toMatchObject({ scope: 'note:dsa/heaps.md', answers: expect.arrayContaining([expect.objectContaining({ q: 'dsa/heaps.quiz.md#h-002' })]) });
});

test('Esc asks before stopping a quiz', async ({ page }) => {
  await page.keyboard.press('Control+Shift+Q');
  await page.getByRole('button', { name: /Start 3 questions/ }).click();
  await page.locator('.q-prompt').click(); // out of the answer box (there, Esc just leaves the box)
  await page.keyboard.press('Escape');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Stop this quiz?');
  await dialog.getByRole('button', { name: 'Keep going' }).click();
  await expect(page.locator('.quiz-progress')).toContainText('Question 1 of 3');
  await page.getByRole('button', { name: /Stop/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Stop quiz' }).click();
  await expect(page.locator('.quiz-title')).toHaveText('heaps'); // nothing answered → back to the start page
});
