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
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
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
});
