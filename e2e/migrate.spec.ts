// The app was renamed from "Notes Viewer" to "Cram": the first launch brings the old settings along.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkspace, launch } from './fixtures';

test('first launch as Cram copies the Notes Viewer settings', async () => {
  const ws = makeWorkspace({ lastNote: 'react.md' });
  const appData = path.join(ws.root, 'appData');
  const oldDir = path.join(appData, 'Notes Viewer');
  fs.mkdirSync(oldDir, { recursive: true });
  fs.renameSync(path.join(ws.userData, 'config.json'), path.join(oldDir, 'config.json'));

  const { app, page } = await launch(ws, { NV_APPDATA: appData });
  try {
    await expect(page.locator('#note-title')).toHaveText('react'); // the old notes folder and last note
    expect(JSON.parse(fs.readFileSync(path.join(ws.userData, 'config.json'), 'utf8'))).toMatchObject({ root: ws.notes });
    expect(fs.existsSync(path.join(oldDir, 'config.json'))).toBe(true); // copied, not moved
  } finally {
    await app.close();
    fs.rmSync(ws.root, { recursive: true, force: true });
  }
});
