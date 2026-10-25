import fs from 'node:fs';
import path from 'node:path';
import { test, expect, answerDialogs } from './fixtures';

const topLineText = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const s = document.querySelector('.cm-scroller')!;
  const t = s.getBoundingClientRect().top + 1;
  // By position, not DOM order: CodeMirror keeps the cursor's line in the DOM even off screen.
  const visible = [...document.querySelectorAll('.cm-line')]
    .map((l) => ({ text: l.textContent ?? '', r: l.getBoundingClientRect() }))
    .filter((l) => l.r.bottom > t && l.r.top < t + s.clientHeight && l.text.trim())
    .sort((a, b) => a.r.top - b.r.top);
  return visible[0]?.text ?? '';
});
// The first rendered block at the top of the reader (its text).
const readerTopBlock = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const t = document.getElementById('reader')!.getBoundingClientRect().top + 1;
  return [...document.querySelectorAll('#note-body [data-line]')].find((el) => el.getBoundingClientRect().bottom > t)?.textContent ?? '';
});
const readerTopHeading = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const t = document.getElementById('reader')!.getBoundingClientRect().top + 1;
  return [...document.querySelectorAll('#note-body h2')].find((h) => h.getBoundingClientRect().bottom > t)?.textContent ?? '';
});

test('opens the last note, with the tree, contents and page count', async ({ page }) => {
  await expect(page.locator('#note-title')).toHaveText('long');
  await expect(page.locator('#list li.folder')).toHaveText(['dsa1']);
  await expect(page.locator('#toc.docked a')).toHaveCount(31);
  await expect(page.locator('#note-meta')).toContainText(/Page 1 \/ \d+/);
  await expect(page.locator('#note-body [data-line]').first()).toHaveAttribute('data-line', '0');
});

test('read ⇄ edit keeps the same section on screen, and Done saves', async ({ page, ws }) => {
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('#note-body h2')].find((x) => x.textContent === 'Section 20')!;
    h.scrollIntoView({ block: 'start' });
  });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('body')).toHaveClass(/mode-edit/);
  await expect.poll(() => topLineText(page)).toMatch(/Section 20|Paragraph 20/);

  // Type at the cursor (it lands where you were reading).
  await page.keyboard.type('EDITED ');
  await expect(page).toHaveTitle('• long - Notes Viewer');

  // Scroll elsewhere in the editor, then Done → reading continues from the same section.
  // Let CodeMirror finish keeping the cursor in view after typing, then scroll away.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => { document.querySelector('.cm-scroller')!.scrollTop += 2500; });
  await expect.poll(() => topLineText(page)).toMatch(/Section 2[3-9]|Paragraph 2[3-9]/);
  const editorTop = (await topLineText(page)).replace(/^#+ /, '').slice(0, 18);
  await page.getByRole('button', { name: /^Done/ }).click();
  await expect(page.locator('body')).toHaveClass(/mode-read/);
  // The same paragraph / heading is at the top of the reader.
  await expect.poll(async () => (await readerTopBlock(page)).slice(0, 18)).toBe(editorTop);
  expect(ws.read('long.md')).toContain('EDITED ');
});

test('autosave off: Ctrl+S asks first and only writes on Save', async ({ page, app, ws }) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Autosave' }).click(); // turn it off
  await page.locator('.cm-content').click();
  await page.keyboard.type('Draft ');
  await answerDialogs(app, 1); // "Cancel" in the save confirmation
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-status')).toHaveText('● Unsaved · save cancelled');
  expect(ws.read('long.md')).not.toContain('Draft ');
  await answerDialogs(app, 0); // "Save"
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-status')).toContainText('Saved');
  expect(ws.read('long.md')).toContain('Draft ');
});

test('find in note (read) and find & replace (edit)', async ({ page, ws }) => {
  await page.locator('#list').getByText('heaps').click();
  await expect(page.locator('#note-title')).toHaveText('heaps');
  await page.keyboard.press('Control+f');
  await page.locator('#find-input').fill('heap');
  await expect(page.locator('#find-count')).toHaveText(/1 \/ \d+/);

  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+e');
  await page.keyboard.press('Control+f');
  const panel = page.locator('.nv-search');
  await panel.getByRole('searchbox', { name: 'Find in note' }).fill('bubble up');
  await expect(panel.locator('.count')).toHaveText('– / 1');
  await panel.getByRole('button', { name: 'Toggle replace' }).click();
  await panel.getByRole('searchbox', { name: 'Replace with' }).fill('swim up');
  await panel.getByRole('button', { name: 'Replace all' }).click();
  await page.keyboard.press('Control+s');
  await expect.poll(() => ws.read('dsa/heaps.md')).toContain('then swim up');
});

test('formatting toolbar, emoji picker and the text right-click menu', async ({ page }) => {
  await page.locator('#list').getByText('react').click();
  await page.keyboard.press('Control+e');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nbold');
  await page.keyboard.press('Shift+Home');
  await page.getByTitle('Bold (Ctrl+B)').click();
  await expect(page.locator('.cm-line').last()).toHaveText('**bold**');

  await page.locator('#emoji-btn').click();
  const picker = page.locator('em-emoji-picker');
  await expect(picker).toBeVisible();
  await picker.locator('input').fill('heavy plus');
  const plus = picker.getByRole('button', { name: '➕' }).first();
  await expect(plus).toBeVisible(); // search results rendered
  await plus.click();
  await expect(page.locator('#emoji-pop')).toBeHidden();
  await expect(page.locator('.cm-line').last()).toContainText('➕');

  await page.locator('.cm-line').first().click({ button: 'right' });
  await expect(page.getByRole('menu')).toContainText('Select all');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
});

test('image library: add by drop, then insert', async ({ page, ws }) => {
  await page.locator('#list').getByText('react').click();
  await page.keyboard.press('Control+e');
  await page.getByTitle(/Insert image/).click();
  const dialog = page.locator('#image-dialog');
  await expect(dialog.getByText('No images next to this note yet')).toBeVisible();
  // Drop a PNG onto the panel (what dragging a file in does).
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 40; c.height = 30;
    c.getContext('2d')!.fillRect(0, 0, 40, 30);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'diagram.png', { type: 'image/png' }));
    const d = document.getElementById('image-dialog')!;
    d.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    d.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await expect(dialog.locator('.thumb')).toHaveCount(1);
  expect(fs.existsSync(path.join(ws.notes, 'images', 'diagram.png'))).toBe(true);
  await expect(dialog.locator('#img-details')).toContainText('40 × 30');
  await dialog.getByRole('button', { name: 'Insert' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.cm-content')).toContainText('![diagram](images/diagram.png)');
});

test('menus: favorite from the sidebar, folder color, theme', async ({ page, app }) => {
  await page.locator('#list').getByText('react').click({ button: 'right' });
  await page.getByRole('menu').getByText('Add to favorites').click();
  await expect(page.locator('#list .section-head').first()).toHaveText('Favorites');

  await page.locator('#list li.folder').click({ button: 'right' });
  await page.getByRole('menu').getByTitle('Green').click();
  await expect(page.locator('#list li.folder')).toHaveClass(/colored/);

  // (Playwright pins prefers-color-scheme for the page, so check what the app tells Electron.)
  const theme = () => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource);
  expect(await theme()).toBe('dark');
  await page.locator('#theme-btn').click();
  await page.getByRole('menu').getByText('Light').click();
  await expect.poll(theme).toBe('light');
  await expect(page.locator('#theme-btn')).toHaveAttribute('title', /Theme: light/);
});

test('resizing the window keeps the reading position', async ({ page }) => {
  await page.evaluate(() => {
    [...document.querySelectorAll('#note-body h2')].find((x) => x.textContent === 'Section 15')!.scrollIntoView({ block: 'start' });
  });
  await expect.poll(() => readerTopHeading(page)).toBe('Section 15');
  // The position is remembered a frame after the scroll (and saved shortly after); resizing in
  // the very same frame as the scroll is a robot-only case.
  await expect.poll(() => page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('nv-pos:')) ?? '') ?? '')).toMatch(/"long\.md":1\d\d/);
  await page.setViewportSize({ width: 640, height: 600 }); // text reflows: much taller
  await expect.poll(() => readerTopHeading(page)).toMatch(/Section 1[45]/);
  await page.setViewportSize({ width: 1300, height: 860 });
  await expect.poll(() => readerTopHeading(page)).toMatch(/Section 1[45]/);
});

test('zoom keeps the reading position', async ({ page }) => {
  await page.evaluate(() => {
    [...document.querySelectorAll('#note-body h2')].find((x) => x.textContent === 'Section 12')!.scrollIntoView({ block: 'start' });
  });
  await page.keyboard.press('Control+=');
  await page.keyboard.press('Control+=');
  await expect(page.locator('#zoom-btn')).toHaveText('120%');
  await expect.poll(() => readerTopHeading(page)).toMatch(/Section 1[12]/);
});
