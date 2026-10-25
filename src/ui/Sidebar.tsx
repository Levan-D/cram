// Left column: title bar (theme, collapse), notes search, the list (favorites + folder tree, or
// search results), the "quiz in progress" box, and the notes folder.
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useApp, rowsFor } from '../store';
import { refs } from '../refs';
import {
  changeFolder, folderMenu, moveCursor, newNote, noteMenu, openFromList, setCollapsed, setDrawer,
  setQuery, themeMenu, toggleFolder, THEME_INFO, NARROW,
} from '../actions';
import { snippetParts } from '../lib/search';
import { Icon } from './Icon';
import { QuizPill } from './QuizPill';

export function Sidebar() {
  const prefs = useApp((s) => s.prefs);
  const query = useApp((s) => s.query);
  const index = useApp((s) => s.index);
  const byPath = useApp((s) => s.byPath);
  const notes = useApp((s) => s.notes);
  const favorites = useApp((s) => s.favorites);
  const collapsed = useApp((s) => s.collapsed);
  const folderColors = useApp((s) => s.folderColors);
  const cursor = useApp((s) => s.cursor);
  const currentPath = useApp((s) => s.current?.path);
  const listRef = useRef<HTMLUListElement>(null);

  const rows = useMemo(
    () => rowsFor({ query, index, byPath, notes, favorites, collapsed, folderColors }),
    [query, index, byPath, notes, favorites, collapsed, folderColors],
  );
  const searching = Boolean(query.trim() && index);
  const noteCount = rows.filter((r) => r.type === 'note').length;

  // Keep the keyboard cursor and the open note in view. (Not on every list refresh: a note
  // changing on disk shouldn't yank the list back while you're browsing it.)
  useEffect(() => { listRef.current?.querySelector('.cursor')?.scrollIntoView({ block: 'nearest' }); }, [cursor, query]);
  useEffect(() => {
    const rows = listRef.current?.querySelectorAll('.active'); // the tree row, not the favorites copy
    rows?.[rows.length - 1]?.scrollIntoView({ block: 'nearest' });
  }, [currentPath]);

  const theme = THEME_INFO[prefs.theme] || THEME_INFO.system;
  const folderName = prefs.root ? prefs.root.split(/[\\/]/).pop() || prefs.root : '';
  let noteIndex = -1;

  return (
    <aside id="sidebar" aria-label="Notes">
      <div className="sidebar-top">
        <span className="app-name">Notes</span>
        <button id="theme-btn" ref={(el) => { refs.themeBtn = el; }} className="icon-btn" type="button"
          title={`${theme.title}. Click to change (Ctrl+Shift+L cycles)`} aria-label="Theme"
          onClick={(e) => void themeMenu(e.currentTarget)}>
          <Icon name={theme.icon} />
        </button>
        <button id="collapse-sidebar" className="icon-btn" type="button" title="Hide sidebar (Ctrl+\)" aria-label="Hide sidebar"
          onClick={() => (NARROW() ? setDrawer(false) : setCollapsed(true))}>
          <Icon name="panel" />
        </button>
      </div>
      <div className="sidebar-head">
        <label className="search-box">
          <Icon name="search" />
          <input id="search" ref={(el) => { refs.searchInput = el; }} type="search" placeholder="Search notes" autoComplete="off"
            spellCheck={false} aria-label="Search all notes (Ctrl+P)" value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveCursor(e.key === 'ArrowDown' ? 1 : -1); }
              else if (e.key === 'Enter') { e.preventDefault(); const c = useApp.getState().cursor; if (c >= 0) openFromList(c); }
              else if (e.key === 'Escape' && query) { e.preventDefault(); setQuery(''); }
            }} />
        </label>
        <button id="new-note" className="icon-btn" type="button" title="New note (Ctrl+N)" aria-label="New note" onClick={() => void newNote()}>
          <Icon name="plus" />
        </button>
      </div>
      <div id="result-info" className="muted small" hidden={!searching}>{`${noteCount} result${noteCount === 1 ? '' : 's'}`}</div>
      <ul id="list" ref={listRef} role="listbox" aria-label="Notes"
        onContextMenu={(e) => {
          const li = (e.target as Element).closest<HTMLLIElement>('li[data-path], li[data-folder]');
          if (!li) return;
          e.preventDefault();
          const at = { x: e.clientX, y: e.clientY };
          if (li.dataset.path) void noteMenu(li.dataset.path, at, true);
          else if (li.dataset.folder) void folderMenu(li.dataset.folder, at);
        }}>
        {rows.map((row, k) => {
          const color = row.type === 'header' ? '' : row.color;
          const style = { '--depth': row.type === 'header' ? 0 : row.depth, ...(color ? { '--fc': `var(--fc-${color})` } : {}) } as CSSProperties;
          if (row.type === 'header') return <li key={`h${k}`} className="section-head" style={style}>{row.text}</li>;
          if (row.type === 'folder') {
            return (
              <li key={`f:${row.path}`} className={`folder${row.collapsed ? ' collapsed' : ''}${color ? ' colored' : ''}`} style={style}
                data-folder={row.path} role="treeitem" aria-expanded={!row.collapsed} title={row.path}
                onClick={() => toggleFolder(row.path)}>
                <Icon name="chevron" className="chev" />
                {color && <span className="fdot" />}
                <span className="name">{row.name}</span>
                <span className="count">{row.count}</span>
              </li>
            );
          }
          const i = ++noteIndex;
          const { note, terms } = row;
          const parts = terms ? snippetParts(note.text, terms) : [];
          return (
            <li key={`${row.fav ? 'fav:' : ''}${note.path}`} style={style}
              className={['note', color && 'colored', note.path === currentPath && 'active', i === cursor && 'cursor'].filter(Boolean).join(' ')}
              data-path={note.path} role="option" aria-selected={note.path === currentPath} title={note.path}
              onClick={() => openFromList(i)}>
              <span className="title">{note.title}</span>
              {row.showDir && note.dir && <span className="dir">{note.dir}</span>}
              {parts.length > 0 && (
                <span className="snippet">{parts.map((p, j) => (p.mark ? <mark key={j}>{p.text}</mark> : p.text))}</span>
              )}
            </li>
          );
        })}
        {noteCount === 0 && <li className="none">{notes.length ? 'No matches' : 'No .md files in this folder'}</li>}
      </ul>
      <QuizPill />
      <footer id="sidebar-footer">
        <div className="folder-row">
          <Icon name="folder" />
          <span id="folder" className="small" title={prefs.root || ''}>{folderName}</span>
          <button id="change-folder" type="button" className="small" onClick={() => void changeFolder()}>Change</button>
        </div>
      </footer>
    </aside>
  );
}
