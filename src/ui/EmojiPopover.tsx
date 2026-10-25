// Emoji picker popover (emoji-mart), anchored to the formatting bar's emoji button. Search,
// categories, skin tones and "frequently used" all come from emoji-mart, which loads on first use.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useApp } from '../store';
import { refs } from '../refs';
import { toast } from '../actions';
import { errMsg } from '../lib/text';

let ready: Promise<NonNullable<Window['__emoji']>> | null = null;
function loadEmoji() {
  ready ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'emoji.bundle.js';
    s.onload = () => resolve(window.__emoji!);
    s.onerror = () => { ready = null; reject(new Error('Could not load the emoji picker')); };
    document.head.append(s);
  });
  return ready;
}

export function toggleEmoji(_anchor: HTMLElement) {
  const open = useApp.getState().emojiOpen;
  if (open) closeEmoji();
  else loadEmoji().then(() => useApp.setState({ emojiOpen: true }), (err) => toast(errMsg(err)));
}

export function closeEmoji() {
  if (!useApp.getState().emojiOpen) return;
  useApp.setState({ emojiOpen: false });
  refs.editor?.focus();
}

// Scrollbar styles inside the picker's shadow DOM, to match the app's thin scrollbars.
const SHADOW_CSS = '.scroll::-webkit-scrollbar{width:4px;height:4px}.scroll::-webkit-scrollbar-thumb,.scroll:hover::-webkit-scrollbar-thumb{border:0;border-radius:999px;background-color:rgba(var(--em-rgb-color),.25)}.scroll::-webkit-scrollbar-thumb:hover{background-color:rgba(var(--em-rgb-color),.45)!important}';

export function EmojiPopover() {
  const open = useApp((s) => s.emojiOpen);
  const pop = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLElement | null>(null);

  const place = () => {
    const el = pop.current;
    const anchor = refs.emojiBtn;
    if (!el || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth || 352;
    const h = el.offsetHeight || 430;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = r.bottom + 6;
    el.style.left = `${left}px`;
    el.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below}px`;
  };

  // Create the picker once (the bundle is loaded before `open` turns true).
  useLayoutEffect(() => {
    if (!open || picker.current || !window.__emoji || !pop.current) return;
    const { Picker, data } = window.__emoji;
    const p = new Picker({
      data,
      onEmojiSelect: (e: { native: string }) => { closeEmoji(); refs.editor?.insert(e.native); },
      theme: 'auto', // follows the app's light/dark (nativeTheme drives prefers-color-scheme)
      set: 'native',
      previewPosition: 'none',
      skinTonePosition: 'search',
      navPosition: 'top',
      perLine: 9,
      emojiSize: 20,
      emojiButtonSize: 34,
      maxFrequentRows: 2,
      autoFocus: true,
    });
    pop.current.append(p);
    const style = document.createElement('style');
    style.textContent = SHADOW_CSS;
    p.shadowRoot?.append(style);
    picker.current = p;
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const raf = requestAnimationFrame(place); // the picker measures itself after mounting
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Close on a click outside, or Esc. Follow the window size.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !refs.emojiBtn?.contains(t)) closeEmoji();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeEmoji(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  return <div id="emoji-pop" ref={pop} hidden={!open} />;
}
