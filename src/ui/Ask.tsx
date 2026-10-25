// A small in-app modal for choices that don't touch files (file warnings stay native, in the
// main process). ask() resolves with the chosen action's id, or null on Esc / backdrop click.
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { IconName } from '../lib/icons';
import { Icon } from './Icon';

export interface AskAction { id: string; label: string; primary?: boolean; danger?: boolean }
export interface AskOptions { title: string; text?: string; icon?: IconName; actions: AskAction[] }

const useAsk = create<{ ask: (AskOptions & { resolve: (id: string | null) => void }) | null }>()(() => ({ ask: null }));

export function ask(options: AskOptions): Promise<string | null> {
  return new Promise((resolve) => useAsk.setState({ ask: { ...options, resolve } }));
}

export function AskHost() {
  const current = useAsk((s) => s.ask);
  const ref = useRef<HTMLDialogElement>(null);
  const chosen = useRef<string | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!current || !dlg) return;
    chosen.current = null;
    dlg.showModal();
    (dlg.querySelector<HTMLButtonElement>('.primary-btn') || dlg.querySelector('button'))?.focus();
  }, [current]);

  if (!current) return null;
  const finish = () => {
    useAsk.setState({ ask: null });
    current.resolve(chosen.current);
  };
  return (
    <dialog
      ref={ref}
      className="ask"
      onClose={finish}
      onClick={(e) => { if (e.target === ref.current) ref.current.close(); }} // backdrop
      onKeyDown={(e) => e.stopPropagation()} // keep app shortcuts out while it's open
    >
      <div className="ask-body">
        {current.icon && <Icon name={current.icon} className="ask-icon" />}
        <div>
          <h2 className="ask-title">{current.title}</h2>
          {current.text && <p className="ask-text">{current.text}</p>}
        </div>
      </div>
      <div className="ask-actions">
        {current.actions.map((a) => (
          <button key={a.id} type="button" className={`${a.primary ? 'primary-btn' : ''}${a.danger ? ' danger-btn' : ''}`.trim() || undefined}
            onClick={() => { chosen.current = a.id; ref.current?.close(); }}>
            {a.label}
          </button>
        ))}
      </div>
    </dialog>
  );
}
