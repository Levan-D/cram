// Sandboxed preload (must be CommonJS). Exposes a small API to the page; all file access
// and every confirmation dialog live in the main process.
// Named notesApi (not `notes`) so it can't collide with top-level names in the renderer.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const listener = (_event, ...args) => cb(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('notesApi', {
  getState: () => ipcRenderer.invoke('get-state'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  setPref: (key, value) => ipcRenderer.invoke('set-pref', key, value),
  listNotes: () => ipcRenderer.invoke('list-notes'),
  readNote: (relPath) => ipcRenderer.invoke('read-note', relPath),
  saveNote: (relPath, content, baseMtimeMs, opts) => ipcRenderer.invoke('save-note', relPath, content, baseMtimeMs, opts),
  setFavorite: (relPath, on) => ipcRenderer.invoke('set-favorite', relPath, on),
  saveImage: (relPath, bytes, ext) => ipcRenderer.invoke('save-image', relPath, bytes, ext),
  listImages: (relPath) => ipcRenderer.invoke('list-images', relPath),
  addImages: (relPath, files) => ipcRenderer.invoke('add-images', relPath, files),
  browseImages: (relPath) => ipcRenderer.invoke('browse-images', relPath),
  revealImages: (relPath) => ipcRenderer.invoke('reveal-images', relPath),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  renameNote: (relPath) => ipcRenderer.invoke('rename-note', relPath),
  revealNote: (relPath) => ipcRenderer.invoke('reveal-note', relPath),
  openInVSCode: (relPath) => ipcRenderer.invoke('open-in-vscode', relPath),
  editAction: (action, arg) => ipcRenderer.invoke('edit-action', action, arg),
  revealFolder: (relDir) => ipcRenderer.invoke('reveal-folder', relDir),
  openFolderInVSCode: (relDir) => ipcRenderer.invoke('open-folder-in-vscode', relDir),
  setFolderColor: (relDir, color) => ipcRenderer.invoke('set-folder-color', relDir, color),
  quizLoad: (scope, relPath) => ipcRenderer.invoke('quiz-load', scope, relPath),
  quizLog: (entry) => ipcRenderer.invoke('quiz-log', entry),
  quizPrompt: (relPath) => ipcRenderer.invoke('quiz-prompt', relPath),
  quizCheck: (relPath, opts) => ipcRenderer.invoke('quiz-check', relPath, opts),
  quizSave: (relPath, opts) => ipcRenderer.invoke('quiz-save', relPath, opts),
  activityBump: (kind) => ipcRenderer.invoke('activity-bump', kind),
  activityToday: () => ipcRenderer.invoke('activity-today'),
  activityGet: () => ipcRenderer.invoke('activity-get'),
  exportPdf: (relPath) => ipcRenderer.invoke('export-pdf', relPath),
  createNote: () => ipcRenderer.invoke('create-note'),
  deleteNote: (relPath) => ipcRenderer.invoke('delete-note', relPath),
  confirmDiscard: (title) => ipcRenderer.invoke('confirm-discard', title),
  confirmCancelEdit: (title) => ipcRenderer.invoke('confirm-cancel-edit', title),
  setDirty: (dirty) => ipcRenderer.invoke('set-dirty', dirty),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  // cb(changedPaths) after the folder changes (debounced). Returns an unsubscribe function.
  onChanged: on('notes-changed'),
  // cb() when the user closes the window with unsaved changes.
  onRequestClose: on('request-close'),
  // cb('back' | 'forward') from the mouse side buttons.
  onNav: on('nav'),
  // cb({ x, y, editable, misspelled, suggestions, canCut, … }) on right-click in text: the page draws the menu.
  onEditMenu: on('edit-menu'),
  // cb() after a quiz file next to the notes folder changes (debounced).
  onQuizzesChanged: on('quizzes-changed'),
});
