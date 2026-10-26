// Settings dialog (gear in the sidebar top, Ctrl+,): theme, the notes folder, autosave.
// Everything here is a preference the main process already stores; this is just one place
// to see and change them. (Zoom lives in the status bar.)
import { useEffect, useRef } from 'react';
import { useApp } from '../store';
import { changeFolder, setTheme, toggleAutosave, THEMES, THEME_INFO } from '../actions';
import { Icon } from './Icon';

export const openSettings = () => useApp.setState({ settingsOpen: true });

export function Settings() {
  const open = useApp((s) => s.settingsOpen);
  const prefs = useApp((s) => s.prefs);
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open && !dlg.current?.open) dlg.current?.showModal(); }, [open]);
  if (!open) return null;

  const theme = prefs.theme || 'system';
  const autosave = prefs.autosave !== false;
  return (
    <dialog id="settings" ref={dlg} className="ask settings" aria-labelledby="settings-title"
      onClose={() => useApp.setState({ settingsOpen: false })}
      onClick={(e) => { if (e.target === dlg.current) dlg.current.close(); }} // backdrop
      onKeyDown={(e) => e.stopPropagation()}>
      <header className="settings-head">
        <Icon name="settings" />
        <span id="settings-title" className="dlg-title">Settings</span>
        <span className="spacer" />
        <button type="button" className="icon-btn" title="Close (Esc)" aria-label="Close" onClick={() => dlg.current?.close()}><Icon name="close" /></button>
      </header>

      <section className="setting-row">
        <div className="setting-text"><b>Theme</b><span className="muted small">Ctrl+Shift+L cycles.</span></div>
        <div className="seg" role="group" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t} type="button" aria-pressed={theme === t} onClick={() => void setTheme(t)}><Icon name={THEME_INFO[t].icon} />{THEME_INFO[t].label}</button>
          ))}
        </div>
      </section>

      <section className="setting-row">
        <div className="setting-text"><b>Notes folder</b><span className="muted small">Quizzes are read from the <code>quizzes</code> folder next to it.</span></div>
        <div className="setting-folder">
          <code className="path small" title={prefs.root ?? ''}>{prefs.root ?? 'none'}</code>
          <button type="button" className="small" onClick={() => void changeFolder()}>Change…</button>
        </div>
      </section>

      <section className="setting-row">
        <div className="setting-text"><b>Autosave</b><span className="muted small">On: saves every 10 s without asking. Off: every save asks first.</span></div>
        <div className="seg" role="group" aria-label="Autosave">
          <button type="button" aria-pressed={autosave} onClick={() => { if (!autosave) toggleAutosave(); }}>On</button>
          <button type="button" aria-pressed={!autosave} onClick={() => { if (autosave) toggleAutosave(); }}>Off</button>
        </div>
      </section>

      <footer className="settings-foot small muted">
        <span>{`Notes Viewer ${prefs.version || ''}`.trim()}</span>
        <span>{`© ${new Date().getFullYear()} Levan D. All rights reserved.`}</span>
      </footer>
    </dialog>
  );
}
