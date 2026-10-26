// Bottom bar: save state, page count / reading position, zoom. (Autosave is in Settings.)
import { useApp } from '../store';
import { setZoom, WORDS_PER_PAGE_TITLE } from '../actions';

export function StatusBar() {
  const status = useApp((s) => s.status);
  const meta = useApp((s) => s.meta);
  const mode = useApp((s) => s.mode);
  const hasNote = useApp((s) => Boolean(s.current));
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
