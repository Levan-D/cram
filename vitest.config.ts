import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } }, // Vite 8 transpiles with oxc; vitest warned about the old esbuild option
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'quiz-format.js'],
      exclude: ['src/main.tsx', 'src/*-entry.ts'],
      reporter: ['text', 'html'],
    },
  },
});
