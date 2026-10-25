// The note area (#body): welcome / empty messages, the reader (rendered markdown, filled
// imperatively by actions.renderReader), the CodeMirror editor, and the table of contents.
import { useEffect, useRef } from 'react';
import { useApp } from '../store';
import { refs } from '../refs';
import {
  changeFolder, dropImages, editorChanged, followLink, keepReadingPlace, pasteImage, save, schedulePos, setTocPopover,
  spyEdit, spyRead, tocGo, updateMeta,
} from '../actions';
import { createEditor } from '../lib/editor';
import { useMedia, WIDE_QUERY } from './hooks';

export function NoteArea() {
  const view = useApp((s) => s.view);
  const mode = useApp((s) => s.mode);
  const emptyMessage = useApp((s) => s.emptyMessage);
  return (
    <div id="body">
      <section id="welcome" hidden={view !== 'welcome'}>
        <h1>Notes Viewer</h1>
        <p>Pick the folder that holds your markdown notes. It will be remembered.</p>
        <button id="choose-folder" type="button" className="primary-btn" onClick={() => void changeFolder()}>Choose notes folder</button>
      </section>
      <p id="empty" className="muted" hidden={view !== 'empty'}>{emptyMessage}</p>
      <Reader hidden={!(view === 'note' && mode === 'read')} />
      <EditorPane hidden={!(view === 'note' && mode === 'edit')} />
      <Toc />
    </div>
  );
}

function Reader({ hidden }: { hidden: boolean }) {
  // The article's children are owned by actions.renderReader (innerHTML from the main process),
  // not by React: React renders an empty <article> and never touches its contents.
  const raf = useRef(0);
  useEffect(() => {
    const r = refs.reader;
    if (!r) return;
    // A resize reflows the text: keep the same line at the top. (Not when the reader was
    // hidden, 0×0: leaving edit mode restores its own position.)
    let size = { w: r.clientWidth, h: r.clientHeight };
    const ro = new ResizeObserver(() => {
      const next = { w: r.clientWidth, h: r.clientHeight };
      if (size.w && next.w && (next.w !== size.w || next.h !== size.h)) keepReadingPlace();
      size = next;
      updateMeta();
    });
    ro.observe(r);
    return () => ro.disconnect();
  }, []);
  return (
    <div id="reader" hidden={hidden} ref={(el) => { refs.reader = el; }}
      onScroll={() => {
        updateMeta();
        schedulePos();
        cancelAnimationFrame(raf.current);
        raf.current = requestAnimationFrame(spyRead);
      }}>
      <article id="note-body" className="markdown" ref={(el) => { refs.noteBody = el; }}
        onClick={(e) => {
          const a = (e.target as Element).closest('a[href]');
          if (!a) return;
          e.preventDefault();
          followLink(a.getAttribute('href') || '');
        }} />
    </div>
  );
}

function EditorPane({ hidden }: { hidden: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const editor = createEditor(host.current!, {
      onChange: editorChanged,
      onSave: () => void save(),
      onPasteImage: pasteImage,
      onDropImages: dropImages,
      onScroll: () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(spyEdit); schedulePos(); },
    });
    refs.editor = editor;
    return () => { refs.editor = null; editor.destroy(); };
  }, []);
  return (
    <div id="editor-wrap" hidden={hidden}>
      <div id="editor" ref={host} />
    </div>
  );
}

// ≥1000px: always visible, docked between the sidebar and the note.
// Narrower: a popover behind the contents button.
function Toc() {
  const items = useApp((s) => s.toc);
  const currentIdx = useApp((s) => s.tocCurrent);
  const view = useApp((s) => s.view);
  const popoverOpen = useApp((s) => s.tocPopoverOpen);
  const wide = useMedia(WIDE_QUERY);
  const ref = useRef<HTMLElement>(null);
  const available = view === 'note' && items.length >= 2;
  const hidden = wide ? !available : !available || !popoverOpen;

  // A click outside closes the popover.
  useEffect(() => {
    if (wide || !popoverOpen) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setTocPopover(false); };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [wide, popoverOpen]);

  // Indent relative to the shallowest level present, so a note with only h2/h3 isn't over-indented.
  const min = items.length ? Math.min(...items.map((it) => it.level)) : 1;
  return (
    <nav id="toc" ref={ref} className={wide ? 'docked' : 'popover'} aria-label="Table of contents" hidden={hidden}>
      <div className="toc-head small muted">Contents</div>
      <ul id="toc-list">
        {items.map((it, i) => (
          <li key={i} className={`lvl-${Math.min(4, it.level - min + 1)}`}>
            <a href="#" title={it.text} className={i === currentIdx ? 'current' : undefined}
              onClick={(e) => { e.preventDefault(); tocGo(i); }}>
              {it.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
