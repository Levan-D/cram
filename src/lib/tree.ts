// The sidebar's rows: favorites, the folder tree, or search results.
import type { FolderColor, NoteListItem } from '../api';

export type Row =
  | { type: 'header'; text: string }
  | { type: 'folder'; path: string; name: string; depth: number; collapsed: boolean; count: number; color: FolderColor | '' }
  | { type: 'note'; note: NoteListItem; depth: number; color: FolderColor | ''; showDir?: boolean; fav?: boolean; terms?: string[] };

export type NoteRow = Extract<Row, { type: 'note' }>;

// A folder's color, inherited from the nearest colored ancestor.
export function colorFor(dir: string, colors: Record<string, FolderColor>): FolderColor | '' {
  const parts = dir ? dir.split('/') : [];
  for (let i = parts.length; i > 0; i--) {
    const c = colors[parts.slice(0, i).join('/')];
    if (c) return c;
  }
  return '';
}

interface Folder { path: string; folders: Map<string, Folder>; notes: NoteListItem[] }

export function treeRows(notes: NoteListItem[], collapsed: Set<string>, colors: Record<string, FolderColor>): Row[] {
  const root: Folder = { path: '', folders: new Map(), notes: [] };
  for (const n of notes) {
    let node = root;
    let p = '';
    for (const part of n.dir ? n.dir.split('/') : []) {
      p = p ? `${p}/${part}` : part;
      let next = node.folders.get(part);
      if (!next) { next = { path: p, folders: new Map(), notes: [] }; node.folders.set(part, next); }
      node = next;
    }
    node.notes.push(n);
  }
  const count = (node: Folder): number => node.notes.length + [...node.folders.values()].reduce((s, f) => s + count(f), 0);
  const rows: Row[] = [];
  const walk = (node: Folder, depth: number) => {
    const folders = [...node.folders].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }));
    for (const [name, f] of folders) {
      const isCollapsed = collapsed.has(f.path);
      rows.push({ type: 'folder', path: f.path, name, depth, collapsed: isCollapsed, count: count(f), color: colorFor(f.path, colors) });
      if (!isCollapsed) walk(f, depth + 1);
    }
    for (const note of node.notes) rows.push({ type: 'note', note, depth, color: colorFor(note.dir, colors) });
  };
  walk(root, 0);
  return rows;
}

// No search: favorites (if any) on top, then the tree.
export function browseRows(notes: NoteListItem[], favorites: Set<string>, collapsed: Set<string>, colors: Record<string, FolderColor>): Row[] {
  const favs = notes.filter((n) => favorites.has(n.path));
  const tree = treeRows(notes, collapsed, colors);
  if (!favs.length) return tree;
  return [
    { type: 'header', text: 'Favorites' },
    ...favs.map((note): Row => ({ type: 'note', note, depth: 0, showDir: true, fav: true, color: colorFor(note.dir, colors) })),
    { type: 'header', text: 'All notes' },
    ...tree,
  ];
}

// The folders that contain `path` (to expand them when the note opens).
export function ancestors(path: string): string[] {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
}
