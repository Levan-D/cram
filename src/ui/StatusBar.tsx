// Bottom bar: save state, page count / reading position, autosave toggle (edit mode), zoom.
import { useApp } from '../store';
import { setZoom, toggleAutosave, WORDS_PER_PAGE_TITLE } from '../actions';
import { Icon } from './Icon';

export function StatusBar() {
  const status = useApp((s) => s.status);
  const meta = useApp((s) => s.meta);
  const mode = useApp((s) => s.mode);
  const hasNote = useApp((s) => Boolean(s.current));
  const autosave = useApp((s) => s.prefs.autosave !== false);
  const zoom = useApp((s) => s.prefs.zoom || 1);
  const pages = `${meta.pages} page${meta.pages === 1 ? '' : 's'}`;

  return (
    <footer id="statusbar" className="small">
      <span id="save-status" aria-live="polite" title={status.text} className={`small ${status.kind}`.trim()}>{status.text}</span>
      <span className="spacer" />
      <span id="note-meta" className="muted" title={hasNote ? WORDS_PER_PAGE_TITLE(meta.pages) : ''}>
        <span className="meta-main">{!hasNote ? '' : mode === 'edit' ? `~${pages}` : `Page ${meta.page} / ${meta.pages}`}</span>
        <span className="meta-extra" />
      </span>
      <button id="autosave-btn" className="edit-only toggle-btn" type="button" aria-pressed={autosave} onClick={toggleAutosave}
        title={autosave ? 'Autosave is on: saves every 10 s without asking. Click to turn off.' : 'Autosave is off: every save asks first. Click to turn on.'}>
        <Icon name="autosave" /><span className="label">Autosave</span>
      </button>
      <span className="zoom-ctl">
        <button id="zoom-out" type="button" title="Zoom out (Ctrl −)" aria-label="Zoom out" disabled={zoom <= 0.7} onClick={() => setZoom(zoom - 0.1)}>−</button>
        <button id="zoom-btn" type="button" title="Reset zoom (Ctrl 0)" onClick={() => setZoom(1)}>{`${Math.round(zoom * 100)}%`}</button>
        <button id="zoom-in" type="button" title="Zoom in (Ctrl +)" aria-label="Zoom in" disabled={zoom >= 1.6} onClick={() => setZoom(zoom + 0.1)}>+</button>
      </span>
    </footer>
  );
}

export function Toast() {
  const toast = useApp((s) => s.toast);
  return <div id="toast" role="status" hidden={!toast} key={toast?.id}>{toast?.text ?? ''}</div>;
}
