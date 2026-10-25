// The API the preload script (preload.cjs) exposes as window.notesApi, typed. Every call goes to
// a handler in main.js; keep the three in sync.
import type { QuestionType } from '../quiz-format.js';

export type Theme = 'system' | 'light' | 'dark';
export type FolderColor = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink';

export interface QuizPrefs {
  count: number;            // 0 = all
  seconds: number;          // 0 = no limit
  types: QuestionType[];    // [] = all
  order: 'random' | 'weak';
}

export interface AppState {
  root: string | null;
  lastNote: string | null;
  sidebarCollapsed: boolean;
  autosave: boolean;
  zoom: number;
  theme: Theme;
  favorites: string[];
  folderColors: Record<string, FolderColor>;
  quiz: QuizPrefs | null;
}

export interface NoteListItem { path: string; dir: string; title: string; text: string }

export interface NoteFile {
  path: string;
  dir: string;
  title: string;
  source: string;
  mtimeMs: number;
  html: string;
}

export type SaveResult =
  | { saved: true; mtimeMs: number; unchanged?: boolean }
  | { saved: false; reason: 'conflict' | 'cancelled' };

export interface ImageInfo { name: string; link: string; url: string; size: number; mtimeMs: number; used: boolean }
export interface ImageList { dir: string; relDir: string; images: ImageInfo[] }
export interface Upload { name: string; bytes: Uint8Array }

export interface QuizStats { attempts: number; misses: number; last: string; lastAt: string }

export interface QuizQuestion {
  key: string;
  id: string;
  concept: string;
  note: string;
  type: QuestionType;
  section: string;
  outdated: boolean;
  promptHtml: string;
  options: { html: string; correct: boolean }[];
  answers: string[];
  explainHtml: string;
  stats: QuizStats | null;
}

export type QuizFileStatus =
  | { note: string; quiz: string; exists: false }
  | {
      note: string; quiz: string; exists: true; count: number; inSync: boolean;
      changed: string[]; added: string[]; removed: string[]; errors: number;
    };

export interface QuizData { quizRoot: string; files: QuizFileStatus[]; questions: QuizQuestion[] }

export type QuizResult = 'right' | 'wrong' | 'partly' | 'timeout';
export interface QuizLogEntry { scope: string; answers: { q: string; r: QuizResult; ms: number }[] }

export interface EditMenuInfo {
  x: number;
  y: number;
  editable: boolean;
  hasSelection: boolean;
  misspelled: string;
  suggestions: string[];
  canCut: boolean;
  canCopy: boolean;
  canPaste: boolean;
}

type Unsubscribe = () => void;

export interface NotesApi {
  getState(): Promise<AppState>;
  pickFolder(): Promise<string | null>;
  setPref(key: 'sidebarCollapsed' | 'autosave', value: boolean): Promise<void>;
  setPref(key: 'zoom', value: number): Promise<void>;
  setPref(key: 'theme', value: Theme): Promise<void>;
  setPref(key: 'quiz', value: QuizPrefs): Promise<void>;
  listNotes(): Promise<NoteListItem[]>;
  readNote(relPath: string): Promise<NoteFile>;
  saveNote(relPath: string, content: string, baseMtimeMs: number, opts: { silent: boolean }): Promise<SaveResult>;
  setFavorite(relPath: string, on: boolean): Promise<string[]>;
  saveImage(relPath: string, bytes: Uint8Array, ext: string): Promise<string>;
  listImages(relPath: string): Promise<ImageList>;
  addImages(relPath: string, files: Upload[]): Promise<string[]>;
  browseImages(relPath: string): Promise<string[]>;
  revealImages(relPath: string): Promise<void>;
  copyText(text: string): Promise<void>;
  renameNote(relPath: string): Promise<string | null>;
  revealNote(relPath: string): Promise<void>;
  openInVSCode(relPath: string): Promise<void>;
  editAction(action: 'cut' | 'copy' | 'paste' | 'selectAll'): Promise<void>;
  editAction(action: 'replace' | 'add-word', arg: string): Promise<void>;
  revealFolder(relDir: string): Promise<void>;
  openFolderInVSCode(relDir: string): Promise<void>;
  setFolderColor(relDir: string, color: FolderColor | ''): Promise<Record<string, FolderColor>>;
  quizLoad(scope: 'note' | 'folder', relPath: string): Promise<QuizData>;
  quizLog(entry: QuizLogEntry): Promise<boolean>;
  createNote(): Promise<string | null>;
  deleteNote(relPath: string): Promise<boolean>;
  confirmDiscard(title: string): Promise<'save' | 'discard' | 'cancel'>;
  confirmCancelEdit(title: string): Promise<boolean>;
  setDirty(dirty: boolean): Promise<void>;
  closeWindow(): Promise<void>;
  onChanged(cb: (changedPaths: (string | null)[]) => void): Unsubscribe;
  onRequestClose(cb: () => void): Unsubscribe;
  onNav(cb: (dir: 'back' | 'forward') => void): Unsubscribe;
  onEditMenu(cb: (info: EditMenuInfo) => void): Unsubscribe;
  onQuizzesChanged(cb: () => void): Unsubscribe;
}

declare global {
  interface Window {
    notesApi: NotesApi;
    __emoji?: { Picker: new (options: Record<string, unknown>) => HTMLElement; data: unknown };
    __mermaid?: {
      initialize(config: Record<string, unknown>): void;
      render(id: string, text: string): Promise<{ svg: string }>;
    };
  }
}

// Tests swap this out (see test/setup.ts); everything else imports it from here.
export const api: NotesApi = new Proxy({} as NotesApi, {
  get: (_t, key) => (window.notesApi as unknown as Record<PropertyKey, unknown>)[key],
});
