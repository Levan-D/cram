# Cram: user guide

Everything the app does, in detail. For install and an overview see the [README](../README.md).

## Features

**Finding notes**
- **Folder tree** in the sidebar (collapsible; remembers what you collapsed). Dot-folders (`.git`, `.claude`, …) and `node_modules` are skipped.
- **Favorites** (⋯ menu, right-click, or `Ctrl+D`) pinned at the top of the sidebar; a ★ next to the title marks them. Stored per notes folder in the app's own settings file, `%APPDATA%/Cram/config.json`, never in your notes.
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
- Questions come from `quizzes/<note>.quiz.md` in a `quizzes/` folder next to the notes folder (notes in `my/notes` → quizzes in `my/quizzes`): plain markdown, format in [quiz-format.md](quiz-format.md). Four types: pick one, pick several, type the answer, and explain (think it, reveal the model answer, grade yourself).
- **Create quiz** (on the quiz page, for notes without one) makes a quiz with **any AI chat**, no account or API key in the app: **Copy prompt** puts the note, its section names and the format rules on the clipboard; paste that into ChatGPT, Claude, Gemini or whatever you use, then paste its whole reply back into the box. The app checks it as you paste (problems listed with line numbers, so you can fix them in the box or ask the chat to), drops the chat's chatter around it, and **Save quiz** writes the file, stamped with the note's fingerprints. It never overwrites an existing quiz file.
- Each idea has several **rewordings**; a quiz asks one per idea and picks the one you've seen least, so repeat quizzes stay fresh.
- **Leave a quiz any time** (*Notes* button, or click a note): it waits, timer paused, in a *Quiz in progress* box above the sidebar footer; click it to pick up where you were. **Stop** (or `Esc`) asks first, then shows the results for what you answered. Finished results wait in the same box too (so *Open in note* → read → back to the results works); ✕ closes them.
- Instant feedback with the explanation, keyboard-first (`1`–`9` answer, `Enter` check / next, `Esc` stop). Results: score, every question with your answer and the right one, **Retry missed**, **Open in note** (jumps to the section), **Copy misses** (a plain-text summary of what you got wrong, to paste into a chat or a note).
- Every quiz you take is appended to `quizzes/results.jsonl`. "Weak spots first" and the rewording rotation use it, and so does `npm run quiz -- misses`.
- If a note changed after its quiz was written, the start page says which sections changed and marks their questions. **Update quiz** fixes that: the prompt asks the chat only about the changed and new sections (with their current questions), and saving keeps every other section's questions exactly as they were and drops the questions of removed sections. If the change didn't matter (a typo), **Keep the questions** marks the quiz up to date without a chat. The start page also refreshes by itself when a quiz file changes on disk.

### Unresolved

- The flag button at the top of the sidebar (badge = count, `Ctrl+Shift+U`) lists every line across your notes that you flagged as unfinished, grouped by note with the section it's under. Two kinds, filterable: **Confused** (`???`, `??`, `?!`, `idk`, `wtf`, `huh`, `no idea`, `don't get it`, `confused`) and **To do** (`todo`, `fixme`, `tbd`, `wip`, `do it later`, `revisit`, `come back to this`). Deliberate markers only (words that also occur in prose, like *lookup* or *verify*, are not; unchecked `- [ ]` boxes are study checklists, not markers): whole words, code blocks skipped, a single `?` doesn't count. The list is in `src/lib/unresolved.ts`.
- Click a line to open the note there (the block lights up for a moment). Clearing the list is the study list.

### Study activity

- The calendar button next to the tomato opens a GitHub-style heatmap of the last 26 weeks: Pomodoro sessions and focus blocks, plus quizzes taken, per day, with totals and the streak. Counts live in `quizzes/activity.json` (per day: finished focus blocks and sessions, nothing else); quizzes come from `results.jsonl`.
- **Daily sessions**: a session is a Pomodoro run that got at least one focus block to the end (start-and-stop inside the first block doesn't count; skipping doesn't either). 1 = ok, 2 = good, 3 = sexy; the tomato shows today's as three dots and ripens at 3. More than 3 aren't counted. The streak in the heatmap is days with a session; a quiz alone doesn't extend it. Nothing is tracked without the timer, by design.

### Export as PDF

- ⋯ menu (or right-click a note) → **Export as PDF…** → save dialog (asks before overwriting). Prints the note only, always light on white, A4, code and tables kept on one page where possible. Works in reading mode.

### Pomodoro

- A tomato in the sidebar footer. Click it for the settings (focus / short break / long break / number of focus blocks, defaults 25 / 5 / 10 / 3 ≈ 1 h 25 min; three runs make a full study day) and **Start**. While it runs, the footer shows the countdown (red = focus, green = break), the cycle, and a stop button; the window title carries the countdown too, so it's visible in the taskbar.
- Breaks only come *between* focus blocks: the run ends when its last block does. The break after every 4th block is the long one, so the long break only applies to runs of 5+ blocks (its setting is greyed out below that).
- Click the countdown for the details: a ring, the cycle dots, what's next, when the session ends, Pause / Skip / Stop. Phases follow each other on their own and keep exact time while the window is minimized.
- If the computer sleeps mid-run, the timer pauses where it was instead of counting the sleep as focus. Closing the window while a timer runs asks first.
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
| Create quiz | Writes `quizzes/<note>.quiz.md` only after the pasted reply checks out; never overwrites an existing quiz file. Refuses if the note changed since the prompt was copied (copy it again). |
| Update quiz | Rewrites that note's quiz file: questions of unchanged sections are kept byte for byte, the dialog shows how many are kept / new / dropped before you click *Update quiz*. |
| Rename / move | Only within the notes folder; never overwrites. Shows exactly which links would break (other notes linking here, relative links/images inside the note) and offers to update them; links inside code blocks are never touched. |

Writes are atomic (temp file + rename, retried while OneDrive or antivirus briefly holds the file), so a crash can't leave a half-written note. Saves keep the file's line endings (CRLF stays CRLF) and BOM, and a note that isn't UTF-8 (old ANSI or UTF-16 files) opens but is never saved over: convert it to UTF-8 first.

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
| `Ctrl+Shift+U` | Unresolved: ???, idk, todo across all notes |
| `Ctrl+,` | Settings (theme, notes folder, autosave) |
| `Ctrl+Shift+L` | Switch theme (System / Light / Dark) |
| `Ctrl+\` | Toggle sidebar |
| `Esc` | Close find bar / contents / drawer |
