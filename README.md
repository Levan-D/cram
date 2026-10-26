# Notes Viewer

Small markdown reader + editor for a folder of notes, built for studying: read ⇄ edit that stays on the same paragraph, quizzes generated from the notes, a Pomodoro with daily sessions, an "unresolved" list of everything you flagged `???` / `todo`, a study heatmap, export to PDF. Pick a folder once (remembered), browse or search on the left, read or edit on the right. Follows the OS light/dark theme and works down to a quarter-screen column. Windows; Electron.

**Use it:** run `dist/NotesViewer-2.4.2-portable.exe`. It's a single file, so copy it anywhere. Windows SmartScreen may warn the first time because it's unsigned: "More info" → "Run anyway". No exe? `npm install` then `npm start` (Node 24), or `npm run dist` to build your own.

It never writes outside your notes folder except for quiz logs in a `quizzes/` folder next to it, and it asks before every overwrite or delete (see Safety).

## Features

**Finding notes**
- **Folder tree** in the sidebar (collapsible; remembers what you collapsed). Dot-folders (`.git`, `.claude`, …) and `node_modules` are skipped.
- **Favorites** (⋯ menu, right-click, or `Ctrl+D`) pinned at the top of the sidebar; a ★ next to the title marks them. Stored per notes folder in the app's own settings file, `%APPDATA%/Notes Viewer/config.json`, never in your notes.
- **Back / forward** between notes: ← → buttons, `Alt+←` / `Alt+→`, or the mouse side buttons. Each note **remembers where you were** (opening from search still jumps to the match).
- **Right-click a note** (or the ⋯ button, far right of the toolbar): open, favorite, rename / move, quiz, show in Explorer, open in VS Code, delete. Right-click a folder for colors, quiz this folder, Explorer / VS Code. All menus are drawn by the app (icons, light/dark), including the spelling / cut-copy-paste menu in the editor.
- **Folder colors**: right-click a folder → Color (8 colors or None). The name is tinted and its notes get a guide line; subfolders inherit unless they have their own color. Stored in the app's settings, not in your notes. Right-click also offers Show in Explorer / Open in VS Code.
- **Search all notes**: ranked, Google-style. Every word must match; the word you're typing matches as a prefix; typo tolerance only for words of 5+ letters (`complxity` finds "complexity", `dek` finds nothing). Results show a snippet, and opening one highlights the matches in the note.

**Reading**
- **Table of contents**: always visible between the sidebar and the note from 1000px wide; a popover button below that. Tracks where you are, in read **and** edit mode.
- **Status bar**: save state, "Page 3 / 12" (300 words ≈ 1 page), autosave toggle, zoom. Plus a progress bar under the toolbar.
- **Settings** (gear in the sidebar header, `Ctrl+,`): theme (System / Light / Dark; `Ctrl+Shift+L` cycles), the notes folder, autosave; the app version at the bottom. Zoom is in the status bar (`Ctrl` +/−/0, `Ctrl` + wheel). All remembered.
- **Syntax highlighting** with a **copy button** on every code block.
- **Diagrams**: ```` ```mermaid ```` blocks render as flowcharts, sequence diagrams, etc. (theme-aware).
- **Math**: `$O(n^2)$` inline and `$$ … $$` blocks (KaTeX). Needs spaces around the `$`, so prose like "$5 and $10" stays text.
- **Zoom**: − / + in the status bar (click the % to reset), `Ctrl +` / `Ctrl −` / `Ctrl 0`, or `Ctrl` + mouse wheel. Remembered.
- **Find in note** with a match counter.
- **Read and edit stay in sync**: Edit opens the editor on the paragraph you were reading (cursor there), and Done brings you back to the same spot. One position per note, kept by markdown line rather than pixels, so it also survives zooming and theme changes.
- Thin scrollbars (10px for the note, 4px elsewhere, no arrows) and short transitions (150 ms hovers, 300 ms panels and popovers). Animations turn off when Windows "Show animations" is off.

**Editing** (`Ctrl+E`)
- Raw markdown editor (CodeMirror): your file is edited as-is, never reformatted. Edit mode is per note: opening another note opens it for reading (unsaved edits are saved or asked about first).
- **Formatting toolbar**: bold, italic, strikethrough, H1–H3, bullet / numbered / task lists, quote, inline code, code block, link, image, table, emoji, divider. Buttons toggle (click again to undo the format).
- **Images**: the image button opens a small media library for the note's `images/` folder: thumbnails (Ctrl/Shift-click for several, double-click to insert), an All / Not-in-note filter, a details panel with a big preview, dimensions, size and alt text, and **Upload** (opens in `images/`). Drop or paste images anywhere in the panel. You can also **drop images straight onto the editor** or **paste** a screenshot. Pasted images are named after the note (`note.png`, `note-1.png`, …); existing files are never overwritten.
- **Emoji picker** (smiley button): search, categories, skin tones, frequently used (emoji-mart, works offline).
- **Autosave** every 10 seconds (toggle in the status bar, on by default). Live page count.
- **Contents panel** built from the markdown headings (h1–h3; deeper ones stay out of it but keep their `#anchors`); click one to jump the editor there.
- **Spellcheck** with right-click suggestions and "Add to dictionary".
- **Find & replace** (`Ctrl+F`): a bar at the top with match count, match case / whole word / regex toggles (Aa, ab, .*), previous / next, and a fold-out replace row (Enter = replace, Ctrl+Enter = replace all).
- Undo/redo, markdown-aware Enter on lists, highlighted code inside fences.

### Quiz

- **Start a quiz** from the ⋯ menu or a right-click on a note (*Quiz this note*), a right-click on a folder (*Quiz this folder*), or `Ctrl+Shift+Q`. The quiz page has one big **Start** button with the settings underneath: what to quiz (this note / its folder / all notes), number of questions (5 / 10 / 20 / 30 / all), time per question (off / 15–90 s), question types, order (random / weak spots first). Settings are remembered.
- Questions come from `quizzes/<note>.quiz.md` in a `quizzes/` folder next to the notes folder: plain markdown you write by hand or have an AI generate from a note (format: [docs/quiz-format.md](docs/quiz-format.md); in git-gud, Claude's `/quiz-gen` skill does it and keeps them in sync). Four types: pick one, pick several, type the answer, and explain (think it, reveal the model answer, grade yourself).
- Each idea has several **rewordings**; a quiz asks one per idea and picks the one you've seen least, so repeat quizzes stay fresh.
- **Leave a quiz any time** (*Notes* button, or click a note): it waits, timer paused, in a *Quiz in progress* box above the sidebar footer; click it to pick up where you were. **Stop** (or `Esc`) asks first, then shows the results for what you answered. Finished results wait in the same box too (so *Open in note* → read → back to the results works); ✕ closes them.
- Instant feedback with the explanation, keyboard-first (`1`–`9` answer, `Enter` check / next, `Esc` stop). Results: score, every question with your answer and the right one, **Retry missed**, **Open in note** (jumps to the section), **Copy misses for Claude**.
- Every quiz you take is appended to `quizzes/results.jsonl` (the only file the quiz writes). "Weak spots first" and the rewording rotation use it, and so does `npm run quiz -- misses`.
- If a note changed after its quiz was written, the start page says which sections and offers a `/quiz-gen sync` command to copy (for git-gud; otherwise re-generate the file and run `npm run quiz -- stamp <quiz>`); questions from changed sections are marked. The start page refreshes by itself when a quiz file changes on disk.

### Unresolved

- The flag button at the top of the sidebar (badge = count, `Ctrl+Shift+U`) lists every line across your notes that you flagged as unfinished, grouped by note with the section it's under. Three kinds, filterable: **Confused** (`???`, `??`, `?!`, `idk`, `wtf`, `huh`, `no idea`, `don't get it`, `confused`), **To do** (`todo`, `fixme`, `tbd`, `wip`, `do it later`, `revisit`, `come back to this`), and **Claude's ➕** lines. Deliberate markers only (words that also occur in prose, like *lookup* or *verify*, are not; unchecked `- [ ]` boxes are study checklists, not markers): whole words, code blocks skipped, a single `?` doesn't count. The list is in `src/lib/unresolved.ts`.
- Click a line to open the note there (the block lights up for a moment). Clearing the list is the study list.

### Study activity

- The calendar button next to the tomato opens a GitHub-style heatmap of the last 26 weeks: Pomodoro sessions and focus blocks, plus quizzes taken, per day, with totals and the streak. Counts live in `quizzes/activity.json` (per day: finished focus blocks and sessions, nothing else); quizzes come from `results.jsonl`.
- **Daily sessions**: a session is a Pomodoro run that got at least one focus block to the end (start-and-stop inside the first block doesn't count; skipping doesn't either). 1 = ok, 2 = good, 3 = sexy; the tomato shows today's as three dots and ripens at 3. More than 3 aren't counted. The streak in the heatmap is days with a session; a quiz alone doesn't extend it. Nothing is tracked without the timer, by design.

### Export as PDF

- ⋯ menu (or right-click a note) → **Export as PDF…** → save dialog (asks before overwriting). Prints the note only, always light on white, A4, code and tables kept on one page where possible. Works in reading mode.

### Pomodoro

- A tomato in the sidebar footer. Click it for the settings (focus / short break / long break / number of focus blocks, defaults 25 / 5 / 10 / 3 ≈ 1 h 35 min; three runs make a full study day) and **Start**. While it runs, the footer shows the countdown (red = focus, green = break), the cycle, and a stop button; the window title carries the countdown too, so it's visible in the taskbar.
- Click the countdown for the details: a ring, the cycle dots, what's next, when the session ends, Pause / Skip / Stop. Phases follow each other on their own.
- Each phase end plays a soft chime (three different ones: focus done, break over, session complete; quiet, middle register) and shows a Windows notification.

## Safety

| Action | What happens |
| --- | --- |
| Save with **autosave on** | Silent (otherwise a popup every 10 s). If the file changed outside the app, autosave **pauses** and a banner offers *Reload from disk* / *Keep my edits*; the next save then asks before overwriting. |
| Save with **autosave off** | Confirms with a `+added / −removed lines` summary before overwriting. |
| Leave edit mode | Autosave on: **Done** saves what's left. Autosave off: **Cancel** asks "Discard changes?" when there are unsaved edits. |
| Switch note / change folder / close window with unsaved edits | Autosave on: saves first. Off: Save / Don't save / Cancel. |
| Delete (⋯ menu or right-click) | Confirmation, then the file goes to the **Recycle Bin**. Never a permanent delete. |
| New note | Only inside the notes folder; never overwrites an existing file. |
| Rename / move | Only within the notes folder; never overwrites. Shows exactly which links would break (other notes linking here, relative links/images inside the note) and offers to update them; links inside code blocks are never touched. |

Writes are atomic (temp file + rename), so a crash can't leave a half-written note.

## Shortcuts

| Keys | |
| --- | --- |
| `Ctrl+P` / `/` | Search all notes (`Ctrl+K` too, outside the editor) |
| `↑` `↓` `Enter` | Pick a result |
| `Ctrl+F` | Find in note (in edit mode: CodeMirror find & replace) |
| `Ctrl+E` | Edit / Done |
| `Ctrl+S` | Save |
| `Ctrl+D` | Favorite / unfavorite |
| `Ctrl+N` | New note |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+K` | Bold / italic / link (in the editor) |
| `Ctrl+L` | Select line; press again to extend (in the editor) |
| `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl +` / `Ctrl −` / `Ctrl 0` | Zoom in / out / reset |
| `Alt+←` / `Alt+→` | Back / forward |
| `F2` | Rename / move note |
| `Ctrl+Shift+Q` | Quiz this note (or back to the quiz in progress) |
| `Ctrl+Shift+U` | Unresolved: ???, idk, todo, ➕ across all notes |
| `Ctrl+,` | Settings (theme, notes folder, autosave) |
| `Ctrl+Shift+L` | Switch theme (System / Light / Dark) |
| `Ctrl+\` | Toggle sidebar |
| `Esc` | Close find bar / contents / drawer |

## Later (parked ideas)

Learning-specific, to tie the viewer into the git-gud system:
- **Due-for-review badge**: count from `npm run due` / `review-queue.md` (declined for now).
- **`[[wiki links]]` + backlinks** between notes.
- **Cloze reading mode**: blur every bold / code term in a note, click to reveal.
- **Quiz progress page** from `results.jsonl`: % right per note over time, the ideas that keep missing.

Other: recent notes, quick switcher (`Ctrl+O`), collapsible sections, reading width setting, focus mode, line-numbers toggle, note templates for *New note*, "quiz this section" from the contents panel.

Known rough edges (2026-10-25 review): the quizzes folder is only watched if it exists at launch; `ask()` can't stack two dialogs; the sidebar isn't virtualized (fine up to a few hundred notes); `main.js` helpers (`rewriteLinks`, `renderWithLines`, `saveNote`'s conflict rule) have no unit tests because they live next to Electron's `dialog`, so they're only covered end to end.

## Why CodeMirror instead of TipTap

TipTap is WYSIWYG: it converts markdown into its own document model and back, so saving reformats the file (list markers, spacing, tables), and every save shows up as noise in `git diff`. CodeMirror edits the markdown text itself: saves are lossless and diffs show only what you changed.

## Develop

Electron 44 + **React 19 + TypeScript** (renderer), **zustand** for state, plain CSS with custom-property design tokens (light/dark, motion, folder colors) at the top of `style.css`. esbuild bundles the renderer; no framework router (one window, views come from state).

```bash
npm install
```

```bash
npm start
```

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
npm run dist
```

- `npm run typecheck`: `tsc` over `src/` and `test/` (strict). `npm run coverage`: unit + component coverage (HTML report in `coverage/`).
- `npm run dist` type-checks and runs the unit/component tests before building the portable exe.

**Layout**

- `main.js`: main process (plain JS). All file access and every overwrite / delete warning live here. `preload.cjs` exposes the API; `src/api.ts` types it (keep the three in sync).
- `src/main.tsx`: entry. `src/ui/`: components (App, Sidebar, Toolbar, NoteBars, NoteArea, StatusBar, QuizPage, QuizPill, ImageDialog, EmojiPopover, Menu, Ask).
- `src/store.ts`: the app state (zustand). `src/actions.ts`: everything that happens over time (open, read ⇄ edit, save with its guards, history, rename / delete, find, zoom, theme, disk changes). `src/quiz.ts`: quiz state and flow.
- `src/refs.ts`: the imperative bits: the rendered note (filled with the main process's HTML, not by React), the CodeMirror editor, the find highlighter.
- `src/lib/`: framework-free logic, most of it pure and unit-tested: search, sidebar tree, read ⇄ edit position math, quiz selection, headings, CodeMirror setup and its find/replace panel.
- `quiz-format.js` (+ `.d.ts`): quiz file parser + note fingerprints, shared by the app and the CLI `npm run quiz -- <status|check|sections|stamp|misses> [--notes <dir>] [--quizzes <dir>]` (`scripts/quiz.mjs`; defaults to `notes/` and `quizzes/` in the current folder, so from git-gud's root it just works).
- Mermaid and emoji-mart are separate bundles (`mermaid.bundle.js`, `emoji.bundle.js`), loaded on first use.

**Tests**

- `test/unit/`: pure logic (quiz format and fingerprints, quiz selection, search, tree, position math, text helpers).
- `test/ui/`: React Testing Library on jsdom, the whole app against an in-memory fake of the main-process API (`test/fake-api.ts`); CodeMirror is swapped for a stand-in (`test/fake-editor.ts`).
- `e2e/`: Playwright driving the real Electron app on a temp folder of fixture notes and quizzes (never your notes): read ⇄ edit sync at paragraph level, saving with and without autosave, find / replace, formatting, emoji, image library, menus, zoom, the quiz end to end, and the quiz at 320px.
- `npm run icon`: regenerates `assets/icon.png` from the SVG in `scripts/make-icon.mjs`.
- Smoke test without a window: set `NOTES_VIEWER_SMOKE=<folder>` and run `npx electron .`
