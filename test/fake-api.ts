// An in-memory window.notesApi for component tests: a few notes, no dialogs (confirmations
// resolve the way a test sets them), every call recorded by vi.fn.
import { vi } from 'vitest';
import type { AppState, NoteFile, NotesApi, QuizData } from '../src/api';

export interface FakeNotes { [path: string]: string }

export const SAMPLE_NOTES: FakeNotes = {
  'dsa/heaps.md': '# Heaps\n\nA heap is a tree.\n\n## Insert\n\nAdd at the end, bubble up.\n\n## Remove\n\nMove the last one up.\n',
  'dsa/lists.md': '# Lists\n\nLinked lists use `next`.\n',
  'react.md': '# React\n\nKeys keep state.\n',
};

const describe = (path: string) => {
  const slash = path.lastIndexOf('/');
  return { path, dir: slash < 0 ? '' : path.slice(0, slash), title: path.slice(slash + 1).replace(/\.md$/, '') };
};

// Rough stand-in for the main process's renderer: headings and paragraphs with data-line.
export function renderFake(source: string): string {
  return source.split('\n').map((line, i) => {
    const h = line.match(/^(#{1,6}) (.*)$/);
    if (h) return `<h${h[1]!.length} data-line="${i}">${h[2]}</h${h[1]!.length}>`;
    return line.trim() ? `<p data-line="${i}">${line}</p>` : '';
  }).join('');
}

export function fakeApi(opts: {
  notes?: FakeNotes; state?: Partial<AppState>; quiz?: QuizData;
  activity?: Record<string, { focus: number; quizzes: number; sessions?: number }>; today?: { focus?: number; sessions?: number };
} = {}): NotesApi {
  const notes: FakeNotes = { ...(opts.notes ?? SAMPLE_NOTES) };
  const mtimes = new Map<string, number>();
  const read = (path: string): NoteFile => {
    if (!(path in notes)) throw new Error(`no note ${path}`);
    return { ...describe(path), source: notes[path]!, mtimeMs: mtimes.get(path) ?? 1, html: renderFake(notes[path]!) };
  };
  let favorites: string[] = opts.state?.favorites ?? [];
  const today = { focus: 0, sessions: 0, ...opts.today };
  const api = {
    getState: vi.fn(async (): Promise<AppState> => ({
      version: '0.0.0-test', root: 'C:/notes', lastNote: null, sidebarCollapsed: false, autosave: true, zoom: 1, theme: 'system',
      favorites, folderColors: {}, quiz: null, pomodoro: null, ...opts.state,
    })),
    pickFolder: vi.fn(async () => null),
    setPref: vi.fn(async () => {}),
    listNotes: vi.fn(async () => Object.keys(notes).sort().map((p) => ({ ...describe(p), text: notes[p]! }))),
    readNote: vi.fn(async (p: string) => read(p)),
    saveNote: vi.fn(async (p: string, content: string) => {
      notes[p] = content;
      mtimes.set(p, (mtimes.get(p) ?? 1) + 1);
      return { saved: true as const, mtimeMs: mtimes.get(p)! };
    }),
    setFavorite: vi.fn(async (p: string, on: boolean) => {
      favorites = on ? [...new Set([...favorites, p])] : favorites.filter((x) => x !== p);
      return favorites;
    }),
    saveImage: vi.fn(async () => 'images/x.png'),
    listImages: vi.fn(async () => ({ dir: 'C:/notes/images', relDir: 'images', images: [] })),
    addImages: vi.fn(async () => []),
    browseImages: vi.fn(async () => []),
    revealImages: vi.fn(async () => {}),
    copyText: vi.fn(async () => {}),
    renameNote: vi.fn(async () => null),
    revealNote: vi.fn(async () => {}),
    openInVSCode: vi.fn(async () => {}),
    editAction: vi.fn(async () => {}),
    revealFolder: vi.fn(async () => {}),
    openFolderInVSCode: vi.fn(async () => {}),
    setFolderColor: vi.fn(async (dir: string, color: string) => (color ? { [dir]: color } : {})),
    quizLoad: vi.fn(async () => opts.quiz ?? { quizRoot: 'C:/quizzes', files: [], questions: [] }),
    quizLog: vi.fn(async () => true),
    activityBump: vi.fn(async (kind: 'focus' | 'session') => { today[kind === 'focus' ? 'focus' : 'sessions']++; return { ...today }; }),
    activityToday: vi.fn(async () => ({ ...today })),
    activityGet: vi.fn(async () => ({ days: opts.activity ?? {} })),
    exportPdf: vi.fn(async () => null),
    createNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => false),
    confirmDiscard: vi.fn(async () => 'cancel' as const),
    confirmCancelEdit: vi.fn(async () => false),
    setDirty: vi.fn(async () => {}),
    closeWindow: vi.fn(async () => {}),
    onChanged: vi.fn(() => () => {}),
    onRequestClose: vi.fn(() => () => {}),
    onNav: vi.fn(() => () => {}),
    onEditMenu: vi.fn(() => () => {}),
    onQuizzesChanged: vi.fn(() => () => {}),
  };
  return api as unknown as NotesApi;
}
