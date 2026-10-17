# Notes Viewer

Small markdown reader + editor for `notes/` (or any folder). Pick a folder once (remembered), browse or search on the left, read or edit on the right. Follows the OS light/dark theme and works down to a quarter-screen column.

**Use it:** run `dist/NotesViewer-1.4.0-portable.exe`. It's a single file, so copy it anywhere. Windows SmartScreen may warn the first time because it's unsigned: "More info" → "Run anyway".

## Features

**Finding notes**
- **Folder tree** in the sidebar (collapsible; remembers what you collapsed). Dot-folders (`.git`, `.claude`, …) and `node_modules` are skipped.
- **Favorites** (★ button or `Ctrl+D`) pinned at the top of the sidebar. Stored per notes folder in the app's own settings file, `%APPDATA%/Notes Viewer/config.json`, never in your notes.
- **Search all notes**: ranked, Google-style. Every word must match; the word you're typing matches as a prefix; typo tolerance only for words of 5+ letters (`complxity` finds "complexity", `dek` finds nothing). Results show a snippet, and opening one highlights the matches in the note.

**Reading**
- **Table of contents**: always visible between the sidebar and the note from 1000px wide; a popover button below that. Tracks where you are.
- **Size + progress**: "Page 3 / 12" (300 words ≈ 1 page) and a progress bar under the toolbar.
- **Theme**: sun/moon button in the sidebar header (or `Ctrl+Shift+L`) cycles System → Light → Dark. Remembered.
- **Syntax highlighting** with a **copy button** on every code block.
- **Diagrams**: ```` ```mermaid ```` blocks render as flowcharts, sequence diagrams, etc. (theme-aware).
- **Math**: `$O(n^2)$` inline and `$$ … $$` blocks (KaTeX). Needs spaces around the `$`, so prose like "$5 and $10" stays text.
- **Zoom**: `Ctrl +` / `Ctrl −` / `Ctrl 0`, or `Ctrl` + mouse wheel. Remembered.
- **Find in note** with a match counter.

**Editing** (`Ctrl+E`)
- Raw markdown editor (CodeMirror): your file is edited as-is, never reformatted.
- **Formatting toolbar**: bold, italic, strikethrough, H1–H3, bullet / numbered / task lists, quote, inline code, code block, link, table, divider. Buttons toggle (click again to undo the format).
- **Paste an image** (screenshot, copied image): saved as `images/<note>-<date-time>.png` next to the note and linked on its own line. Never overwrites an existing file.
- **Autosave** every 10 seconds (toggle in the toolbar, on by default). Live page count.
- Undo/redo, find & replace, markdown-aware Enter on lists, highlighted code inside fences.

## Safety

| Action | What happens |
| --- | --- |
| Save with **autosave on** | Silent (otherwise a popup every 10 s). If the file changed outside the app, autosave **pauses** and a banner offers *Reload from disk* / *Keep my edits*; the next save then asks before overwriting. |
| Save with **autosave off** | Confirms with a `+added / −removed lines` summary before overwriting. |
| Leave edit mode | Autosave on: **Done** saves what's left. Autosave off: **Cancel** asks "Discard changes?" when there are unsaved edits. |
| Switch note / change folder / close window with unsaved edits | Autosave on: saves first. Off: Save / Don't save / Cancel. |
| Delete (hidden while editing) | Confirmation, then the file goes to the **Recycle Bin**. Never a permanent delete. |
| New note | Only inside the notes folder; never overwrites an existing file. |

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
| `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl +` / `Ctrl −` / `Ctrl 0` | Zoom in / out / reset |
| `Ctrl+Shift+L` | Switch theme (System / Light / Dark) |
| `Ctrl+\` | Toggle sidebar |
| `Esc` | Close find bar / contents / drawer |

## Why CodeMirror instead of TipTap

TipTap is WYSIWYG: it converts markdown into its own document model and back, so saving reformats the file (list markers, spacing, tables), and every save shows up as noise in `git diff`. CodeMirror edits the markdown text itself: saves are lossless and diffs show only what you changed.

## Develop

```bash
npm install
```

```bash
npm start
```

```bash
npm run dist
```

- `src/`: renderer source, bundled by esbuild into `renderer.bundle.js` and `mermaid.bundle.js`. Both are generated and gitignored. Mermaid is loaded only when a note has a diagram.
- `main.js`: main process. All file access and confirmation dialogs live here.
- `preload.cjs`: the small API exposed to the page.
- `npm run icon`: regenerates `assets/icon.png` from the SVG in `scripts/make-icon.mjs`.
- Smoke test without a window: set `NOTES_VIEWER_SMOKE=<folder>` and run `npx electron .`
