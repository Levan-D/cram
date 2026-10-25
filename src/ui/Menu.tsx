// In-app dropdown / context menus (instead of native Windows menus, which can't show proper
// icons or follow the app's theme). One menu at a time: showMenu() resolves with the chosen
// item's id, or null when dismissed.
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { create } from 'zustand';
import { icons, type IconName } from '../lib/icons';
import { Svg } from './Icon';

export type MenuItem =
  | { type?: 'item'; id: string; label: string; icon?: IconName; hint?: string; checked?: boolean; danger?: boolean; disabled?: boolean }
  | { type: 'separator' }
  | { type: 'swatches'; label: string; options: { id: string; color?: string; label: string; checked: boolean }[] };

type Anchor = { x: number; y: number } | { rect: DOMRect };

interface MenuState { items: MenuItem[]; at: Anchor; resolve: (id: string | null) => void; restore: Element | null }
const useMenu = create<{ menu: MenuState | null }>()(() => ({ menu: null }));

export function closeMenu() {
  const m = useMenu.getState().menu;
  if (!m) return;
  useMenu.setState({ menu: null });
  m.resolve(null);
}

// at: the pointer position, or an element the menu opens below (right edges aligned).
export function showMenu(items: MenuItem[], at: { x: number; y: number } | Element): Promise<string | null> {
  closeMenu();
  return new Promise((resolve) => {
    useMenu.setState({
      menu: {
        items,
        at: at instanceof Element ? { rect: at.getBoundingClientRect() } : at,
        resolve,
        restore: document.activeElement,
      },
    });
  });
}

export const isMenuOpen = () => useMenu.getState().menu !== null;

export function MenuHost() {
  const menu = useMenu((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);

  const done = (id: string | null) => {
    const m = useMenu.getState().menu;
    if (!m) return;
    useMenu.setState({ menu: null });
    if (id === null && m.restore instanceof HTMLElement && m.restore.isConnected) m.restore.focus({ preventScroll: true });
    m.resolve(id);
  };

  // Position: below the anchor or at the pointer, kept inside the window. Then focus the first item.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !menu) return;
    const r = el.getBoundingClientRect();
    let x: number;
    let y: number;
    if ('rect' in menu.at) {
      const a = menu.at.rect;
      x = a.right - r.width;
      y = a.bottom + 4;
      if (y + r.height > innerHeight - 8) y = a.top - r.height - 4;
      el.style.transformOrigin = 'top right';
    } else {
      x = menu.at.x;
      y = menu.at.y;
      if (x + r.width > innerWidth - 8) x = menu.at.x - r.width;
      if (y + r.height > innerHeight - 8) y = Math.max(8, innerHeight - r.height - 8);
      el.style.transformOrigin = 'top left';
    }
    el.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
    el.style.top = `${Math.max(8, y)}px`;
    (el.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)') || el.querySelector('button'))?.focus({ preventScroll: true });
  }, [menu]);

  // Close on outside pointer, Esc, blur, resize. Arrow keys / Tab move between items.
  useEffect(() => {
    if (!menu) return;
    const el = ref.current!;
    const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const onOutside = (e: PointerEvent) => { if (!el.contains(e.target as Node)) done(null); };
    const onBlur = () => done(null);
    const onKey = (e: KeyboardEvent) => {
      const list = buttons();
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      const move = (step: number) => { e.preventDefault(); e.stopPropagation(); list[(i + step + list.length) % list.length]?.focus(); };
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') move(1);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'Tab') move(e.shiftKey ? -1 : 1);
      else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) { e.preventDefault(); e.stopPropagation(); done(list[i]!.dataset.id ?? null); }
    };
    // Registered after the click that opened the menu has finished.
    const t = setTimeout(() => {
      document.addEventListener('pointerdown', onOutside, true);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('blur', onBlur);
      window.addEventListener('resize', onBlur);
    });
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
  }, [menu]);

  if (!menu) return null;
  return (
    <div className="menu" role="menu" ref={ref} style={{ left: -9999, top: -9999 }} onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((it, i) => {
        if (it.type === 'separator') return <div key={i} className="menu-sep" role="separator" />;
        if (it.type === 'swatches') {
          return (
            <div key={i} className="menu-swatches">
              <span className="menu-label">{it.label}</span>
              <div className="swatch-row">
                {it.options.map((o) => (
                  <button key={o.id} type="button" className={`swatch${o.checked ? ' on' : ''}${o.color ? '' : ' none'}`} data-id={o.id}
                    role="menuitemradio" aria-checked={o.checked} title={o.label} onClick={() => done(o.id)}
                    style={{ '--sw': o.color || 'transparent' } as CSSProperties}>
                    {o.color ? null : <Svg name="close" />}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        const radio = it.checked !== undefined;
        const icon = it.icon ?? (it.checked ? 'check' : undefined);
        return (
          <button key={it.id} type="button" className={`menu-item${it.danger ? ' danger' : ''}`} data-id={it.id}
            role={radio ? 'menuitemradio' : 'menuitem'} aria-checked={radio ? it.checked : undefined} disabled={it.disabled}
            onClick={() => done(it.id)}>
            <span className="menu-icon" dangerouslySetInnerHTML={{ __html: icon ? icons[icon] : '' }} />
            <span className="menu-text">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
            {radio && it.icon && <span className="menu-check" dangerouslySetInnerHTML={{ __html: it.checked ? icons.check : '' }} />}
          </button>
        );
      })}
    </div>
  );
}
