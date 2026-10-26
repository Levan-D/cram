// Everything that happens over time: opening notes, read ⇄ edit, saving (with its guards),
// history, rename / delete, find, zoom, theme, live updates from disk. Ported from the old
// controller; components call these and render from the store.
//
// The safety rules live in the main process (every overwrite / delete asks first); this file
// only decides *when* to ask. React state changes that must be on screen before we measure
// (reader visible → restore scroll) go through flushSync.
import { flushSync } from 'react-dom';
import { api, type EditMenuInfo, type FolderColor, type Theme } from './api';
import { useApp, rowsFor, noteRows, autosaveOn, type CurrentNote, type StatusKind } from './store';
import { refs, finder } from './refs';
import { buildIndex } from './lib/search';
import { idHeadings, headingKey } from './lib/toc';
import { ancestors } from './lib/tree';
import { readerTopLine, scrollReaderToLine, snapshotLayout, layoutChanged, lineInLayout, type Layout } from './lib/position';
import { enhanceNote } from './lib/extras';
import { errMsg, pagesFor, WORDS_PER_PAGE } from './lib/text';
import type { ImageItem } from './lib/editor';
import { isMenuOpen, showMenu, type MenuItem } from './ui/Menu';
import { NARROW_QUERY, WIDE_QUERY } from './ui/hooks';

const get = useApp.getState;
const set = useApp.setState;

export const NARROW = () => matchMedia(NARROW_QUERY).matches; // sidebar becomes a drawer
export const WIDE = () => matchMedia(WIDE_QUERY).matches;     // contents docked left of the note
export const AUTOSAVE_MS = 10_000;
export const TOC_MAX_LEVEL = 3; // the contents panel lists h1–h3; deeper headings stay out of it
export const FOLDER_COLORS: FolderColor[] = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];
export const THEMES: Theme[] = ['system', 'light', 'dark'];
export const THEME_INFO = {
  system: { icon: 'monitor', label: 'Follow system', title: 'Theme: follow system' },
  light: { icon: 'sun', label: 'Light', title: 'Theme: light' },
  dark: { icon: 'moon', label: 'Dark', title: 'Theme: dark' },
} as const;

// ---------- small helpers ----------

let toastTimer = 0;
export function toast(text: string) {
  set({ toast: { text, id: Date.now() } });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => set({ toast: null }), 1300);
}

export const setStatus = (text = '', kind: StatusKind = '') => set({ status: { text, kind } });

export function setDirty(value: boolean) {
  if (get().dirty !== value) {
    set({ dirty: value });
    void api.setDirty(value);
  }
  if (value) setStatus('● Unsaved changes', 'dirty');
}

export const setBanner = (text: string | null, { reload = true } = {}) => set({ banner: text ? { text, reload } : null });

const patchCurrent = (patch: Partial<CurrentNote>) => {
  const c = get().current;
  if (c) set({ current: { ...c, ...patch } });
};

// ---------- note size + reading progress ----------

let metaRaf = 0;
export function updateMeta() {
  cancelAnimationFrame(metaRaf);
  metaRaf = requestAnimationFrame(() => {
    const s = get();
    if (!s.current) return;
    const pages = pagesFor(s.mode === 'edit' && refs.editor ? refs.editor.text : s.current.source);
    const r = refs.reader;
    let frac = 0;
    if (s.mode === 'read' && r) {
      const max = r.scrollHeight - r.clientHeight;
      frac = max > 0 ? r.scrollTop / max : 1;
    }
    const page = Math.min(pages, Math.max(1, Math.ceil(frac * pages)));
    const m = s.meta;
    if (m.pages !== pages || m.page !== page || Math.abs(m.frac - frac) > 0.0005) set({ meta: { pages, page, frac } });
  });
}

// ---------- sidebar ----------

const collapsedKey = () => `nv-collapsed:${get().prefs.root}`;
function loadCollapsed() {
  try { set({ collapsed: new Set(JSON.parse(localStorage.getItem(collapsedKey()) || '[]') as string[]) }); } catch { set({ collapsed: new Set() }); }
}
function saveCollapsed(collapsed: Set<string>) {
  set({ collapsed });
  try { localStorage.setItem(collapsedKey(), JSON.stringify([...collapsed])); } catch { /* UI nicety only */ }
}

export function toggleFolder(path: string) {
  const next = new Set(get().collapsed);
  if (next.has(path)) next.delete(path); else next.add(path);
  saveCollapsed(next);
}

// Make sure the folders containing `path` are expanded.
function revealInTree(path: string) {
  const next = new Set(get().collapsed);
  let changed = false;
  for (const dir of ancestors(path)) changed = next.delete(dir) || changed;
  if (changed) saveCollapsed(next);
}

// After the list or the query changed: put the keyboard cursor on the open note (or the top result).
export function resetCursor() {
  const s = get();
  const shown = noteRows(rowsFor(s));
  const cursor = s.query.trim()
    ? (shown.length ? 0 : -1)
    : shown.findIndex((x) => x.note.path === s.current?.path && !x.fav);
  set({ cursor });
}

export function setQuery(query: string) {
  set({ query });
  resetCursor();
}

export function moveCursor(step: number) {
  const s = get();
  const shown = noteRows(rowsFor(s));
  if (!shown.length) return;
  set({ cursor: s.cursor < 0 ? 0 : Math.min(shown.length - 1, Math.max(0, s.cursor + step)) });
}

export function openFromList(i: number) {
  const s = get();
  const item = noteRows(rowsFor(s))[i];
  if (!item) return;
  set({ cursor: i });
  void openNote(item.note.path, item.terms ? { query: s.query.trim(), terms: item.terms } : {});
}

export async function refreshList() {
  const notes = await api.listNotes();
  const s = get();
  const cursorPath = noteRows(rowsFor(s))[s.cursor]?.note.path;
  set({ notes, byPath: new Map(notes.map((n) => [n.path, n])), index: buildIndex(notes) });
  // keep the cursor on the same note if it's still listed
  const shown = noteRows(rowsFor(get()));
  const i = cursorPath ? shown.findIndex((r) => r.note.path === cursorPath) : -1;
  set({ cursor: Math.min(i >= 0 ? i : get().cursor, shown.length - 1) });
}

// ---------- favorites ----------

export async function toggleFavorite(path = get().current?.path) {
  if (!path) return;
  const on = !get().favorites.has(path);
  set({ favorites: new Set(await api.setFavorite(path, on)) });
  toast(on ? 'Added to favorites' : 'Removed from favorites');
}

// ---------- position: one spot per note, shared by read and edit mode ----------

const posKey = () => `nv-pos:${get().prefs.root}`;
let posMemo: Record<string, number> = {};
function loadPosMemo() {
  try { localStorage.removeItem(`nv-scroll:${get().prefs.root}`); } catch { /* old pixel memo */ }
  try { posMemo = JSON.parse(localStorage.getItem(posKey()) || '{}') as Record<string, number>; } catch { posMemo = {}; }
}

function readTop() {
  const s = get();
  return refs.reader && refs.noteBody && s.current ? readerTopLine(refs.reader, refs.noteBody, s.current.source) : 0;
}

// The reader's block layout as of the last time we knew which line was at the top. A reflow
// (window resized, a panel toggled, zoom) keeps the pixel offset but moves the lines; the
// resize itself also fires a scroll event, so whichever of the scroll handler and the resize
// observer runs first finds the old line here and puts it back.
let layout: Layout | null = null;
function snapshot() {
  const s = get();
  layout = refs.reader && refs.noteBody && s.current ? snapshotLayout(refs.reader, refs.noteBody, s.current.source) : null;
}
const reflowed = () => Boolean(layout && refs.reader && layoutChanged(layout, refs.reader));

function scrollReadTo(line: number) {
  const s = get();
  if (!refs.reader || !refs.noteBody || !s.current) return;
  scrollReaderToLine(refs.reader, refs.noteBody, s.current.source, line);
  snapshot();
}

// After a reflow: the line that was at the top (from the old layout + the unchanged scrollTop)
// goes back to the top.
function restoreAfterReflow() {
  const s = get();
  if (!layout || !refs.reader || !s.current) return;
  const line = lineInLayout(layout, refs.reader.scrollTop);
  scrollReadTo(line);
  posMemo[s.current.path] = Math.round(line * 100) / 100;
}

// The line at the top of whichever view is showing.
export function currentLine() {
  const s = get();
  if (!s.current) return 0;
  return s.mode === 'edit' ? refs.editor?.topLine() ?? 0 : readTop();
}

let posSaveTimer = 0;
function rememberPos() {
  const s = get();
  if (!s.current || s.view !== 'note') return;
  if (s.mode === 'read' && reflowed()) restoreAfterReflow(); // a reflow's own scroll event, not you scrolling
  else {
    posMemo[s.current.path] = Math.round(currentLine() * 100) / 100;
    if (s.mode === 'read') snapshot();
  }
  clearTimeout(posSaveTimer);
  posSaveTimer = window.setTimeout(() => {
    const keys = Object.keys(posMemo);
    for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete posMemo[k]; // keep it small
    try { localStorage.setItem(posKey(), JSON.stringify(posMemo)); } catch { /* UI nicety only */ }
  }, 400);
}
let posRaf = 0;
export const schedulePos = () => { cancelAnimationFrame(posRaf); posRaf = requestAnimationFrame(rememberPos); };

// The reader was resized (window, sidebar, contents panel): the text reflows, so put the line
// you were reading back at the top instead of keeping a pixel offset.
export function keepReadingPlace() {
  const s = get();
  if (s.mode !== 'read' || s.view !== 'note' || !s.current) return;
  if (reflowed()) restoreAfterReflow();
}

// ---------- back / forward ----------

function pushHistory(path: string) {
  const s = get();
  if (s.history[s.histIndex] === path) return;
  const history = [...s.history.slice(0, s.histIndex + 1), path];
  if (history.length > 100) history.shift();
  set({ history, histIndex: history.length - 1 });
}

export async function goHistory(step: number) {
  const s = get();
  let i = s.histIndex + step;
  while (i >= 0 && i < s.history.length && !s.byPath.has(s.history[i]!)) i += step; // skip deleted notes
  if (i < 0 || i >= s.history.length) return;
  if (await openNote(s.history[i]!, { fromHistory: true })) set({ histIndex: i });
}

// ---------- note actions: rename / move, delete, menus ----------

export async function renameNote(path = get().current?.path) {
  if (!path) return;
  const isCurrent = get().current?.path === path;
  if (isCurrent && !(await guardUnsaved())) return;
  let newRel: string | null;
  try { newRel = await api.renameNote(path); } catch (err) { toast(`Rename failed: ${errMsg(err)}`); return; }
  if (!newRel) return;
  const s = get();
  const favorites = new Set(s.favorites);
  if (favorites.delete(path)) favorites.add(newRel);
  set({ favorites, history: s.history.map((p) => (p === path ? newRel : p)) });
  if (path in posMemo) { posMemo[newRel] = posMemo[path]!; delete posMemo[path]; }
  await refreshList();
  if (isCurrent) {
    patchCurrent({ path: newRel }); // same note, new name: keeps edit mode if you were editing
    await openNote(newRel, { fromHistory: true });
  }
  toast(`Moved to ${newRel}`);
}

export async function deleteNote(path = get().current?.path) {
  if (!path) return;
  const isCurrent = get().current?.path === path;
  const title = get().byPath.get(path)?.title || path;
  const deleted = await api.deleteNote(path); // main process shows the warning
  if (!deleted) return;
  if (get().favorites.has(path)) set({ favorites: new Set(await api.setFavorite(path, false)) });
  if (isCurrent) {
    setDirty(false);
    showEmpty(`Moved "${title}" to the Recycle Bin.`);
  } else {
    toast(`Moved "${title}" to the Recycle Bin`);
  }
  await refreshList();
}

// ⋯ button / right-click on a note. `at` is the button or the pointer position.
export async function noteMenu(path: string, at: Element | { x: number; y: number }, fromSidebar: boolean) {
  const fav = get().favorites.has(path);
  const choice = await showMenu([
    ...(fromSidebar ? [{ id: 'open', label: 'Open', icon: 'read' as const }, { type: 'separator' as const }] : []),
    { id: 'favorite', label: fav ? 'Remove from favorites' : 'Add to favorites', icon: fav ? 'starFilled' : 'star', hint: 'Ctrl+D' },
    { id: 'rename', label: 'Rename / move…', icon: 'edit', hint: 'F2' },
    { id: 'quiz', label: 'Quiz this note', icon: 'quiz', hint: 'Ctrl+Shift+Q' },
    { type: 'separator' },
    { id: 'reveal', label: 'Show in Explorer', icon: 'folder' },
    { id: 'vscode', label: 'Open in VS Code', icon: 'code' },
    { id: 'pdf', label: 'Export as PDF…', icon: 'pdf' },
    { type: 'separator' },
    { id: 'delete', label: 'Delete…', icon: 'trash', danger: true },
  ], at);
  if (choice === 'open') void openNote(path);
  else if (choice === 'favorite') void toggleFavorite(path);
  else if (choice === 'rename') void renameNote(path);
  else if (choice === 'quiz') void hooks.openQuiz('note', path);
  else if (choice === 'reveal') api.revealNote(path).catch((err) => toast(errMsg(err)));
  else if (choice === 'vscode') api.openInVSCode(path).catch((err) => toast(errMsg(err)));
  else if (choice === 'pdf') void exportPdf(path);
  else if (choice === 'delete') void deleteNote(path);
}

// The main process prints the window, so the note has to be on screen in reading mode.
export async function exportPdf(path: string) {
  if (get().current?.path !== path && !(await openNote(path))) return;
  if (get().mode === 'edit') { toast('Finish editing (Done) first, then export'); return; }
  try {
    const file = await api.exportPdf(path);
    if (file) toast(`Saved ${file.split(/[\\/]/).pop()}`);
  } catch (err) {
    toast(`Export failed: ${errMsg(err)}`);
  }
}

export async function folderMenu(dir: string, at: { x: number; y: number }) {
  const currentColor = get().folderColors[dir] || '';
  const choice = await showMenu([
    { type: 'swatches', label: 'Color', options: [
      { id: 'color:', label: 'None', checked: !currentColor },
      ...FOLDER_COLORS.map((c) => ({ id: `color:${c}`, label: c[0]!.toUpperCase() + c.slice(1), color: `var(--fc-${c})`, checked: currentColor === c })),
    ] },
    { type: 'separator' },
    { id: 'quiz', label: 'Quiz this folder', icon: 'quiz' },
    { type: 'separator' },
    { id: 'reveal', label: 'Show in Explorer', icon: 'folder' },
    { id: 'vscode', label: 'Open folder in VS Code', icon: 'code' },
  ], at);
  if (choice === 'quiz') void hooks.openQuiz('folder', dir);
  else if (choice === 'reveal') api.revealFolder(dir).catch((err) => toast(errMsg(err)));
  else if (choice === 'vscode') api.openFolderInVSCode(dir).catch((err) => toast(errMsg(err)));
  else if (choice?.startsWith('color:')) set({ folderColors: await api.setFolderColor(dir, choice.slice(6) as FolderColor | '') });
}

// The quiz registers itself here (it imports actions, so actions can't import it).
export const hooks = {
  openQuiz: async (_kind: 'note' | 'folder', _rel: string) => {},
  hideQuiz: () => {},
  closeQuiz: () => {},
};

// ---------- opening notes ----------

function showEmpty(message: string) {
  closeFindbar();
  set({ view: 'empty', emptyMessage: message, current: null, mode: 'read', banner: null, toc: [], tocPopoverOpen: false });
}

// Read a note from disk and show it. `terms` (from a notes search) get highlighted.
// Resolves true if the note was opened.
export async function openNote(path: string, { query = '', terms = null as string[] | null, force = false, fromHistory = false } = {}) {
  hooks.hideQuiz(); // a running quiz minimizes into the sidebar box
  set({ unresolvedOpen: false });
  const s = get();
  const switching = Boolean(s.current && s.current.path !== path);
  if ((switching || force) && !(await guardUnsaved())) return false;
  // Edit mode belongs to the note you were editing; another note opens for reading.
  if (switching && get().mode === 'edit') set({ mode: 'read' });

  let note;
  try {
    note = await api.readNote(path);
  } catch {
    showEmpty(`Could not open ${path}`);
    return false;
  }

  revealInTree(note.path);
  const editing = get().mode === 'edit';
  const line = editing ? refs.editor?.topLine() ?? 0 : 0;
  flushSync(() => set({
    current: { path: note.path, title: note.title, dir: note.dir, source: note.source, mtimeMs: note.mtimeMs },
    savedText: note.source,
    autosavePaused: false,
    banner: null,
    view: 'note',
  }));
  setDirty(false);
  setStatus();

  if (editing && refs.editor) {
    // Still editing the same note (it was renamed): keep the undo history.
    if (refs.editor.text !== note.source) refs.editor.replace(note.source);
    refs.editor.scrollToLine(line);
    buildEditToc();
  } else {
    // Opened from a search: start at the top and jump to the first match. Otherwise: where you left off.
    renderReader(note.html, { line: terms?.length ? 0 : posMemo[note.path] || 0 });
  }
  if (NARROW()) set({ drawerOpen: false });
  if (!fromHistory) pushHistory(note.path);

  if (terms?.length && get().mode === 'read') openFindbar(query, terms, { focus: false });
  else closeFindbar();
  updateMeta();
  return true;
}

// `line`: source line to put at the top. `keepScroll`: stay on the line showing now.
export function renderReader(html: string, { keepScroll = false, line = 0 } = {}) {
  const reader = refs.reader;
  const body = refs.noteBody;
  if (!reader || !body) return;
  const target = keepScroll ? readTop() : line;
  refs.lastHtml = html;
  body.innerHTML = html;
  refs.readHeadings = idHeadings(body).filter((h) => Number(h.tagName[1]) <= TOC_MAX_LEVEL); // (h4+ still get anchor ids)
  flushSync(() => set({ toc: refs.readHeadings.map((h) => ({ level: Number(h.tagName[1]), text: h.textContent || '' })), tocCurrent: 0 }));
  scrollReadTo(target);
  const settled = reader.scrollTop;
  requestAnimationFrame(spyRead);
  if (get().find.open) runFind();
  updateMeta();
  // Copy buttons + diagrams. Diagrams render async and change the page height, so restore
  // again, unless you've scrolled in the meantime.
  void enhanceNote(body, { copyText: (t) => api.copyText(t) }).then(() => {
    if (refs.noteBody !== body) return;
    if (target && !get().find.open && reader.scrollTop === settled) scrollReadTo(target);
    else snapshot(); // diagrams changed the height; that's the layout we're in now
    updateMeta();
    spyRead();
    if (get().find.open) runFind();
  });
}

// Diagrams follow the light/dark theme.
export function rerenderForTheme() {
  const s = get();
  if (s.mode === 'read' && s.view === 'note' && refs.lastHtml) renderReader(refs.lastHtml, { keepScroll: true });
}

// "You are here" in the contents: the last heading that has scrolled past the top.
export function spyRead() {
  const hs = refs.readHeadings;
  const r = refs.reader;
  if (get().mode !== 'read' || !hs.length || !r?.clientHeight) return;
  const top = r.getBoundingClientRect().top + 24;
  let idx = 0;
  hs.forEach((h, i) => { if (h.getBoundingClientRect().top <= top) idx = i; });
  if (get().tocCurrent !== idx) set({ tocCurrent: idx });
}

// Edit mode contents: headings straight from the markdown; clicking one jumps the editor there.
export function buildEditToc() {
  if (get().mode !== 'edit' || !refs.editor) return;
  refs.editHeadings = refs.editor.headings().filter((h) => h.level <= TOC_MAX_LEVEL);
  set({ toc: refs.editHeadings.map((h) => ({ level: h.level, text: h.text.replace(/[*_`~]/g, '') })) });
  spyEdit();
}
export function spyEdit() {
  const editor = refs.editor;
  if (get().mode !== 'edit' || !editor || !refs.editHeadings.length) return;
  const top = editor.topPos();
  let idx = 0;
  refs.editHeadings.forEach((h, i) => { if (h.pos <= top + 1) idx = i; });
  if (get().tocCurrent !== idx) set({ tocCurrent: idx });
}
let editTocTimer = 0;
export const scheduleEditToc = () => { clearTimeout(editTocTimer); editTocTimer = window.setTimeout(buildEditToc, 300); };

export function tocGo(i: number) {
  if (get().mode === 'edit') {
    const h = refs.editHeadings[i];
    if (h) refs.editor?.jumpTo(h.pos);
  } else {
    refs.readHeadings[i]?.scrollIntoView({ block: 'start' });
  }
  setTocPopover(false);
}

// Links inside rendered notes.
export function followLink(href: string) {
  if (href.startsWith('note:')) void openNote(decodeURIComponent(href.slice(5)));
  else if (/^(https?|mailto):/i.test(href)) window.open(href); // main process opens it in the browser
  else if (href.length > 1 && href.startsWith('#')) refs.noteBody?.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView({ block: 'start' });
}

// Open a note on a source line (from the Unresolved page) and flash the block it's in.
export async function openNoteAtLine(path: string, line: number) {
  if (!(await openNote(path))) return;
  if (get().mode === 'edit') { refs.editor?.scrollToLine(line, { cursor: true }); return; }
  if (!line) return;
  scrollReadTo(line);
  if (refs.reader) refs.reader.scrollTop -= 20; // a little context above
  const blocks = [...(refs.noteBody?.querySelectorAll<HTMLElement>('[data-line]') ?? [])];
  const block = blocks.filter((b) => Number(b.dataset.line) <= line).pop();
  if (!block) return;
  block.classList.remove('flash');
  void block.offsetWidth; // restart the animation
  block.classList.add('flash');
  setTimeout(() => block.classList.remove('flash'), 1800);
}

// ---------- the "Unresolved" page ----------

export function openUnresolved() {
  hooks.hideQuiz();
  closeFindbar();
  setTocPopover(false);
  if (NARROW()) setDrawer(false);
  set({ unresolvedOpen: true });
}
export const closeUnresolved = () => set({ unresolvedOpen: false });
export const toggleUnresolved = () => (get().unresolvedOpen ? closeUnresolved() : openUnresolved());

export async function openNoteAtSection(path: string, section: string) {
  if (!(await openNote(path)) || get().mode !== 'read' || !section) return;
  const want = headingKey(section.split(' > ').pop() || '');
  const headings = [...(refs.noteBody?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? [])]; // any level, not just the contents
  headings.find((h) => headingKey(h.textContent || '') === want)?.scrollIntoView({ block: 'start' });
}

// ---------- table of contents / sidebar ----------

export function setTocPopover(open: boolean) {
  if (WIDE()) return;
  set({ tocPopoverOpen: open });
}

export const setDrawer = (open: boolean) => set({ drawerOpen: open });

export function setCollapsed(collapsed: boolean) {
  set({ prefs: { ...get().prefs, sidebarCollapsed: collapsed } });
  void api.setPref('sidebarCollapsed', collapsed);
}

// Narrow: the sidebar is a drawer. Wider: it collapses away entirely, and the toolbar
// button (only shown while collapsed) brings it back.
export function toggleSidebar() {
  if (NARROW()) setDrawer(!get().drawerOpen);
  else setCollapsed(!get().prefs.sidebarCollapsed);
}

export function focusSearch() {
  if (NARROW()) setDrawer(true);
  else if (get().prefs.sidebarCollapsed) setCollapsed(false);
  requestAnimationFrame(() => { refs.searchInput?.focus(); refs.searchInput?.select(); });
}

// ---------- zoom / theme ----------

export function setZoom(z: number, { persist = true, announce = true } = {}) {
  z = Math.min(1.6, Math.max(0.7, Math.round(z * 10) / 10));
  const line = get().view === 'note' ? currentLine() : null; // zoom around what you're reading
  set({ prefs: { ...get().prefs, zoom: z } });
  document.documentElement.style.setProperty('--zoom', String(z));
  if (line !== null) {
    if (get().mode === 'edit') requestAnimationFrame(() => refs.editor?.scrollToLine(line));
    else scrollReadTo(line);
  }
  if (persist) void api.setPref('zoom', z);
  if (announce) toast(`Zoom ${Math.round(z * 100)}%`);
  updateMeta();
}

let themeFadeTimer = 0;
export async function setTheme(theme: Theme) {
  // Cross-fade colors while the theme flips (see html.theme-fade in style.css).
  document.documentElement.classList.add('theme-fade');
  clearTimeout(themeFadeTimer);
  themeFadeTimer = window.setTimeout(() => document.documentElement.classList.remove('theme-fade'), 800);
  set({ prefs: { ...get().prefs, theme } });
  await api.setPref('theme', theme);
}

export async function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(get().prefs.theme || 'system') + 1) % THEMES.length]!;
  await setTheme(next);
  toast(THEME_INFO[next].title);
}

// ---------- find in note ----------

function syncFindCount() {
  set({ find: { ...get().find, count: finder.count, index: finder.index } });
}

export function runFind() {
  const f = get().find;
  const n = f.words ? finder.run({ words: f.words }) : finder.run({ text: f.text });
  if (n) finder.next();
  syncFindCount();
}

export function openFindbar(text = '', words: string[] | null = null, { focus = true } = {}) {
  flushSync(() => set({ find: { open: true, text, words, count: 0, index: -1 } }));
  runFind();
  if (focus) { refs.findInput?.focus(); refs.findInput?.select(); }
}

export function closeFindbar() {
  set({ find: { open: false, text: get().find.text, words: null, count: 0, index: -1 } });
  finder.clear();
}

export function setFindText(text: string) {
  set({ find: { ...get().find, text, words: null } });
  runFind();
}

export function findStep(step: 1 | -1) {
  if (step === 1) finder.next(); else finder.prev();
  syncFindCount();
}

// ---------- edit mode ----------

export async function pasteImage(file: File) {
  const c = get().current;
  if (!c) return null;
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  try {
    const link = await api.saveImage(c.path, new Uint8Array(await file.arrayBuffer()), ext);
    toast('Image saved in images/');
    return link;
  } catch (err) {
    setStatus(`Image paste failed: ${errMsg(err)}`, 'error');
    return null;
  }
}

export const toUploads = (files: File[]) => Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));

// Images dropped onto the editor: copied next to the note, linked where they were dropped.
export async function dropImages(files: File[]): Promise<ImageItem[]> {
  const c = get().current;
  if (!c) return [];
  try {
    const links = await api.addImages(c.path, await toUploads(files));
    toast(links.length === 1 ? 'Image saved in images/' : `${links.length} images saved in images/`);
    return links.map((link, i) => ({ link, alt: files[i]!.name.replace(/\.[^.]+$/, '') }));
  } catch (err) {
    setStatus(`Image drop failed: ${errMsg(err)}`, 'error');
    return [];
  }
}

export function editorChanged(text: string) {
  setDirty(text !== get().savedText);
  if (!get().dirty) setStatus();
  updateMeta();
  scheduleEditToc();
}

export async function enterEdit() {
  const s = get();
  if (s.mode === 'edit' || !s.current || !refs.editor) return;
  const line = readTop(); // open the editor on the part you were reading, cursor there
  closeFindbar();
  setTocPopover(false);
  refs.editor.load(s.savedText);
  flushSync(() => set({ mode: 'edit' }));
  refs.editor.scrollToLine(line, { cursor: true });
  buildEditToc();
  refs.editor.focus();
  updateMeta();
}

export async function exitEdit() {
  const s = get();
  if (s.mode !== 'edit' || !s.current || !refs.editor) return;
  if (s.dirty) {
    if (autosaveOn()) {
      if (!(await save())) return; // couldn't save (e.g. conflict) → stay and let them decide
    } else if (!(await api.confirmCancelEdit(s.current.title))) {
      return;
    }
  }
  posMemo[s.current.path] = refs.editor.topLine(); // reading picks up where the editor was
  setDirty(false);
  setStatus();
  flushSync(() => set({ mode: 'read' }));
  await openNote(s.current.path); // re-read: shows exactly what's on disk now
  refs.editor.load(get().savedText); // drop discarded edits (once hidden, so it doesn't re-measure)
}

// With autosave on, saves are silent (no confirm every 10 s) unless autosave is paused
// because the file changed on disk; then the next save asks before overwriting.
export async function save({ auto = false } = {}): Promise<boolean> {
  const s = get();
  if (s.mode !== 'edit' || !s.current || s.saving || !refs.editor) return false;
  const editor = refs.editor;
  const text = editor.text;
  const silent = autosaveOn() && !s.autosavePaused;
  set({ saving: true });
  if (!auto) setStatus('Saving…');
  try {
    const res = await api.saveNote(s.current.path, text, s.current.mtimeMs, { silent });
    if (!res.saved) {
      if (res.reason === 'conflict') {
        set({ autosavePaused: true });
        setBanner('This note changed on disk while you were editing. Autosave is paused.');
        setStatus('● Unsaved · autosave paused', 'dirty');
      } else {
        const dirty = get().dirty;
        setStatus(dirty ? '● Unsaved · save cancelled' : 'Save cancelled', dirty ? 'dirty' : '');
      }
      return false;
    }
    set({ savedText: text, autosavePaused: false, banner: null });
    patchCurrent({ source: text, mtimeMs: res.mtimeMs });
    setDirty(editor.text !== text); // you may have kept typing while the confirm was open
    if (!get().dirty) {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setStatus(res.unchanged ? 'No changes' : `${auto ? 'Autosaved' : 'Saved'} · ${time}`, 'saved');
    }
    return true;
  } catch (err) {
    setStatus(`Save failed: ${errMsg(err)}`, 'error');
    return false;
  } finally {
    set({ saving: false });
  }
}

export function autosaveTick() {
  const s = get();
  if (s.mode === 'edit' && autosaveOn() && s.dirty && !s.saving && !s.autosavePaused) void save({ auto: true });
}

export function toggleAutosave() {
  const on = !autosaveOn();
  set({ prefs: { ...get().prefs, autosave: on } });
  void api.setPref('autosave', on);
  toast(on ? 'Autosave on (every 10 s, no confirm)' : 'Autosave off (saves ask first)');
}

// Before leaving unsaved edits. Autosave on: just save. Otherwise Save / Don't save / Cancel.
// Resolves true if it's OK to continue.
export async function guardUnsaved(): Promise<boolean> {
  const s = get();
  if (!s.dirty || !s.current) return true;
  if (autosaveOn() && !s.autosavePaused && (await save())) return true;
  const choice = await api.confirmDiscard(s.current.title);
  if (choice === 'save') return save();
  if (choice === 'discard') {
    refs.editor?.load(get().savedText);
    setDirty(false);
    setStatus();
    return true;
  }
  return false;
}

export async function requestClose() {
  if (await guardUnsaved()) void api.closeWindow();
}

// ---------- create ----------

export async function newNote() {
  if (!get().prefs.root || !(await guardUnsaved())) return;
  const rel = await api.createNote();
  if (!rel) return;
  await refreshList();
  await openNote(rel);
  await enterEdit();
}

// ---------- live updates from disk ----------

let pendingDisk: { source: string; mtimeMs: number } | null = null;

export async function onDiskChange(changed: (string | null)[]) {
  await refreshList();
  const c = get().current;
  if (!c) return;

  if (!get().byPath.has(c.path)) {
    if (get().dirty) setBanner('This note was moved or deleted on disk. Your unsaved edits are still here.', { reload: false });
    else showEmpty('The open note was moved or deleted.');
    return;
  }

  const touched = changed.some((p) => !p || p.toLowerCase() === c.path.toLowerCase());
  if (!touched) return;
  let note;
  try { note = await api.readNote(c.path); } catch { return; }
  if (get().current?.path !== c.path) return;
  if (note.source === get().savedText) { patchCurrent({ mtimeMs: note.mtimeMs }); return; } // our own save, or a no-op touch

  if (get().mode === 'read') {
    patchCurrent({ mtimeMs: note.mtimeMs, source: note.source });
    set({ savedText: note.source });
    renderReader(note.html, { keepScroll: true });
  } else if (!get().dirty) {
    patchCurrent({ mtimeMs: note.mtimeMs, source: note.source });
    set({ savedText: note.source });
    refs.editor?.replace(note.source); // still undoable
    setDirty(false);
    setStatus('Reloaded from disk');
  } else {
    // Keep the old mtime so the next save notices the conflict.
    pendingDisk = note;
    set({ autosavePaused: true });
    setBanner('This note changed on disk while you were editing. Autosave is paused.');
  }
}

export async function bannerReload() {
  const c = get().current;
  if (!c) { setBanner(null); return; }
  const disk = pendingDisk || (await api.readNote(c.path).catch(() => null));
  if (!disk) { setBanner(null); return; }
  set({ savedText: disk.source });
  patchCurrent({ source: disk.source, mtimeMs: disk.mtimeMs });
  refs.editor?.replace(disk.source); // Ctrl+Z brings your edits back
  pendingDisk = null;
  set({ autosavePaused: false });
  setDirty(false);
  setStatus('Reloaded from disk');
  setBanner(null);
}

export function bannerDismiss() {
  // Keep editing; the next save will ask before overwriting the outside change.
  pendingDisk = null;
  setBanner(null);
}

// ---------- folder / startup ----------

export async function changeFolder() {
  if (!(await guardUnsaved())) return;
  if (!(await api.pickFolder())) return;
  hooks.closeQuiz(); // its questions belong to the old folder
  await start();
}

export async function start() {
  const s = await api.getState();
  document.documentElement.style.setProperty('--zoom', String(s.zoom || 1));
  set({
    prefs: s,
    favorites: new Set(s.favorites || []),
    folderColors: s.folderColors || {},
    history: [],
    histIndex: -1,
    current: null,
    mode: 'read',
    query: '',
    banner: null,
  });
  setDirty(false);
  setStatus();
  if (!s.root) { set({ view: 'welcome' }); return; }
  loadCollapsed();
  loadPosMemo();
  await refreshList();
  if (s.lastNote && get().byPath.has(s.lastNote)) await openNote(s.lastNote);
  else showEmpty(get().notes.length ? 'Select a note.' : 'No .md files in this folder yet.');
  resetCursor();
}

// Right-click in text (editor, inputs, selected text): spelling suggestions + edit actions.
// The main process reports the click (it knows the misspelled word); the action goes back to it.
export async function editMenu(p: EditMenuInfo) {
  // Right-clicking a note in the sidebar while text is selected elsewhere: the note menu is
  // already up (the page handled the click first); don't replace it with Copy.
  if (!p.editable && isMenuOpen()) return;
  const items: MenuItem[] = [];
  if (p.misspelled) {
    for (const w of p.suggestions) items.push({ id: `replace:${w}`, label: w, icon: 'spell' });
    if (!p.suggestions.length) items.push({ id: 'none', label: 'No suggestions', icon: 'spell', disabled: true });
    items.push({ id: 'add-word', label: `Add "${p.misspelled}" to dictionary`, icon: 'plus' }, { type: 'separator' });
  }
  if (p.editable) {
    items.push(
      { id: 'cut', label: 'Cut', icon: 'cut', hint: 'Ctrl+X', disabled: !p.canCut },
      { id: 'copy', label: 'Copy', icon: 'copy', hint: 'Ctrl+C', disabled: !p.canCopy },
      { id: 'paste', label: 'Paste', icon: 'paste', hint: 'Ctrl+V', disabled: !p.canPaste },
      { type: 'separator' },
      { id: 'selectAll', label: 'Select all', icon: 'selectAll', hint: 'Ctrl+A' },
    );
  } else {
    items.push({ id: 'copy', label: 'Copy', icon: 'copy', hint: 'Ctrl+C' });
  }
  const choice = await showMenu(items, { x: p.x, y: p.y });
  if (!choice) return;
  if (choice.startsWith('replace:')) void api.editAction('replace', choice.slice(8));
  else if (choice === 'add-word') void api.editAction('add-word', p.misspelled);
  else if (choice === 'cut' || choice === 'copy' || choice === 'paste' || choice === 'selectAll') void api.editAction(choice);
}

export const WORDS_PER_PAGE_TITLE = (pages: number) => `About ${pages} page${pages === 1 ? '' : 's'} (${WORDS_PER_PAGE} words per page)`;
