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
import { parseQuiz, compareSections, quizPathFor } from './quiz-format.js';

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
function markdownExtensions() {
  return [
    markedHighlight({
      emptyLangClass: 'hljs',
      langPrefix: 'hljs language-',
      highlight: (code, lang) => (lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : code),
    }),
    markedKatex({ throwOnError: false }),
  ];
}

function renderNote(root, rel, source) {
  const noteDir = path.dirname(path.resolve(root, rel));
  const marked = new Marked(
    ...markdownExtensions(),
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
  return renderWithLines(marked, source);
}

// Same output as marked.parse, but every top-level block gets data-line="<0-based source line>"
// so the renderer can keep read and edit mode on the same spot.
function renderWithLines(marked, source) {
  const tokens = marked.lexer(source);
  if (marked.defaults.walkTokens) marked.walkTokens(tokens, marked.defaults.walkTokens);
  let line = 0;
  let html = '';
  for (const token of tokens) {
    const out = marked.parser([token]);
    html += token.type === 'html' ? out : out.replace(/^(\s*<[a-zA-Z][\w-]*)/, `$1 data-line="${line}"`);
    line += (token.raw.match(/\n/g) || []).length;
  }
  return html;
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

// ---------- rename / move, with optional link updates ----------

const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// Apply fn only outside fenced code blocks, so code samples are never rewritten.
const outsideCode = (text, fn) => text.split(/(```[\s\S]*?```)/).map((part, i) => (i % 2 ? part : fn(part))).join('');

// Relative markdown links and images: ](path), ](<path with spaces>), optional "title".
const LINK_RE = /(\]\()(<[^>\n]+>|[^)\s]+)((?:\s+"[^"\n]*")?\))/g;

// Rewrite relative links in a note that lived in fromDir and will live in toDir. mapTarget maps
// an absolute link target to its (possibly new) absolute location. Returns the new text + count.
function rewriteLinks(source, fromDir, toDir, mapTarget) {
  let count = 0;
  const text = outsideCode(source, (chunk) => chunk.replace(LINK_RE, (m, open, raw, close) => {
    const angled = raw.startsWith('<');
    const href = angled ? raw.slice(1, -1) : raw;
    if (hasScheme(href) || href.startsWith('#') || href.startsWith('/')) return m;
    const cut = href.search(/[?#]/);
    const [p, rest] = cut < 0 ? [href, ''] : [href.slice(0, cut), href.slice(cut)];
    const target = mapTarget(path.resolve(fromDir, safeDecode(p)));
    const rel = toPosix(path.relative(toDir, target));
    const next = (angled ? rel : encodeURI(rel)) + rest;
    if (next === href) return m;
    count++;
    return open + (angled ? `<${next}>` : next) + close;
  }));
  return { text, count };
}

async function renameNote(win, root, rel) {
  const oldFull = resolveInside(root, rel);
  const realRoot = fs.realpathSync(root);
  const oldRel = toPosix(path.relative(realRoot, oldFull));
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Rename or move note',
    defaultPath: oldFull,
    buttonLabel: 'Rename / move',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (canceled || !filePath) return null;
  let newFull = filePath.toLowerCase().endsWith('.md') ? filePath : filePath + '.md';
  const parent = fs.existsSync(path.dirname(newFull)) ? fs.realpathSync(path.dirname(newFull)) : null;
  if (!parent || !(parent === realRoot || inside(realRoot, parent))) {
    await dialog.showMessageBox(win, { type: 'error', title: 'Rename or move', message: 'Notes can only be moved within the notes folder.', detail: root });
    return null;
  }
  newFull = path.join(parent, path.basename(newFull));
  if (newFull === oldFull) return null;
  const caseOnly = samePath(newFull, oldFull);
  if (fs.existsSync(newFull) && !caseOnly) {
    await dialog.showMessageBox(win, { type: 'error', title: 'Rename or move', message: `"${toPosix(path.relative(realRoot, newFull))}" already exists.`, detail: 'Notes Viewer never overwrites an existing note. Pick another name.' });
    return null;
  }
  const newRel = toPosix(path.relative(realRoot, newFull));

  // Plan link updates: other notes that link here, and relative links inside this note.
  const mapTarget = (abs) => (samePath(abs, oldFull) ? newFull : abs);
  const inbound = [];
  for (const r of listMarkdown(realRoot)) {
    const full = path.join(realRoot, r);
    if (samePath(full, oldFull)) continue;
    let src;
    try { src = fs.readFileSync(full, 'utf8'); } catch { continue; }
    const res = rewriteLinks(src, path.dirname(full), path.dirname(full), mapTarget);
    if (res.count) inbound.push({ full, ...res });
  }
  const ownSource = fs.readFileSync(oldFull, 'utf8');
  const own = rewriteLinks(ownSource, path.dirname(oldFull), path.dirname(newFull), mapTarget);
  const inboundLinks = inbound.reduce((s, n) => s + n.count, 0);

  const plan = [];
  if (inboundLinks) plan.push(`${inboundLinks} link${inboundLinks === 1 ? '' : 's'} in ${inbound.length} other note${inbound.length === 1 ? '' : 's'} point${inboundLinks === 1 ? 's' : ''} to it.`);
  if (own.count) plan.push(`${own.count} relative link${own.count === 1 ? '' : 's'}/image${own.count === 1 ? '' : 's'} inside it would break after the move.`);
  const { response, checkboxChecked } = await dialog.showMessageBox(win, {
    type: 'question',
    title: 'Rename or move note',
    message: `Move "${oldRel}" → "${newRel}"?`,
    detail: plan.length ? plan.join('\n') : 'No links need updating.',
    buttons: ['Rename / move', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    ...(plan.length ? { checkboxLabel: 'Also update those links', checkboxChecked: true } : {}),
  });
  if (response !== 0) return null;

  fs.renameSync(oldFull, newFull);
  if (plan.length && checkboxChecked) {
    if (own.count) atomicWrite(newFull, own.text);
    for (const n of inbound) atomicWrite(n.full, n.text);
  }
  // Keep favorites and "last opened" pointing at the new path.
  const favs = config.favorites?.[root];
  if (favs?.includes(oldRel)) config.favorites[root] = favs.map((p) => (p === oldRel ? newRel : p)).sort();
  if (config.lastNote === oldRel) config.lastNote = newRel;
  saveConfig();
  return newRel;
}

// ---------- native menus ----------


const vscodeUrl = (full) => 'vscode://file/' + encodeURI(full.replace(/\\/g, '/'));

const FOLDER_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];

// Images go to <note dir>/images/. Never overwrites: a -1, -2… suffix is added instead.
// Returns the markdown link path relative to the note.
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
const MAX_IMAGE = 20 * 1024 * 1024;
const slug = (s) => s.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'image';
function writeImage(noteFull, bytes, ext, stem) {
  ext = String(ext).toLowerCase();
  if (!IMAGE_EXT.has(ext)) throw new Error('Unsupported image type');
  if (bytes.length > MAX_IMAGE) throw new Error('Image too large (20 MB max)');
  const dir = path.join(path.dirname(noteFull), 'images');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; ; i++) {
    const name = `${stem}${i ? '-' + i : ''}.${ext}`;
    try {
      fs.writeFileSync(path.join(dir, name), bytes, { flag: 'wx' });
      return 'images/' + encodeURI(name);
    } catch (err) { if (err.code !== 'EEXIST') throw err; }
  }
}

// Pasted image → images/<note>.<ext> (then <note>-1, <note>-2, …)
function saveImage(root, rel, bytes, ext) {
  if (!(bytes instanceof Uint8Array)) throw new Error('Not an image');
  const note = resolveInside(root, rel);
  return writeImage(note, bytes, ext, slug(path.basename(note, path.extname(note)))); // → note.png, note-1.png, …
}

// ---------- image panel ----------

const imagesDirFor = (noteFull) => path.join(path.dirname(noteFull), 'images');
const GENERIC_NAME = /^(image|clipboard|screenshot)?\.?(png|jpe?g|gif|webp)$/i; // pasted files arrive as "image.png"

// Images in the note's images/ folder, newest first, with whether this note already uses them.
function listImages(root, rel) {
  const note = resolveInside(root, rel);
  const dir = imagesDirFor(note);
  const relDir = toPosix(path.relative(fs.realpathSync(root), dir)); // shown in the panel header
  if (!fs.existsSync(dir)) return { dir, relDir, images: [] };
  let source = '';
  try { source = fs.readFileSync(note, 'utf8'); } catch { /* still list */ }
  const images = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).slice(1).toLowerCase()))
    .map((e) => {
      const full = path.join(dir, e.name);
      const st = fs.statSync(full);
      const link = 'images/' + encodeURI(e.name);
      return { name: e.name, link, url: pathToFileURL(full).href, size: st.size, mtimeMs: st.mtimeMs, used: source.includes(link) || source.includes('images/' + e.name) };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { dir, relDir, images };
}

// Dropped / pasted files → images/. Unnamed clipboard images are named after the note.
function addImages(root, rel, files) {
  const note = resolveInside(root, rel);
  const noteStem = slug(path.basename(note, path.extname(note)));
  return files.map((f) => {
    if (!(f?.bytes instanceof Uint8Array)) throw new Error('Not an image');
    const name = String(f.name || 'image.png');
    const ext = path.extname(name).slice(1) || 'png';
    const stem = GENERIC_NAME.test(name) ? noteStem : slug(path.basename(name, path.extname(name))); // → note.png, note-1.png, …
    return writeImage(note, f.bytes, ext, stem);
  });
}

// "Browse…": the file picker opens in images/ (created if missing). Picking a file that's
// already in images/ just links it; anything else is copied in.
async function browseImages(win, root, rel) {
  const note = resolveInside(root, rel);
  const dir = imagesDirFor(note);
  fs.mkdirSync(dir, { recursive: true });
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Add images',
    defaultPath: dir,
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: [...IMAGE_EXT] }],
  });
  if (canceled) return [];
  return filePaths.map((file) => {
    if (samePath(path.dirname(file), dir)) return 'images/' + encodeURI(path.basename(file));
    const ext = path.extname(file).slice(1);
    return writeImage(note, fs.readFileSync(file), ext, slug(path.basename(file, path.extname(file))));
  });
}

function revealImages(root, rel) {
  const dir = imagesDirFor(resolveInside(root, rel));
  fs.mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
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

// ---------- quizzes ----------
// quizzes/<note path>.quiz.md, in a "quizzes" folder next to the notes folder (git-gud/notes →
// git-gud/quizzes). Claude writes them (format: quiz-format.js / quizzes/README.md); the app
// only reads them, plus appends one line per finished quiz to quizzes/results.jsonl.

const quizRootFor = (root) => path.join(path.dirname(root), 'quizzes');
const RESULTS = 'results.jsonl';
const MAX_RESULTS_BYTES = 10 * 1024 * 1024;
const RESULT_KINDS = ['right', 'wrong', 'partly', 'timeout'];

let quizMarked = null;
const quizMd = () => (quizMarked ??= new Marked(...markdownExtensions(), { gfm: true }));

// Per question: { attempts, misses, last, lastAt } from results.jsonl ("partly" = half a miss).
function quizStats(quizRoot) {
  const stats = new Map();
  let text = '';
  try {
    const file = path.join(quizRoot, RESULTS);
    if (fs.statSync(file).size > MAX_RESULTS_BYTES) return stats;
    text = fs.readFileSync(file, 'utf8');
  } catch { return stats; }
  for (const line of text.split('\n')) {
    let run;
    try { run = JSON.parse(line); } catch { continue; }
    for (const a of Array.isArray(run?.answers) ? run.answers : []) {
      const s = stats.get(a.q) || { attempts: 0, misses: 0, last: '', lastAt: '' };
      s.attempts++;
      if (a.r !== 'right') s.misses += a.r === 'partly' ? 0.5 : 1;
      s.last = a.r;
      s.lastAt = String(run.at || '');
      stats.set(a.q, s);
    }
  }
  return stats;
}

// Everything the quiz page needs for a scope: 'note' (rel = note), 'folder' (rel = folder,
// '' = all notes). Questions come with their markdown already rendered to HTML.
function loadQuiz(root, scope, rel) {
  const quizRoot = quizRootFor(root);
  rel = String(rel || '');
  const notes = listMarkdown(root).filter((n) => (scope === 'note' ? n === rel : !rel || n.startsWith(rel + '/')));
  const stats = quizStats(quizRoot);
  const md = quizMd();
  const files = [];
  const questions = [];
  for (const note of notes) {
    const quiz = quizPathFor(note);
    let text;
    try { text = fs.readFileSync(path.join(quizRoot, quiz), 'utf8'); } catch {
      files.push({ note, quiz, exists: false });
      continue;
    }
    const parsed = parseQuiz(text);
    let noteText = '';
    try { noteText = fs.readFileSync(path.join(root, note), 'utf8'); } catch { /* listed a moment ago */ }
    const cmp = compareSections(parsed.meta, noteText);
    const outdated = new Set([...cmp.changed, ...cmp.removed]);
    files.push({
      note, quiz, exists: true, count: parsed.questions.length, inSync: cmp.inSync,
      changed: cmp.changed, added: cmp.added, removed: cmp.removed, errors: parsed.errors.length,
    });
    for (const q of parsed.questions) {
      const key = `${quiz}#${q.id}`;
      questions.push({
        key, id: q.id, concept: `${quiz}#${q.concept}`, note, type: q.type, section: q.section, outdated: outdated.has(q.section),
        promptHtml: md.parse(q.prompt),
        options: q.options.map((o) => ({ html: md.parseInline(o.text), correct: o.correct })),
        answers: q.answers,
        explainHtml: q.explain ? md.parse(q.explain) : '',
        stats: stats.get(key) || null,
      });
    }
  }
  return { quizRoot, files, questions };
}

// One line per quiz taken (also when you stop early, with the questions you answered).
function logQuiz(root, entry) {
  const answers = (Array.isArray(entry?.answers) ? entry.answers : []).slice(0, 1000)
    .filter((a) => typeof a?.q === 'string' && a.q.length < 400 && RESULT_KINDS.includes(a.r))
    .map((a) => ({ q: a.q, r: a.r, ms: Math.max(0, Math.round(Number(a.ms) || 0)) }));
  if (!answers.length) return false;
  const quizRoot = quizRootFor(root);
  if (!fs.existsSync(quizRoot)) return false;
  const line = { at: new Date().toISOString(), scope: String(entry.scope || '').slice(0, 300), answers };
  fs.appendFileSync(path.join(quizRoot, RESULTS), JSON.stringify(line) + '\n');
  return true;
}

// Quiz files are written by Claude while the app runs: tell the page, so an open start page
// refreshes itself. (Only an existing quizzes folder is watched; one created later shows up
// after a restart.)
let quizWatcher = null;
let quizDebounce = null;
function watchQuizzes(root) {
  quizWatcher?.close();
  quizWatcher = null;
  const dir = root ? quizRootFor(root) : null;
  if (!dir || !fs.existsSync(dir)) return;
  try {
    quizWatcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
      if (!filename || !/\.quiz\.md$/i.test(filename.toString())) return;
      clearTimeout(quizDebounce);
      quizDebounce = setTimeout(() => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('quizzes-changed')), 300);
    });
    quizWatcher.on('error', (err) => console.error('Quiz watcher error:', err.message));
  } catch (err) { console.error('Could not watch the quizzes folder:', err.message); }
}

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
    folderColors: config.root ? (config.folderColors?.[config.root] || {}) : {},
    quiz: config.quiz || null,
  }));
  handle('quiz-load', (scope, rel) => loadQuiz(requireRoot(), scope === 'note' ? 'note' : 'folder', rel));
  handle('quiz-log', (entry) => logQuiz(requireRoot(), entry));

  handle('pick-folder', async () => {
    const defaultPath = config.root || (fs.existsSync(SUGGESTED_FOLDER) ? SUGGESTED_FOLDER : undefined);
    const res = await dialog.showOpenDialog(win, { title: 'Choose notes folder', defaultPath, properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    config.root = res.filePaths[0];
    config.lastNote = null;
    saveConfig();
    watchFolder(config.root);
    watchQuizzes(config.root);
    return config.root;
  });

  // App preferences, validated. (Stored in userData/config.json, never in the notes folder.)
  const PREFS = {
    sidebarCollapsed: (v) => Boolean(v),
    autosave: (v) => Boolean(v),
    zoom: (v) => Math.min(1.6, Math.max(0.7, Number(v) || 1)),
    theme: (v) => (['system', 'light', 'dark'].includes(v) ? v : 'system'),
    quiz: (v) => ({
      count: [5, 10, 20, 30, 0].includes(v?.count) ? v.count : 10, // 0 = all
      seconds: [0, 15, 30, 60, 90].includes(v?.seconds) ? v.seconds : 0, // 0 = no limit
      types: (Array.isArray(v?.types) ? v.types : []).filter((t) => ['single', 'multi', 'input', 'recall'].includes(t)),
      order: v?.order === 'weak' ? 'weak' : 'random',
    }),
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
  handle('list-images', (rel) => listImages(requireRoot(), rel));
  handle('add-images', (rel, files) => addImages(requireRoot(), rel, files));
  handle('browse-images', (rel) => browseImages(win, requireRoot(), rel));
  handle('reveal-images', (rel) => revealImages(requireRoot(), rel));
  handle('copy-text', (text) => clipboard.writeText(String(text))); // async (W3C-style) since Electron 44
  handle('rename-note', (rel) => renameNote(win, requireRoot(), rel));
  handle('reveal-note', (rel) => shell.showItemInFolder(resolveInside(requireRoot(), rel)));
  handle('open-in-vscode', (rel) => shell.openExternal(vscodeUrl(resolveInside(requireRoot(), rel))));

  // Folder actions (the menus themselves are drawn by the renderer, src/menu.js).
  const folderPath = (relDir) => {
    const root = requireRoot();
    const full = path.resolve(root, String(relDir));
    if (!inside(fs.realpathSync(root), full) || !fs.existsSync(full)) throw new Error('Outside the notes folder');
    return { root, full, rel: String(relDir) };
  };
  const EDIT_ACTIONS = ['cut', 'copy', 'paste', 'selectAll'];
  handle('edit-action', (action, arg) => {
    if (EDIT_ACTIONS.includes(action)) win.webContents[action]();
    else if (action === 'replace' && typeof arg === 'string') win.webContents.replaceMisspelling(arg);
    else if (action === 'add-word' && typeof arg === 'string') win.webContents.session.addWordToSpellCheckerDictionary(arg);
  });
  handle('reveal-folder', (relDir) => shell.openPath(folderPath(relDir).full));
  handle('open-folder-in-vscode', (relDir) => shell.openExternal(vscodeUrl(folderPath(relDir).full)));
  // Returns the new color map for this notes folder.
  handle('set-folder-color', (relDir, color) => {
    const { root, rel } = folderPath(relDir);
    const map = { ...(config.folderColors?.[root] || {}) };
    if (FOLDER_COLORS.includes(color)) map[rel] = color; else delete map[rel];
    config.folderColors = { ...config.folderColors, [root]: map };
    saveConfig();
    return map;
  });

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
      spellcheck: true,
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

  // Mouse back/forward side buttons (Windows reports them as app commands).
  win.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward') win.webContents.send('nav', 'back');
    else if (cmd === 'browser-forward') win.webContents.send('nav', 'forward');
  });

  // Right-click in the editor or on selected text: the page draws the menu (spelling suggestions +
  // edit actions, src/menu.js) and sends the choice back as 'edit-action'.
  // (Right-clicks on notes in the sidebar are handled by the page directly.)
  win.webContents.on('context-menu', (_e, p) => {
    if (!p.isEditable && !p.selectionText) return;
    win.webContents.send('edit-menu', {
      x: p.x, y: p.y, editable: p.isEditable, hasSelection: Boolean(p.selectionText),
      misspelled: p.misspelledWord || '', suggestions: (p.dictionarySuggestions || []).slice(0, 6),
      canCut: p.editFlags.canCut, canCopy: p.editFlags.canCopy, canPaste: p.editFlags.canPaste,
    });
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
  const root = config.root && fs.existsSync(config.root) ? config.root : null;
  watchFolder(root);
  watchQuizzes(root);
});

app.on('window-all-closed', () => app.quit());
