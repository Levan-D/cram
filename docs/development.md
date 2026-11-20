# Development notes

Electron 44 + **React 19 + TypeScript** (renderer), **zustand** for state, plain CSS with custom-property design tokens (light/dark, motion, folder colors) at the top of `style.css`. esbuild bundles the renderer; there's no router (one window, views come from state).

- `npm run typecheck`: `tsc` over `src/` and `test/` (strict). `npm run coverage`: unit + component coverage (HTML report in `coverage/`).
- `npm run dist` type-checks and runs the unit/component tests, then builds `dist/NotesViewer-<version>-setup.exe` (NSIS installer) and `dist/NotesViewer-<version>-portable.exe`. Bump `version` in `package.json` first. Builds are unsigned. If `npm install` skipped Electron's download (install scripts blocked), run `node node_modules/electron/install.js` once.

## Layout

- `main.js`: main process (plain JS). All file access and every overwrite / delete warning live here. `preload.cjs` exposes the API; `src/api.ts` types it (keep the three in sync).
- `src/main.tsx`: entry. `src/ui/`: components (App, Sidebar, Toolbar, NoteBars, NoteArea, StatusBar, QuizPage, QuizGen, QuizPill, ImageDialog, EmojiPopover, Menu, Ask).
- `src/store.ts`: the app state (zustand). `src/actions.ts`: everything that happens over time (open, read ⇄ edit, save with its guards, history, rename / delete, find, zoom, theme, disk changes). `src/quiz.ts`: quiz state and flow.
- `src/refs.ts`: the imperative bits: the rendered note (filled with the main process's HTML, not by React), the CodeMirror editor, the find highlighter.
- `src/lib/`: framework-free logic, most of it pure and unit-tested: search, sidebar tree, read ⇄ edit position math, quiz selection, headings, CodeMirror setup and its find/replace panel.
- `quiz-format.js` (+ `.d.ts`): quiz file parser + note fingerprints, shared by the app and the CLI `npm run quiz -- <status|check|sections|stamp|misses> [--notes <dir>] [--quizzes <dir>]` (`scripts/quiz.mjs`; defaults to `notes/` and `quizzes/` in the current folder). Other tools may carry a copy of this file, so keep the format and the fingerprints backward compatible.
- `quiz-gen.js` (+ `.d.ts`): Create / Update quiz: the AI prompt, cleaning a pasted chat reply, checking it, merging an update into the old quiz, stamping. Pure; `main.js` reads and writes the files (`quiz-prompt`, `quiz-check`, `quiz-save`), `src/ui/QuizGen.tsx` is the dialog.
- Mermaid and emoji-mart are separate bundles (`mermaid.bundle.js`, `emoji.bundle.js`), loaded on first use.

## Tests

- `test/unit/`: pure logic (quiz format and fingerprints, quiz generation and syncing, quiz selection, search, tree, position math, text helpers).
- `test/ui/`: React Testing Library on jsdom, the whole app against an in-memory fake of the main-process API (`test/fake-api.ts`); CodeMirror is swapped for a stand-in (`test/fake-editor.ts`).
- `e2e/`: Playwright driving the real Electron app on a temp folder of fixture notes and quizzes (never your notes): read ⇄ edit sync at paragraph level, saving with and without autosave, find / replace, formatting, emoji, image library, menus, zoom, the quiz end to end (including Create / Update quiz writing a stamped file), and the quiz at 320px.
- `npm run icon`: regenerates `assets/icon.png` from the SVG in `scripts/make-icon.mjs`.
- Smoke test without a window: set `NOTES_VIEWER_SMOKE=<folder>` and run `npx electron .`
