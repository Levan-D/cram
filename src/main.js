// Notes Viewer: renderer entry (bundled by esbuild into renderer.bundle.js).
// Talks to the main process only through window.notesApi (preload.cjs). All writes and all
// confirmation dialogs happen in the main process; this file only decides *when* to ask.
import { icons, mountIcons } from './icons.js';
import { buildIndex, search, snippetNodes } from './search.js';
import { createFinder } from './find.js';
import { idHeadings, createToc } from './toc.js';
import { createEditor } from './editor.js';
import { enhanceNote, onThemeChange } from './extras.js';

const api = window.notesApi;
const $ = (id) => document.getElementById(id);
const body = document.body;
const WIDE = matchMedia('(min-width: 1000px)');      // contents docked left of the note
const NARROW = matchMedia('(max-width: 759.98px)');  // sidebar becomes a drawer
const WORDS_PER_PAGE = 300;
const AUTOSAVE_MS = 10_000;

const state = {
  prefs: {},
  notes: [],
  byPath: new Map(),
  index: null,
  rows: [],           // what the sidebar shows: section headers, folders, notes
  shown: [],          // just the note rows, in order (keyboard navigation)
  cursor: -1,         // keyboard-highlighted index into shown
  favorites: new Set(),
  collapsed: new Set(), // folder paths collapsed in the tree (per notes folder, in localStorage)
  current: null,      // { path, title, dir, source, mtimeMs } of the open note
  lastHtml: '',
  mode: 'read',       // 'read' | 'edit'
  savedText: '',      // what's on disk, as far as we know
  dirty: false,
  saving: false,
  autosavePaused: false, // set when the file changed on disk; resumes after a successful save
  tocPopoverOpen: false,
  findWords: null,    // words from a notes search, or null for literal find-bar text
};

const finder = createFinder($('note-body'));
const toc = createToc({ list: $('toc-list'), scroller: $('reader'), onNavigate: () => setTocPopover(false) });
let editor = null; // created on first switch to edit mode

// ---------- small UI helpers ----------

let toastTimer = 0;
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 1300);
}

const errMsg = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// ---------- views ----------

function show(view, message = '') {
  body.classList.toggle('has-note', view === 'note');
  $('welcome').hidden = view !== 'welcome';
  $('empty').hidden = view !== 'empty';
  $('empty').textContent = message;
  $('reader').hidden = !(view === 'note' && state.mode === 'read');
  $('editor-wrap').hidden = !(view === 'note' && state.mode === 'edit');
  if (view !== 'note') {
    $('note-dir').textContent = '';
    $('note-title').textContent = '';
    closeFindbar();
    setBanner(null);
  }
  updateToc();
  updateTitle();
  updateMeta();
  updateFavButton();
}

function updateTitle() {
  const c = state.current;
  document.title = c ? `${state.dirty ? '• ' : ''}${c.title} - Notes Viewer` : 'Notes Viewer';
}

function setStatus(text = '', kind = '') {
  const el = $('save-status');
  el.textContent = text;
  el.title = text;
  el.className = `small ${kind}`;
}

function setDirty(value) {
  if (state.dirty !== value) {
    state.dirty = value;
    api.setDirty(value);
  }
  if (value) setStatus('● Unsaved changes', 'dirty');
  updateTitle();
  updateExitButton();
}

function setBanner(text, { reload = true } = {}) {
  $('banner').hidden = !text;
  $('banner-text').textContent = text || '';
  $('banner-reload').hidden = !reload;
}

// ---------- note size + reading progress ----------

const countWords = (text) => (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;

let metaRaf = 0;
function updateMeta() {
  cancelAnimationFrame(metaRaf);
  metaRaf = requestAnimationFrame(() => {
    const main = $('note-meta').querySelector('.meta-main');
    const extra = $('note-meta').querySelector('.meta-extra');
    if (!state.current) { main.textContent = extra.textContent = ''; return; }
    const words = countWords(state.mode === 'edit' && editor ? editor.text : state.current.source);
    const pages = Math.max(1, Math.ceil(words / WORDS_PER_PAGE));
    $('note-meta').title = `About ${pages} page${pages === 1 ? '' : 's'} (${WORDS_PER_PAGE} words per page)`;
    extra.textContent = '';
    if (state.mode === 'edit') {
      main.textContent = `~${pages} page${pages === 1 ? '' : 's'}`;
      return;
    }
    const r = $('reader');
    const max = r.scrollHeight - r.clientHeight;
    const frac = max > 0 ? r.scrollTop / max : 1;
    const page = Math.min(pages, Math.max(1, Math.ceil(frac * pages)));
    $('progress-fill').style.width = `${(frac * 100).toFixed(1)}%`;
    main.textContent = `Page ${page} / ${pages}`;
  });
}
$('reader').addEventListener('scroll', updateMeta);
new ResizeObserver(updateMeta).observe($('reader'));

// ---------- sidebar: favorites, folder tree, search results ----------

const collapsedKey = () => `nv-collapsed:${state.prefs.root}`;
function loadCollapsed() {
  try { state.collapsed = new Set(JSON.parse(localStorage.getItem(collapsedKey()) || '[]')); } catch { state.collapsed = new Set(); }
}
function saveCollapsed() {
  try { localStorage.setItem(collapsedKey(), JSON.stringify([...state.collapsed])); } catch { /* UI nicety only */ }
}

// Make sure the folders containing `path` are expanded.
function revealInTree(path) {
  const parts = path.split('/').slice(0, -1);
  let changed = false;
  for (let i = 1; i <= parts.length; i++) changed = state.collapsed.delete(parts.slice(0, i).join('/')) || changed;
  if (changed) saveCollapsed();
}

function treeRows() {
  const root = { folders: new Map(), notes: [] };
  for (const n of state.notes) {
    let node = root;
    let p = '';
    for (const part of n.dir ? n.dir.split('/') : []) {
      p = p ? `${p}/${part}` : part;
      if (!node.folders.has(part)) node.folders.set(part, { path: p, folders: new Map(), notes: [] });
      node = node.folders.get(part);
    }
    node.notes.push(n);
  }
  const count = (node) => node.notes.length + [...node.folders.values()].reduce((s, f) => s + count(f), 0);
  const rows = [];
  const walk = (node, depth) => {
    const folders = [...node.folders].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }));
    for (const [name, f] of folders) {
      const collapsed = state.collapsed.has(f.path);
      rows.push({ type: 'folder', path: f.path, name, depth, collapsed, count: count(f) });
      if (!collapsed) walk(f, depth + 1);
    }
    for (const note of node.notes) rows.push({ type: 'note', note, depth });
  };
  walk(root, 0);
  return rows;
}

function applySearch(keepCursor = false) {
  const q = $('search').value.trim();
  if (q && state.index) {
    state.rows = search(state.index, q)
      .map((r) => ({ type: 'note', note: state.byPath.get(r.path), terms: r.terms, depth: 0, showDir: true }))
      .filter((x) => x.note);
    $('result-info').hidden = false;
    $('result-info').textContent = `${state.rows.length} result${state.rows.length === 1 ? '' : 's'}`;
  } else {
    const favs = state.notes.filter((n) => state.favorites.has(n.path));
    state.rows = favs.length
      ? [
          { type: 'header', text: 'Favorites' },
          ...favs.map((note) => ({ type: 'note', note, depth: 0, showDir: true, fav: true })),
          { type: 'header', text: 'All notes' },
          ...treeRows(),
        ]
      : treeRows();
    $('result-info').hidden = true;
  }
  state.shown = state.rows.filter((r) => r.type === 'note');
  if (!keepCursor) {
    state.cursor = q ? (state.shown.length ? 0 : -1) : state.shown.findIndex((x) => x.note.path === state.current?.path && !x.fav);
  }
  state.cursor = Math.min(state.cursor, state.shown.length - 1);
  renderList();
}

function renderList() {
  const list = $('list');
  let noteIndex = -1;
  list.replaceChildren(...state.rows.map((row) => {
    const li = document.createElement('li');
    li.style.setProperty('--depth', row.depth || 0);

    if (row.type === 'header') {
      li.className = 'section-head';
      li.textContent = row.text;
      return li;
    }

    if (row.type === 'folder') {
      li.className = `folder${row.collapsed ? ' collapsed' : ''}`;
      li.setAttribute('role', 'treeitem');
      li.setAttribute('aria-expanded', String(!row.collapsed));
      li.title = row.path;
      li.innerHTML = `<span class="chev">${icons.chevron}</span>`;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = row.name;
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = row.count;
      li.append(name, count);
      li.addEventListener('click', () => {
        if (state.collapsed.has(row.path)) state.collapsed.delete(row.path); else state.collapsed.add(row.path);
        saveCollapsed();
        applySearch(true);
      });
      return li;
    }

    const i = ++noteIndex;
    const { note, terms } = row;
    li.className = 'note';
    li.setAttribute('role', 'option');
    li.title = note.path;
    li.classList.toggle('active', note.path === state.current?.path);
    li.classList.toggle('cursor', i === state.cursor);
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = note.title;
    li.append(title);
    if (row.showDir && note.dir) {
      const dir = document.createElement('span');
      dir.className = 'dir';
      dir.textContent = note.dir;
      li.append(dir);
    }
    if (terms) {
      const nodes = snippetNodes(note.text, terms);
      if (nodes.length) {
        const snip = document.createElement('span');
        snip.className = 'snippet';
        snip.append(...nodes);
        li.append(snip);
      }
    }
    li.addEventListener('click', () => openFromList(i));
    return li;
  }));
  if (!state.shown.length) {
    const li = document.createElement('li');
    li.className = 'none';
    li.textContent = state.notes.length ? 'No matches' : 'No .md files in this folder';
    list.append(li);
  }
  list.querySelector('.cursor')?.scrollIntoView({ block: 'nearest' });
}

function openFromList(i) {
  const item = state.shown[i];
  if (!item) return;
  state.cursor = i;
  const query = $('search').value.trim();
  openNote(item.note.path, item.terms ? { query, terms: item.terms } : {});
}

async function refreshList() {
  state.notes = await api.listNotes();
  state.byPath = new Map(state.notes.map((n) => [n.path, n]));
  state.index = buildIndex(state.notes);
  applySearch(true);
}

// ---------- favorites ----------

function updateFavButton() {
  const on = Boolean(state.current && state.favorites.has(state.current.path));
  $('fav-btn').querySelector('.icon').innerHTML = icons[on ? 'starFilled' : 'star'];
  $('fav-btn').classList.toggle('on', on);
  $('fav-btn').title = on ? 'Remove from favorites (Ctrl+D)' : 'Add to favorites (Ctrl+D)';
}

async function toggleFavorite() {
  const c = state.current;
  if (!c) return;
  const on = !state.favorites.has(c.path);
  state.favorites = new Set(await api.setFavorite(c.path, on));
  updateFavButton();
  applySearch(true);
  toast(on ? 'Added to favorites' : 'Removed from favorites');
}
$('fav-btn').addEventListener('click', toggleFavorite);

// ---------- opening notes ----------

// Read a note from disk and show it. `terms` (from a notes search) get highlighted.
async function openNote(path, { query = '', terms = null, force = false } = {}) {
  const switching = state.current && state.current.path !== path;
  if ((switching || force) && !(await guardUnsaved())) return;

  let note;
  try {
    note = await api.readNote(path);
  } catch {
    state.current = null;
    show('empty', `Could not open ${path}`);
    renderList();
    return;
  }

  state.current = { path: note.path, title: note.title, dir: note.dir, source: note.source, mtimeMs: note.mtimeMs };
  state.savedText = note.source;
  state.autosavePaused = false;
  setDirty(false);
  setStatus();
  setBanner(null);
  $('note-dir').textContent = note.dir;
  $('note-title').textContent = note.title;
  revealInTree(note.path);

  if (state.mode === 'edit') editor.load(note.source);
  else renderReader(note.html);
  show('note');
  applySearch(true);
  if (NARROW.matches) setDrawer(false);

  if (terms?.length && state.mode === 'read') openFindbar(query, terms, { focus: false });
  else closeFindbar();
}

function renderReader(html, { keepScroll = false } = {}) {
  const reader = $('reader');
  const scroll = reader.scrollTop;
  state.lastHtml = html;
  $('note-body').innerHTML = html;
  toc.build(idHeadings($('note-body')));
  updateToc();
  reader.scrollTop = keepScroll ? scroll : 0;
  if (!$('findbar').hidden) runFind();
  updateMeta();
  // Copy buttons + diagrams. Diagrams render async and change the page height.
  enhanceNote($('note-body'), { copyText: (t) => api.copyText(t) }).then(() => {
    updateMeta();
    if (!$('findbar').hidden) runFind();
  });
}

// Diagrams follow the light/dark theme.
onThemeChange(() => { if (state.mode === 'read' && state.lastHtml) renderReader(state.lastHtml, { keepScroll: true }); });

// Links inside rendered notes.
$('note-body').addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute('href');
  if (href.startsWith('note:')) openNote(decodeURIComponent(href.slice(5)));
  else if (/^(https?|mailto):/i.test(href)) window.open(href); // main process opens it in the browser
  else if (href.length > 1 && href.startsWith('#')) $('note-body').querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView({ block: 'start' });
});

// ---------- table of contents ----------

// ≥1000px: always visible, docked between the sidebar and the note.
// Narrower: a popover behind the contents button.
function updateToc() {
  const el = $('toc');
  const available = body.classList.contains('has-note') && state.mode === 'read' && toc.count >= 2;
  $('toc-btn').hidden = WIDE.matches;
  $('toc-btn').disabled = !available;
  if (WIDE.matches) {
    el.className = 'docked';
    el.hidden = !available;
  } else {
    el.className = 'popover';
    el.hidden = !available || !state.tocPopoverOpen;
  }
  $('toc-btn').classList.toggle('active', !el.hidden);
}

function setTocPopover(open) {
  if (WIDE.matches) return;
  state.tocPopoverOpen = open;
  updateToc();
}

$('toc-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  setTocPopover(!state.tocPopoverOpen);
});
document.addEventListener('click', (e) => {
  if (state.tocPopoverOpen && !$('toc').contains(e.target)) setTocPopover(false);
});
WIDE.addEventListener('change', updateToc);

// ---------- sidebar / drawer ----------

function setDrawer(open) {
  body.classList.toggle('drawer-open', open);
  $('scrim').hidden = !open;
}

function setCollapsed(collapsed) {
  body.classList.toggle('sidebar-collapsed', collapsed);
  api.setPref('sidebarCollapsed', collapsed);
}

// Narrow: the sidebar is a drawer. Wider: it collapses away entirely, and the toolbar
// button (only shown while collapsed) brings it back.
function toggleSidebar() {
  if (NARROW.matches) setDrawer(!body.classList.contains('drawer-open'));
  else setCollapsed(!body.classList.contains('sidebar-collapsed'));
}

$('toggle-sidebar').addEventListener('click', () => (NARROW.matches ? setDrawer(true) : setCollapsed(false)));
$('collapse-sidebar').addEventListener('click', () => (NARROW.matches ? setDrawer(false) : setCollapsed(true)));
$('scrim').addEventListener('click', () => setDrawer(false));
NARROW.addEventListener('change', () => setDrawer(false));

function focusSearch() {
  if (NARROW.matches) setDrawer(true);
  else if (body.classList.contains('sidebar-collapsed')) toggleSidebar();
  $('search').focus();
  $('search').select();
}

// ---------- zoom ----------

function setZoom(z, { persist = true, announce = true } = {}) {
  z = Math.min(1.6, Math.max(0.7, Math.round(z * 10) / 10));
  state.prefs.zoom = z;
  document.documentElement.style.setProperty('--zoom', z);
  if (persist) api.setPref('zoom', z);
  if (announce) toast(`Zoom ${Math.round(z * 100)}%`);
  updateMeta();
}
document.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setZoom((state.prefs.zoom || 1) + (e.deltaY < 0 ? 0.1 : -0.1));
}, { passive: false });

// ---------- theme ----------
// The main process sets nativeTheme.themeSource, so prefers-color-scheme (CSS, diagrams)
// follows the choice without any extra wiring here.

const THEMES = ['system', 'light', 'dark'];
const THEME_INFO = { system: ['monitor', 'Theme: follow system'], light: ['sun', 'Theme: light'], dark: ['moon', 'Theme: dark'] };

function updateThemeButton() {
  const [icon, label] = THEME_INFO[state.prefs.theme] || THEME_INFO.system;
  $('theme-btn').querySelector('.icon').innerHTML = icons[icon];
  $('theme-btn').title = `${label} (Ctrl+Shift+L to switch)`;
}

async function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(state.prefs.theme || 'system') + 1) % THEMES.length];
  state.prefs.theme = next;
  await api.setPref('theme', next);
  updateThemeButton();
  toast(THEME_INFO[next][1]);
}
$('theme-btn').addEventListener('click', cycleTheme);

// ---------- find in note ----------

function openFindbar(text = '', words = null, { focus = true } = {}) {
  $('findbar').hidden = false;
  $('find-input').value = text;
  state.findWords = words;
  runFind();
  if (focus) { $('find-input').focus(); $('find-input').select(); }
}

function closeFindbar() {
  $('findbar').hidden = true;
  state.findWords = null;
  finder.clear();
}

function runFind() {
  const n = state.findWords ? finder.run({ words: state.findWords }) : finder.run({ text: $('find-input').value });
  if (n) finder.next();
  updateFindCount();
}

function updateFindCount() {
  $('find-count').textContent = finder.count
    ? `${finder.index + 1} / ${finder.count}`
    : $('find-input').value.trim() ? 'No matches' : '';
}

$('find-input').addEventListener('input', () => { state.findWords = null; runFind(); });
$('find-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? finder.prev() : finder.next(); updateFindCount(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeFindbar(); }
});
$('find-next').addEventListener('click', () => { finder.next(); updateFindCount(); });
$('find-prev').addEventListener('click', () => { finder.prev(); updateFindCount(); });
$('find-close').addEventListener('click', closeFindbar);
$('find-btn').addEventListener('click', () => ($('findbar').hidden ? openFindbar() : closeFindbar()));

// ---------- edit mode ----------

const autosaveOn = () => state.prefs.autosave !== false;

async function pasteImage(file) {
  if (!state.current) return null;
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  try {
    const link = await api.saveImage(state.current.path, new Uint8Array(await file.arrayBuffer()), ext);
    toast('Image saved in images/');
    return link;
  } catch (err) {
    setStatus(`Image paste failed: ${errMsg(err)}`, 'error');
    return null;
  }
}

function ensureEditor() {
  if (editor) return editor;
  editor = createEditor($('editor'), {
    onChange: (text) => {
      setDirty(text !== state.savedText);
      if (!state.dirty) setStatus();
      updateMeta();
    },
    onSave: () => save(),
    onPasteImage: pasteImage,
  });
  return editor;
}

// Formatting toolbar: mousedown is prevented so the editor keeps its selection.
$('formatbar').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
$('formatbar').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-cmd]');
  if (btn) editor?.run(btn.dataset.cmd);
});

function applyMode() {
  body.classList.toggle('mode-read', state.mode === 'read');
  body.classList.toggle('mode-edit', state.mode === 'edit');
}

// Autosave on: always "Done" (saves what's left, then leaves).
// Autosave off: "Cancel" while there are unsaved edits, "Done" once everything is saved.
function updateExitButton() {
  const btn = $('cancel-btn');
  const cancel = state.dirty && !autosaveOn();
  btn.querySelector('.label').textContent = cancel ? 'Cancel' : 'Done';
  btn.querySelector('.icon').innerHTML = icons[cancel ? 'close' : 'check'];
  btn.title = cancel ? 'Discard changes and stop editing (Ctrl+E)'
    : state.dirty ? 'Save and stop editing (Ctrl+E)' : 'Stop editing (Ctrl+E)';
}

async function enterEdit() {
  if (state.mode === 'edit' || !state.current) return;
  ensureEditor();
  closeFindbar();
  setTocPopover(false);
  state.mode = 'edit';
  applyMode();
  editor.load(state.savedText);
  show('note');
  updateExitButton();
  editor.focus();
}

async function exitEdit() {
  if (state.mode !== 'edit' || !state.current) return;
  if (state.dirty) {
    if (autosaveOn()) {
      if (!(await save())) return; // couldn't save (e.g. conflict) → stay and let them decide
    } else if (!(await api.confirmCancelEdit(state.current.title))) {
      return;
    }
  }
  editor.load(state.savedText);
  setDirty(false);
  setStatus();
  state.mode = 'read';
  applyMode();
  await openNote(state.current.path); // re-read: shows exactly what's on disk now
}

$('mode-btn').addEventListener('click', enterEdit);
$('cancel-btn').addEventListener('click', exitEdit);

// With autosave on, saves are silent (no confirm every 10 s) unless autosave is paused
// because the file changed on disk; then the next save asks before overwriting.
async function save({ auto = false } = {}) {
  if (state.mode !== 'edit' || !state.current || state.saving) return false;
  const text = editor.text;
  const silent = autosaveOn() && !state.autosavePaused;
  state.saving = true;
  if (!auto) setStatus('Saving…');
  try {
    const res = await api.saveNote(state.current.path, text, state.current.mtimeMs, { silent });
    if (!res.saved) {
      if (res.reason === 'conflict') {
        state.autosavePaused = true;
        setBanner('This note changed on disk while you were editing. Autosave is paused.');
        setStatus('● Unsaved · autosave paused', 'dirty');
      } else {
        setStatus(state.dirty ? '● Unsaved · save cancelled' : 'Save cancelled', state.dirty ? 'dirty' : '');
      }
      return false;
    }
    state.savedText = text;
    state.current.source = text;
    state.current.mtimeMs = res.mtimeMs;
    state.autosavePaused = false;
    setBanner(null);
    setDirty(editor.text !== text); // you may have kept typing while the confirm was open
    if (!state.dirty) {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setStatus(res.unchanged ? 'No changes' : `${auto ? 'Autosaved' : 'Saved'} · ${time}`, 'saved');
    }
    return true;
  } catch (err) {
    setStatus(`Save failed: ${errMsg(err)}`, 'error');
    return false;
  } finally {
    state.saving = false;
  }
}
$('save-btn').addEventListener('click', () => save());

setInterval(() => {
  if (state.mode === 'edit' && autosaveOn() && state.dirty && !state.saving && !state.autosavePaused) save({ auto: true });
}, AUTOSAVE_MS);

$('autosave').addEventListener('change', (e) => {
  state.prefs.autosave = e.target.checked;
  api.setPref('autosave', e.target.checked);
  updateExitButton();
  toast(e.target.checked ? 'Autosave on (every 10 s, no confirm)' : 'Autosave off (saves ask first)');
});

// Before leaving unsaved edits. Autosave on: just save. Otherwise Save / Don't save / Cancel.
// Resolves true if it's OK to continue.
async function guardUnsaved() {
  if (!state.dirty || !state.current) return true;
  if (autosaveOn() && !state.autosavePaused && (await save())) return true;
  const choice = await api.confirmDiscard(state.current.title);
  if (choice === 'save') return save();
  if (choice === 'discard') {
    editor?.load(state.savedText);
    setDirty(false);
    setStatus();
    return true;
  }
  return false;
}

api.onRequestClose(async () => {
  if (await guardUnsaved()) api.closeWindow();
});

// ---------- create / delete ----------

async function newNote() {
  if (!state.prefs.root || !(await guardUnsaved())) return;
  const rel = await api.createNote();
  if (!rel) return;
  await refreshList();
  await openNote(rel);
  await enterEdit();
}
$('new-note').addEventListener('click', newNote);

async function deleteCurrent() {
  const c = state.current;
  if (!c) return;
  const deleted = await api.deleteNote(c.path); // main process shows the warning
  if (!deleted) return;
  if (state.favorites.has(c.path)) state.favorites = new Set(await api.setFavorite(c.path, false));
  setDirty(false);
  state.current = null;
  if (state.mode === 'edit') { state.mode = 'read'; applyMode(); }
  show('empty', `Moved "${c.title}" to the Recycle Bin.`);
  await refreshList();
}
$('delete-btn').addEventListener('click', deleteCurrent);

// ---------- live updates from disk ----------

let pendingDisk = null;

api.onChanged(async (changed) => {
  await refreshList();
  const c = state.current;
  if (!c) return;

  if (!state.byPath.has(c.path)) {
    if (state.dirty) {
      setBanner('This note was moved or deleted on disk. Your unsaved edits are still here.', { reload: false });
    } else {
      state.current = null;
      if (state.mode === 'edit') { state.mode = 'read'; applyMode(); }
      show('empty', 'The open note was moved or deleted.');
    }
    return;
  }

  const touched = changed.some((p) => !p || p.toLowerCase() === c.path.toLowerCase());
  if (!touched) return;
  let note;
  try { note = await api.readNote(c.path); } catch { return; }
  if (state.current?.path !== c.path) return;
  if (note.source === state.savedText) { c.mtimeMs = note.mtimeMs; return; } // our own save, or a no-op touch

  if (state.mode === 'read') {
    c.mtimeMs = note.mtimeMs;
    state.savedText = c.source = note.source;
    renderReader(note.html, { keepScroll: true });
  } else if (!state.dirty) {
    c.mtimeMs = note.mtimeMs;
    state.savedText = c.source = note.source;
    editor.replace(note.source); // still undoable
    setDirty(false);
    setStatus('Reloaded from disk');
  } else {
    // Keep the old mtime so the next save notices the conflict.
    pendingDisk = note;
    state.autosavePaused = true;
    setBanner('This note changed on disk while you were editing. Autosave is paused.');
  }
});

$('banner-reload').addEventListener('click', async () => {
  if (!state.current) return setBanner(null);
  const disk = pendingDisk || (await api.readNote(state.current.path).catch(() => null));
  if (!disk) return setBanner(null);
  state.savedText = state.current.source = disk.source;
  state.current.mtimeMs = disk.mtimeMs;
  editor.replace(disk.source); // Ctrl+Z brings your edits back
  pendingDisk = null;
  state.autosavePaused = false;
  setDirty(false);
  setStatus('Reloaded from disk');
  setBanner(null);
});
$('banner-dismiss').addEventListener('click', () => {
  // Keep editing; the next save will ask before overwriting the outside change.
  pendingDisk = null;
  setBanner(null);
});

// ---------- folder ----------

async function changeFolder() {
  if (!(await guardUnsaved())) return;
  if (await api.pickFolder()) await start();
}
$('choose-folder').addEventListener('click', changeFolder);
$('change-folder').addEventListener('click', changeFolder);

$('search').addEventListener('input', () => applySearch());
$('search').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!state.shown.length) return;
    const step = e.key === 'ArrowDown' ? 1 : -1;
    state.cursor = state.cursor < 0 ? 0 : Math.min(state.shown.length - 1, Math.max(0, state.cursor + step));
    renderList();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (state.cursor >= 0) openFromList(state.cursor);
  } else if (e.key === 'Escape' && $('search').value) {
    e.preventDefault();
    $('search').value = '';
    applySearch();
  }
});

// ---------- keyboard ----------

const isTyping = (el) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || Boolean(el?.closest?.('.cm-editor'));

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return; // CodeMirror (or an input) already handled it
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  const hasNote = Boolean(state.current);

  if ((mod && (key === 'p' || key === 'k')) || (e.key === '/' && !mod && !isTyping(e.target))) {
    e.preventDefault();
    if (state.prefs.root) focusSearch();
  } else if (mod && key === 'f') {
    e.preventDefault();
    if (!hasNote) return;
    if (state.mode === 'edit') editor.find();
    else openFindbar($('find-input').value);
  } else if (mod && key === 'e') {
    e.preventDefault();
    if (hasNote) (state.mode === 'read' ? enterEdit() : exitEdit());
  } else if (mod && key === 's') {
    e.preventDefault();
    save();
  } else if (mod && key === 'n') {
    e.preventDefault();
    newNote();
  } else if (mod && e.shiftKey && key === 'l') {
    e.preventDefault();
    cycleTheme();
  } else if (mod && key === 'd') {
    e.preventDefault();
    toggleFavorite();
  } else if (mod && (key === '=' || key === '+')) {
    e.preventDefault();
    setZoom((state.prefs.zoom || 1) + 0.1);
  } else if (mod && key === '-') {
    e.preventDefault();
    setZoom((state.prefs.zoom || 1) - 0.1);
  } else if (mod && key === '0') {
    e.preventDefault();
    setZoom(1);
  } else if (mod && e.key === '\\') {
    e.preventDefault();
    if (state.prefs.root) toggleSidebar();
  } else if (e.key === 'Escape') {
    if (state.tocPopoverOpen) setTocPopover(false);
    else if (body.classList.contains('drawer-open')) setDrawer(false);
    else if (!$('findbar').hidden) closeFindbar();
  }
});

// ---------- startup ----------

async function start() {
  const s = await api.getState();
  state.prefs = s;
  state.favorites = new Set(s.favorites || []);
  body.classList.toggle('sidebar-collapsed', Boolean(s.sidebarCollapsed));
  $('autosave').checked = s.autosave !== false;
  setZoom(s.zoom || 1, { persist: false, announce: false });
  updateThemeButton();
  state.current = null;
  setDirty(false);
  setStatus();
  if (!s.root) {
    body.classList.add('no-folder');
    return show('welcome');
  }
  body.classList.remove('no-folder');
  loadCollapsed();
  $('folder').textContent = s.root.split(/[\\/]/).pop() || s.root;
  $('folder').title = s.root;
  $('search').value = '';
  await refreshList();
  if (s.lastNote && state.byPath.has(s.lastNote)) await openNote(s.lastNote);
  else show('empty', state.notes.length ? 'Select a note.' : 'No .md files in this folder yet.');
  applySearch();
}

mountIcons();
applyMode();
start();
