import { test, expect } from './fixtures';

// The quiz on a phone-narrow window: nothing overflows sideways, every control is reachable.
test.use({ config: { lastNote: 'dsa/heaps.md', quiz: { count: 0, seconds: 30, types: [], order: 'random' } } });

const noSideScroll = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const quiz = document.getElementById('quiz')!;
  const wide = [...quiz.querySelectorAll<HTMLElement>('*')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1);
  return { overflow: document.documentElement.scrollWidth - innerWidth, wide: wide.map((e) => e.className).slice(0, 5) };
});

test('quiz at 320px', async ({ page, app }) => {
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setContentSize(320, 760); });
  await page.setViewportSize({ width: 320, height: 760 });
  await page.keyboard.press('Control+Shift+Q');
  await expect(page.locator('.quiz-title')).toHaveText('heaps');
  expect(await noSideScroll(page)).toEqual({ overflow: 0, wide: [] });

  await page.getByRole('button', { name: /Start 3 questions/ }).click();
  expect(await page.locator('.quiz-progress').innerText()).toBe('1 of 3'); // "Question" dropped to fit
  expect(await noSideScroll(page)).toEqual({ overflow: 0, wide: [] });

  for (let i = 0; i < 3; i++) {
    const type = await page.locator('.q-type').textContent();
    if (type === 'Pick one') await page.locator('.q-option').first().click();
    else if (type === 'Type the answer') { await page.locator('.q-text').fill('log n'); await page.keyboard.press('Enter'); }
    else { await page.getByRole('button', { name: 'Reveal answer' }).click(); await page.getByRole('button', { name: /Got it/ }).click(); }
    expect(await noSideScroll(page)).toEqual({ overflow: 0, wide: [] });
    await page.locator('[data-act=next]').click();
  }
  await expect(page.locator('.quiz-head-title')).toHaveText('Results');
  expect(await noSideScroll(page)).toEqual({ overflow: 0, wide: [] });
  await page.getByRole('button', { name: 'Back to notes' }).click();
  await expect(page.locator('body')).not.toHaveClass(/quiz-open/);
});
