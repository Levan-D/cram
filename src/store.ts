// App state (zustand). Components read slices with useApp(selector); async flows in actions.ts
// read and write it with useApp.getState() / useApp.setState().
import { create } from 'zustand';
import type { AppState, FolderColor, NoteListItem } from './api';
import type { SearchIndex } from './lib/search';
import { browseRows, colorFor, type NoteRow, type Row } from './lib/tree';
import { search } from './lib/search';

export type View = 'loading' | 'welcome' | 'empty' | 'note';
export type Mode = 'read' | 'edit';
export type StatusKind = '' | 'dirty' | 'saved' | 'error';

export interface CurrentNote { path: string; title: string; dir: string; source: string; mtimeMs: number }
export interface TocItem { level: number; text: string }

export interface Store {
  prefs: AppState;
  notes: NoteListItem[];
  byPath: Map<string, NoteListItem>;
  index: SearchIndex | null;
  favorites: Set<string>;
  collapsed: Set<string>;               // folder paths collapsed in the tree (localStorage, per notes folder)
  folderColors: Record<string, FolderColor>;
  query: string;                        // sidebar search
  cursor: number;                       // keyboard-highlighted index into the note rows

  view: View;
  emptyMessage: string;
  current: CurrentNote | null;
  mode: Mode;
  savedText: string;                    // what's on disk, as far as we know
  dirty: boolean;
  saving: boolean;
  autosavePaused: boolean;              // the file changed on disk; resumes after a successful save
  status: { text: string; kind: StatusKind };
  banner: { text: string; reload: boolean } | null;

  history: string[];                    // opened note paths, for back / forward
  histIndex: number;

  toc: TocItem[];
  tocCurrent: number;
  tocPopoverOpen: boolean;
  find: { open: boolean; text: string; words: string[] | null; count: number; index: number };
  meta: { pages: number; page: number; frac: number };

  drawerOpen: boolean;
  unresolvedOpen: boolean;              // the "Unresolved" page covers the note column
  settingsOpen: boolean;
  toast: { text: string; id: number } | null;
  imageDialogFor: string | null;        // note path while the image library is open
  emojiOpen: boolean;
}

export const DEFAULT_PREFS: AppState = {
  version: '',
  root: null, lastNote: null, sidebarCollapsed: false, autosave: true, zoom: 1, theme: 'system',
  favorites: [], folderColors: {}, quiz: null, pomodoro: null,
};

export const initialState = (): Store => ({
  prefs: DEFAULT_PREFS,
  notes: [],
  byPath: new Map(),
  index: null,
  favorites: new Set(),
  collapsed: new Set(),
  folderColors: {},
  query: '',
  cursor: -1,
  view: 'loading',
  emptyMessage: '',
  current: null,
  mode: 'read',
  savedText: '',
  dirty: false,
  saving: false,
  autosavePaused: false,
  status: { text: '', kind: '' },
  banner: null,
  history: [],
  histIndex: -1,
  toc: [],
  tocCurrent: 0,
  tocPopoverOpen: false,
  find: { open: false, text: '', words: null, count: 0, index: -1 },
  meta: { pages: 1, page: 1, frac: 0 },
  drawerOpen: false,
  unresolvedOpen: false,
  settingsOpen: false,
  toast: null,
  imageDialogFor: null,
  emojiOpen: false,
});

export const useApp = create<Store>()(() => initialState());

// What the sidebar lists: search results, or favorites + the folder tree.
export function rowsFor(s: Pick<Store, 'query' | 'index' | 'byPath' | 'notes' | 'favorites' | 'collapsed' | 'folderColors'>): Row[] {
  const q = s.query.trim();
  if (q && s.index) {
    return search(s.index, q)
      .map((r): Row | null => {
        const note = s.byPath.get(r.path);
        return note ? { type: 'note', note, terms: r.terms, depth: 0, showDir: true, color: colorFor(note.dir, s.folderColors) } : null;
      })
      .filter((x): x is Row => x !== null);
  }
  return browseRows(s.notes, s.favorites, s.collapsed, s.folderColors);
}

export const noteRows = (rows: Row[]) => rows.filter((r): r is NoteRow => r.type === 'note');
export const autosaveOn = () => useApp.getState().prefs.autosave !== false;
