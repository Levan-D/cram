import { defineConfig } from '@playwright/test';

// End-to-end tests drive the real Electron app (npm run test:e2e builds the renderer first).
// Every test gets its own temp notes folder and settings, never your real notes.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  outputDir: 'test-results',
});
