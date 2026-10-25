// Top bar over the note: sidebar toggle (when hidden), back / forward, the note's path, and
// the note tools (find, contents, edit / done / save, ⋯). Read-only / edit-only buttons are
// shown by CSS (body.mode-read / body.mode-edit).
import { useApp } from '../store';
import { refs } from '../refs';
import {
  enterEdit, exitEdit, goHistory, noteMenu, save, setCollapsed, setDrawer, setTocPopover,
  openFindbar, closeFindbar, NARROW,
} from '../actions';
import { useMedia, WIDE_QUERY } from './hooks';
import { Icon } from './Icon';

export function Toolbar() {
  const current = useApp((s) => s.current);
  const history = useApp((s) => s.history);
  const histIndex = useApp((s) => s.histIndex);
  const favorites = useApp((s) => s.favorites);
  const dirty = useApp((s) => s.dirty);
  const autosave = useApp((s) => s.prefs.autosave);
  const findOpen = useApp((s) => s.find.open);
  const tocCount = useApp((s) => s.toc.length);
  const tocPopoverOpen = useApp((s) => s.tocPopoverOpen);
  const view = useApp((s) => s.view);
  const wide = useMedia(WIDE_QUERY);

  // Autosave on: always "Done" (saves what's left, then leaves).
  // Autosave off: "Cancel" while there are unsaved edits, "Done" once everything is saved.
  const cancel = dirty && autosave === false;
  const tocAvailable = view === 'note' && tocCount >= 2;

  return (
    <header id="toolbar">
      <button id="toggle-sidebar" className="icon-btn" type="button" title="Show sidebar (Ctrl+\)" aria-label="Show sidebar"
        onClick={() => (NARROW() ? setDrawer(true) : setCollapsed(false))}>
        <Icon name="menu" />
      </button>
      <div className="nav-btns">
        <button id="back-btn" className="icon-btn" type="button" title="Back (Alt+←)" aria-label="Back" disabled={histIndex <= 0}
          onClick={() => void goHistory(-1)}>
          <Icon name="back" />
        </button>
        <button id="forward-btn" className="icon-btn" type="button" title="Forward (Alt+→)" aria-label="Forward"
          disabled={histIndex >= history.length - 1} onClick={() => void goHistory(1)}>
          <Icon name="forward" />
        </button>
      </div>
      <div id="crumb">
        <span id="note-dir" className="muted">{current?.dir ?? ''}</span>
        <span id="note-title">{current?.title ?? ''}</span>
        <span id="fav-mark" title="Favorite (Ctrl+D)" hidden={!(current && favorites.has(current.path))}>★</span>
      </div>
      <div className="tools note-only">
        <button id="find-btn" className="icon-btn read-only" type="button" title="Find in note (Ctrl+F)" aria-label="Find in note"
          onClick={() => (findOpen ? closeFindbar() : openFindbar())}>
          <Icon name="find" />
        </button>
        <button id="toc-btn" className={`icon-btn${!wide && tocPopoverOpen && tocAvailable ? ' active' : ''}`} type="button"
          title="Contents" aria-label="Table of contents" hidden={wide} disabled={!tocAvailable}
          onClick={(e) => { e.stopPropagation(); setTocPopover(!tocPopoverOpen); }}>
          <Icon name="toc" />
        </button>
        <button id="mode-btn" className="read-only" type="button" title="Edit this note (Ctrl+E)" onClick={() => void enterEdit()}>
          <Icon name="edit" /><span className="label">Edit</span>
        </button>
        <button id="cancel-btn" className="edit-only" type="button" onClick={() => void exitEdit()}
          title={cancel ? 'Discard changes and stop editing (Ctrl+E)' : dirty ? 'Save and stop editing (Ctrl+E)' : 'Stop editing (Ctrl+E)'}>
          <Icon name={cancel ? 'close' : 'check'} /><span className="label">{cancel ? 'Cancel' : 'Done'}</span>
        </button>
        <button id="save-btn" className="edit-only primary-btn" type="button" title="Save (Ctrl+S)" onClick={() => void save()}>
          <Icon name="save" /><span className="label">Save</span>
        </button>
        <button id="more-btn" ref={(el) => { refs.moreBtn = el; }} className="icon-btn" type="button"
          title="More: favorite, rename / move, quiz, Explorer, VS Code, delete" aria-label="More actions"
          onClick={(e) => { if (current) void noteMenu(current.path, e.currentTarget, false); }}>
          <Icon name="more" />
        </button>
      </div>
    </header>
  );
}
