// Notes Viewer: main process. Owns all file access; the renderer never touches the disk.
// Every write is guarded: saves confirm before overwriting (and detect on-disk changes),
// new notes never overwrite an existing file, and deletes go to the Recycle Bin after a warning.
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, screen, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js/lib/common';
import markedKatex from 'marked-katex-extension';

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX_URL = pathToFileURL(path.join(here, 'index.html')).href;
const ICON = path.join(here, 'assets', 'icon.png');
const SUGGESTED_FOLDER = 'C:\\Users\\levan\\Desktop\\git-gud\\notes';
const MAX_SEARCH_BYTES = 2 * 1024 * 1024; // don't load huge files into the search index

// ---------- config (userData/config.json) ----------

const configPath = () => path.join(app.getPath('userData'), 'config.json');
let config = {};

function loadConfig() {
  try { config = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { config = {}; }
}
function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  } catch (err) { console.error('Could not save config:', err.message); }
}

// ---------- notes ----------

const toPosix = (p) => p.split(path.sep).join('/');
// Dot-folders (.git, .claude, …) and node_modules are never notes.
const isSkippedDir = (name) => name === 'node_modules' || name.startsWith('.');
const inside = (base, p) => {
  const r = path.relative(base, p);
  return Boolean(r) && !r.startsWith('..') && !path.isAbsolute(r);
};

// Recursively collect *.md files under root, as forward-slash relative paths.
function listMarkdown(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!isSkippedDir(e.name)) walk(full); }
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(toPosix(path.relative(root, full)));
    }
  };
  walk(root);
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
}

function describe(rel) {
  const slash = rel.lastIndexOf('/');
  return { path: rel, dir: slash < 0 ? '' : rel.slice(0, slash), title: rel.slice(slash + 1).replace(/\.md$/i, '') };
}

function listNotes(root) {
  return listMarkdown(root).map((rel) => {
    let text = '';
    try {
      const full = path.join(root, rel);
      if (fs.statSync(full).size <= MAX_SEARCH_BYTES) text = fs.readFileSync(full, 'utf8');
    } catch { /* unreadable: still list it */ }
    return { ...describe(rel), text };
  });
}

// Resolve an existing note path and refuse anything outside root (incl. via symlinks/junctions) or not .md.
function resolveInside(root, rel) {
  if (typeof rel !== 'string' || !rel) throw new Error('Invalid note path');
  const full = path.resolve(root, rel);
  if (!inside(root, full) || !full.toLowerCase().endsWith('.md')) throw new Error('Path is outside the notes folder');
  const real = fs.realpathSync(full);
  if (!inside(fs.realpathSync(root), real)) throw new Error('Path is outside the notes folder');
  return real;
}

// ---------- markdown ----------

const hasScheme = (href) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');
const safeDecode = (s) => { try { return decodeURI(s); } catch { return s; } };

// Render a note. Code blocks with a known language get highlight.js markup (no auto-detect:
// guessing produces junk). $math$ / $math$ render with KaTeX (only with spaces around the
// dollars, so prose like "$5 and $10" stays text); ```mermaid blocks are drawn in the renderer. Relative images become file:// URLs next to the note; relative
// links to other .md files become `note:<rel>` links that the renderer opens in the viewer.
function renderNote(root, rel, source) {
  const noteDir = path.dirname(path.resolve(root, rel));
  const marked = new Marked(
    markedHighlight({
      emptyLangClass: 'hljs',
      langPrefix: 'hljs language-',
      highlight: (code, lang) => (lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : code),
    }),
    markedKatex({ throwOnError: false }),
    {
      gfm: true,
      walkTokens(token) {
        if ((token.type !== 'image' && token.type !== 'link') || !token.href) return;
        const href = token.href.trim();
        if (hasScheme(href) || href.startsWith('#')) return;
        const target = path.resolve(noteDir, safeDecode(href.split(/[?#]/)[0]));
        if (token.type === 'image') {
          token.href = pathToFileURL(target).href;
        } else if (target.toLowerCase().endsWith('.md')) {
          const r = path.relative(root, target);
          token.href = r && !r.startsWith('..') && !path.isAbsolute(r) ? 'note:' + encodeURIComponent(toPosix(r)) : '#';
        } else {
          token.href = '#'; // other local files: not opened (no launching files from notes)
        }
      },
    },
  );
  return marked.parse(source);
}

function readNote(root, rel) {
  const full = resolveInside(root, rel);
  const norm = toPosix(path.relative(fs.realpathSync(root), full));
  const source = fs.readFileSync(full, 'utf8');
  return { ...describe(norm), source, mtimeMs: fs.statSync(full).mtimeMs, html: renderNote(root, norm, source) };
}

// ---------- safe writes ----------

// Rough "+added / −removed" line counts for the save confirmation (multiset diff, not a real LCS).
function lineDelta(before, after) {
  const count = new Map();
  for (const l of before.split('\n')) count.set(l, (count.get(l) || 0) + 1);
  let added = 0;
  for (const l of after.split('\n')) {
    const n = count.get(l) || 0;
    if (n) count.set(l, n - 1); else added++;
  }
  let removed = 0;
  for (const n of count.values()) removed += n;
  return { added, removed };
}

// Write via a temp file + rename so a crash mid-write can't leave a half-written note.
function atomicWrite(full, content) {
  const tmp = path.join(path.dirname(full), `.${path.basename(full)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, content, 'utf8');
  try { fs.renameSync(tmp, full); } catch (err) { fs.rmSync(tmp, { force: true }); throw err; }
}

let skipSaveConfirm = false; // "don't ask again until restart"

// silent: used by autosave. Never shows a dialog; reports a conflict instead of asking.
async function saveNote(win, root, rel, content, baseMtimeMs, { silent = false } = {}) {
  const full = resolveInside(root, rel);
  const name = path.basename(full);
  const disk = fs.readFileSync(full, 'utf8');
  const mtimeMs = fs.statSync(full).mtimeMs;

  // Someone else (git, another editor) changed the file since it was opened.
  if (typeof baseMtimeMs === 'number' && Math.abs(mtimeMs - baseMtimeMs) > 1 && disk !== content) {
    if (silent) return { saved: false, reason: 'conflict' };
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'File changed on disk',
      message: `"${name}" was changed outside Notes Viewer since you opened it.`,
      detail: 'Saving will overwrite those outside changes with your version.',
      buttons: ['Overwrite with my version', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (response !== 0) return { saved: false, reason: 'cancelled' };
  } else if (disk === content) {
    return { saved: true, mtimeMs, unchanged: true };
  }

  if (!silent && !skipSaveConfirm) {
    const { added, removed } = lineDelta(disk, content);
    const { response, checkboxChecked } = await dialog.showMessageBox(win, {
      type: 'question',
      title: 'Save changes',
      message: `Overwrite "${name}" with your changes?`,
      detail: `+${added} / −${removed} lines\n${full}`,
      buttons: ['Save', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      checkboxLabel: "Don't ask again until the app restarts",
    });
    if (response !== 0) return { saved: false, reason: 'cancelled' };
    if (checkboxChecked) skipSaveConfirm = true;
  }

  atomicWrite(full, content);
  return { saved: true, mtimeMs: fs.statSync(full).mtimeMs };
}

async function createNote(win, root) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'New note',
    defaultPath: path.join(root, 'untitled.md'),
    buttonLabel: 'Create',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    properties: ['showOverwriteConfirmation'],
  });
  if (canceled || !filePath) return null;
  let full = filePath.toLowerCase().endsWith('.md') ? filePath : filePath + '.md';
  const realRoot = fs.realpathSync(root);
  const parent = fs.existsSync(path.dirname(full)) ? fs.realpathSync(path.dirname(full)) : null;
  full = parent ? path.join(parent, path.basename(full)) : full;
  if (!parent || !(parent === realRoot || inside(realRoot, parent))) {
    await dialog.showMessageBox(win, { type: 'error', title: 'New note', message: 'New notes must be created inside the notes folder.', detail: root });
    return null;
  }
  if (fs.existsSync(full)) {
    await dialog.showMessageBox(win, { type: 'error', title: 'New note', message: `"${path.basename(full)}" already exists.`, detail: 'Notes Viewer never overwrites an existing file when creating a note. Pick another name.' });
    return null;
  }
  const title = path.basename(full).replace(/\.md$/i, '').replace(/[-_]+/g, ' ');
  fs.writeFileSync(full, `# ${title}\n\n`, { encoding: 'utf8', flag: 'wx' }); // wx: fail if it appeared meanwhile
  return toPosix(path.relative(realRoot, full));
}

async function deleteNote(win, root, rel) {
  const full = resolveInside(root, rel);
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Delete note',
    message: `Delete "${path.basename(full)}"?`,
    detail: `It will be moved to the Recycle Bin, so you can restore it from there.\n${full}`,
    buttons: ['Move to Recycle Bin', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (response !== 0) return false;
  await shell.trashItem(full);
  return true;
}

// Leaving edit mode with unsaved changes via Cancel.
// Pasted image → <note dir>/images/<note>-<timestamp>.<ext>. Never overwrites. Returns the
// markdown link path relative to the note.
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
function saveImage(root, rel, bytes, ext) {
  ext = String(ext).toLowerCase();
  if (!IMAGE_EXT.has(ext)) throw new Error('Unsupported image type');
  if (!(bytes instanceof Uint8Array) || bytes.length > 20 * 1024 * 1024) throw new Error('Image too large (20 MB max)');
  const note = resolveInside(root, rel);
  const dir = path.join(path.dirname(note), 'images');
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; // local time
  const base = path.basename(note, path.extname(note)).replace(/[^\p{L}\p{N}_-]+/gu, '-');
  for (let i = 0; ; i++) {
    const name = `${base}-${stamp}${i ? '-' + i : ''}.${ext}`;
    try {
      fs.writeFileSync(path.join(dir, name), bytes, { flag: 'wx' });
      return 'images/' + encodeURI(name);
    } catch (err) { if (err.code !== 'EEXIST') throw err; }
  }
}

// Leaving edit mode with unsaved changes via Cancel.
async function confirmCancelEdit(win, title) {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Discard changes',
    message: `Discard your unsaved changes to "${title}"?`,
    detail: 'Everything you changed since the last save will be lost.',
    buttons: ['Discard changes', 'Keep editing'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  return response === 0;
}

async function confirmDiscard(win, title) {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Unsaved changes',
    message: `"${title}" has unsaved changes.`,
    detail: 'Save them before continuing?',
    buttons: ['Save', "Don't save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  return ['save', 'discard', 'cancel'][response];
}

// ---------- folder watching ----------

let watcher = null;
let debounce = null;
let pending = new Set();

function watchFolder(root) {
  watcher?.close();
  watcher = null;
  if (!root) return;
  try {
    watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
      const rel = filename ? toPosix(filename.toString()) : '';
      const parts = rel.split('/');
      if (parts.slice(0, -1).some(isSkippedDir) || rel.endsWith('.tmp')) return;
      pending.add(rel);
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const changed = [...pending];
        pending = new Set();
        BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('notes-changed', changed));
      }, 300);
    });
    watcher.on('error', (err) => console.error('Watcher error:', err.message));
  } catch (err) { console.error('Could not watch folder:', err.message); }
}

// ---------- IPC ----------

function requireRoot() {
  if (!config.root || !fs.existsSync(config.root)) throw new Error('No notes folder selected');
  return config.root;
}

let dirty = false;      // renderer reports unsaved edits, so closing the window can ask first
let allowClose = false;

function registerIpc(win) {
  // Only answer our own page.
  const handle = (channel, fn) => ipcMain.handle(channel, (e, ...args) => {
    const url = e.senderFrame?.url || '';
    if (decodeURI(url).toLowerCase() !== decodeURI(INDEX_URL).toLowerCase()) throw new Error('Untrusted sender');
    return fn(...args);
  });

  handle('get-state', () => ({
    root: config.root && fs.existsSync(config.root) ? config.root : null,
    lastNote: config.lastNote || null,
    sidebarCollapsed: Boolean(config.sidebarCollapsed),
    autosave: config.autosave !== false, // on unless turned off
    zoom: Number(config.zoom) || 1,
    theme: config.theme || 'system',
    favorites: config.root ? (config.favorites?.[config.root] || []) : [],
  }));

  handle('pick-folder', async () => {
    const defaultPath = config.root || (fs.existsSync(SUGGESTED_FOLDER) ? SUGGESTED_FOLDER : undefined);
    const res = await dialog.showOpenDialog(win, { title: 'Choose notes folder', defaultPath, properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    config.root = res.filePaths[0];
    config.lastNote = null;
    saveConfig();
    watchFolder(config.root);
    return config.root;
  });

  // App preferences, validated. (Stored in userData/config.json, never in the notes folder.)
  const PREFS = {
    sidebarCollapsed: (v) => Boolean(v),
    autosave: (v) => Boolean(v),
    zoom: (v) => Math.min(1.6, Math.max(0.7, Number(v) || 1)),
    theme: (v) => (['system', 'light', 'dark'].includes(v) ? v : 'system'),
  };
  handle('set-pref', (key, value) => {
    if (!PREFS[key]) throw new Error('Unknown setting');
    config[key] = PREFS[key](value);
    if (key === 'theme') nativeTheme.themeSource = config.theme; // drives prefers-color-scheme
    saveConfig();
  });

  // Favorites are remembered per notes folder.
  const favoritesFor = (root) => (config.favorites?.[root] || []).filter((p) => typeof p === 'string');
  handle('set-favorite', (rel, on) => {
    const root = requireRoot();
    const set = new Set(favoritesFor(root));
    if (on) set.add(String(rel)); else set.delete(String(rel));
    config.favorites = { ...config.favorites, [root]: [...set].sort() };
    saveConfig();
    return config.favorites[root];
  });
  handle('save-image', (rel, bytes, ext) => saveImage(requireRoot(), rel, bytes, ext));
  handle('copy-text', (text) => clipboard.writeText(String(text))); // async (W3C-style) since Electron 44

  handle('list-notes', () => listNotes(requireRoot()));

  handle('read-note', (rel) => {
    const note = readNote(requireRoot(), rel);
    if (config.lastNote !== note.path) { config.lastNote = note.path; saveConfig(); }
    return note;
  });

  handle('save-note', (rel, content, baseMtimeMs, opts) => saveNote(win, requireRoot(), rel, String(content), baseMtimeMs, { silent: Boolean(opts?.silent) }));
  handle('create-note', () => createNote(win, requireRoot()));
  handle('delete-note', (rel) => deleteNote(win, requireRoot(), rel));
  handle('confirm-discard', (title) => confirmDiscard(win, String(title)));
  handle('confirm-cancel-edit', (title) => confirmCancelEdit(win, String(title)));
  handle('set-dirty', (value) => { dirty = Boolean(value); });
  handle('close-window', () => { allowClose = true; win.close(); });
}

// ---------- window ----------

function visibleBounds(b) {
  if (!b || !b.width || !b.height) return null;
  const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
    b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y);
  return onScreen ? b : { width: b.width, height: b.height };
}

function createWindow() {
  const saved = config.window || {};
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    ...visibleBounds(saved.bounds),
    minWidth: 320,
    minHeight: 360,
    title: 'Notes Viewer',
    icon: fs.existsSync(ICON) ? ICON : undefined,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1f22' : '#fbfbfa',
    show: false,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  if (saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  // Never navigate away; http(s)/mailto links go to the default browser instead.
  const openOutside = (url) => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { e.preventDefault(); openOutside(url); });

  win.on('close', (e) => {
    if (dirty && !allowClose) {
      // Let the renderer run its Save / Don't save / Cancel flow, then it calls close-window.
      e.preventDefault();
      win.webContents.send('request-close');
      return;
    }
    config.window = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    saveConfig();
  });

  registerIpc(win);
  win.loadFile(path.join(here, 'index.html'));
}

// ---------- smoke test: NOTES_VIEWER_SMOKE=<folder> ----------
// Lists + renders without opening a window, prints a summary, and quits.

function smoke(folder) {
  let code = 0;
  let out;
  try {
    const root = path.resolve(folder);
    const notes = listNotes(root);
    const rendered = notes.map((n) => readNote(root, n.path).html);
    const all = rendered.join('');
    let outsideRejected = false;
    try { resolveInside(root, '../outside.md'); } catch { outsideRejected = true; }
    const sample = renderNote(root, 'x.md', '```ts\nconst a: number = 1;\n```');
    out = [
      `folder: ${root}`,
      `notes: ${notes.length}`,
      `rendered total: ${all.length} chars of HTML`,
      `unicode: plus(➕)=${all.includes('➕')} squared(²)=${all.includes('²')}`,
      `outside path rejected: ${outsideRejected}`,
      `highlighted code: ${sample.includes('hljs-keyword')}`,
      `math: ${renderNote(root, 'x.md', 'Big O is $O(n^2)$ here, costs $5 and $10.').includes('katex')} / prose dollars kept: ${renderNote(root, 'x.md', 'costs $5 and $10.').includes('$5 and $10')}`,
    ].join('\n');
  } catch (err) {
    out = `SMOKE FAILED: ${err.stack || err}`;
    code = 1;
  }
  process.stdout.write(out + '\n');
  if (process.env.NOTES_VIEWER_SMOKE_OUT) fs.writeFileSync(process.env.NOTES_VIEWER_SMOKE_OUT, out + '\n', 'utf8');
  app.exit(code);
}

// ---------- startup ----------

app.whenReady().then(() => {
  if (process.env.NOTES_VIEWER_SMOKE) return smoke(process.env.NOTES_VIEWER_SMOKE);
  loadConfig();
  nativeTheme.themeSource = ['light', 'dark'].includes(config.theme) ? config.theme : 'system';
  Menu.setApplicationMenu(null);
  createWindow();
  watchFolder(config.root && fs.existsSync(config.root) ? config.root : null);
});

app.on('window-all-closed', () => app.quit());
