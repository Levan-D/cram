// Playwright fixture: a temp workspace (notes/ + quizzes/ + userData/) and the app running on it.
import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A long note, so read ⇄ edit sync has room to scroll.
const longNote = ['# Long note', '', 'Intro paragraph. ??? idk what this means', ''];
for (let i = 1; i <= 30; i++) {
  longNote.push(`## Section ${i}`, '', ...Array.from({ length: 6 }, (_, k) => [`Paragraph ${i}.${k}: ${'lorem ipsum dolor sit amet '.repeat(6)}`, '']).flat());
}

export const NOTES: Record<string, string> = {
  'long.md': longNote.join('\n'),
  'dsa/heaps.md': '# Heaps\n\nA heap is a complete binary tree. Heap heap heap.\n\n## Insert\n\nAdd at the end, then bubble up.\n\n## Remove\n\nMove the last one up, then sink it.\n',
  'react.md': '# React\n\nKeys keep component state.\n\nTODO: write the reconciliation section\n',
};

export const HEAP_QUIZ = `---
note: dsa/heaps.md
---

# Heaps

## Insert

### h-001 · single
Where does a new item go first?

- [x] At the end of the array
- [ ] At the root

> It's appended, then bubbles up.

### h-002 · input
Cost of an insert (Big-O)?

Answer: O(log n) | log n

> The height of a complete tree.

## Remove

### h-003 · recall
Why move the last item to the top on remove?

> It keeps the tree complete; then it sinks into place.
`;

export interface Workspace { root: string; notes: string; quizzes: string; userData: string; read(rel: string): string }

export function makeWorkspace(config: Record<string, unknown> = {}): Workspace {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-e2e-'));
  const notes = path.join(root, 'notes');
  const quizzes = path.join(root, 'quizzes');
  const userData = path.join(root, 'userData');
  for (const [rel, text] of Object.entries(NOTES)) {
    fs.mkdirSync(path.dirname(path.join(notes, rel)), { recursive: true });
    fs.writeFileSync(path.join(notes, rel), text);
  }
  fs.mkdirSync(path.join(quizzes, 'dsa'), { recursive: true });
  fs.writeFileSync(path.join(quizzes, 'dsa', 'heaps.quiz.md'), HEAP_QUIZ);
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ root: notes, theme: 'dark', autosave: true, lastNote: 'long.md', ...config }));
  return { root, notes, quizzes, userData, read: (rel) => fs.readFileSync(path.join(notes, rel), 'utf8') };
}

export async function launch(ws: Workspace): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [path.join(APP_DIR, 'e2e', 'launch.mjs')],
    cwd: APP_DIR,
    env: { ...process.env, NV_USERDATA: ws.userData },
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1300, height: 860 });
  await page.waitForFunction(() => !document.body.classList.contains('booting'));
  return { app, page };
}

// Answer the main process's native message boxes without showing them (index of the button).
export async function answerDialogs(app: ElectronApplication, response: number) {
  await app.evaluate(({ dialog }, r) => {
    dialog.showMessageBox = (async () => ({ response: r, checkboxChecked: false })) as typeof dialog.showMessageBox;
  }, response);
}

export const test = base.extend<{ ws: Workspace; app: ElectronApplication; page: Page; config: Record<string, unknown> }>({
  config: [{}, { option: true }],
  ws: async ({ config }, use) => {
    const ws = makeWorkspace(config);
    await use(ws);
    fs.rmSync(ws.root, { recursive: true, force: true });
  },
  app: async ({ ws }, use) => {
    const { app } = await launch(ws);
    await use(app);
    await app.close();
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    // The test window is usually behind other windows; without this Chromium throttles its
    // animation frames and CodeMirror stops re-rendering on scroll.
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]!;
      w.webContents.setBackgroundThrottling(false);
      w.show();
    });
    await page.setViewportSize({ width: 1300, height: 860 });
    await page.waitForFunction(() => !document.body.classList.contains('booting'));
    await use(page);
  },
});

export { expect } from '@playwright/test';
