// Image library for the note's images/ folder.
// Left: grid of thumbnails (click to select, Ctrl/Shift for several, double-click to insert).
// Right: details for the selection (big preview, size, dimensions, alt text).
// Drop or paste anywhere in the panel to add images; Upload opens a file picker in images/.
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { api, type ImageInfo } from '../api';
import { useApp } from '../store';
import { refs } from '../refs';
import { toast, toUploads } from '../actions';
import { errMsg, fmtSize, shortName, stem } from '../lib/text';
import { Icon } from './Icon';

const closeDialog = () => useApp.setState({ imageDialogFor: null });

export function ImageDialog() {
  const notePath = useApp((s) => s.imageDialogFor);
  const dlg = useRef<HTMLDialogElement>(null);
  const filter = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [relDir, setRelDir] = useState('');
  const [absDir, setAbsDir] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set()); // links
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [scope, setScope] = useState<'all' | 'unused'>('all');
  const [query, setQuery] = useState('');
  const [altDraft, setAltDraft] = useState<Map<string, string>>(new Map());
  const [dims, setDims] = useState<Map<string, string>>(new Map());
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  async function load(path: string, select: string[] = []) {
    const res = await api.listImages(path);
    setImages(res.images);
    setRelDir(res.relDir);
    setAbsDir(res.dir);
    setSelected((prev) => {
      const next = select.length ? new Set(select) : prev;
      return new Set([...next].filter((l) => res.images.some((im) => im.link === l)));
    });
  }

  // Open / reset whenever a note asks for the panel.
  useEffect(() => {
    if (!notePath) return;
    setSelected(new Set());
    setLastClicked(null);
    setAltDraft(new Map());
    setDims(new Map());
    setQuery('');
    setScope('all');
    void load(notePath).then(() => {
      if (!dlg.current?.open) dlg.current?.showModal();
      filter.current?.focus();
    });
  }, [notePath]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return images.filter((im) => (scope === 'all' || !im.used) && (!q || im.name.toLowerCase().includes(q)));
  }, [images, scope, query]);
  const chosen = images.filter((im) => selected.has(im.link));
  const unused = images.filter((im) => !im.used).length;

  function select(im: ImageInfo, e: ReactMouseEvent) {
    if (e.shiftKey && lastClicked) {
      const a = visible.findIndex((x) => x.link === lastClicked);
      const b = visible.findIndex((x) => x.link === im.link);
      if (a >= 0 && b >= 0) setSelected((prev) => new Set([...prev, ...visible.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.link)]));
    } else if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => { const n = new Set(prev); if (n.has(im.link)) n.delete(im.link); else n.add(im.link); return n; });
    } else {
      setSelected((prev) => (prev.size === 1 && prev.has(im.link) ? new Set() : new Set([im.link])));
    }
    setLastClicked(im.link);
  }

  function insert(links = [...selected]) {
    const list = images.filter((im) => links.includes(im.link));
    if (!list.length) return;
    const items = list.map((im) => ({ link: im.link, alt: list.length === 1 ? (altDraft.get(im.link) ?? stem(im.name)).trim() : stem(im.name) }));
    dlg.current?.close();
    refs.editor?.insertImages(items);
  }

  async function add(files: File[]) {
    files = files.filter((f) => f.type.startsWith('image/'));
    if (!files.length || !notePath) return;
    try {
      const links = await api.addImages(notePath, await toUploads(files));
      toast(links.length === 1 ? 'Image added' : `${links.length} images added`);
      setScope('all');
      await load(notePath, links);
    } catch (err) {
      toast(`Couldn't add: ${errMsg(err)}`);
    }
  }

  async function browse() {
    if (!notePath) return;
    const links = await api.browseImages(notePath);
    if (links.length) { setScope('all'); await load(notePath, links); }
  }

  // Paste while the panel is open (but not into the text fields).
  useEffect(() => {
    if (!notePath) return;
    const onPaste = (e: ClipboardEvent) => {
      if (!dlg.current?.open || e.target instanceof HTMLInputElement) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); void add(files); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  const hasFiles = (e: React.DragEvent) => [...(e.dataTransfer?.types || [])].includes('Files');
  const n = chosen.length;

  return (
    <dialog id="image-dialog" ref={dlg} aria-labelledby="img-title"
      onClose={() => { closeDialog(); refs.editor?.focus(); }}
      onDragEnter={(e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragging(true); }}
      onDragOver={(e) => { if (hasFiles(e)) e.preventDefault(); }}
      onDragLeave={() => { if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dragDepth.current = 0; setDragging(false); void add([...(e.dataTransfer?.files || [])]); }}
      onKeyDown={(e) => {
        const t = e.target as HTMLElement;
        if (e.key === 'Enter' && selected.size && !(t instanceof HTMLInputElement) && !t.closest('.thumb')) { e.preventDefault(); insert(); }
      }}>
      <header className="dlg-head">
        <Icon name="image" />
        <span id="img-title" className="dlg-title">Images</span>
        <span id="img-dir" className="folder-chip small" title={absDir}>{relDir ? `${relDir}/` : ''}</span>
        <span className="spacer" />
        <button id="img-reveal" className="icon-btn" type="button" title="Open the folder in Explorer" aria-label="Open folder"
          onClick={() => { if (notePath) void api.revealImages(notePath); }}>
          <Icon name="folder" />
        </button>
        <button id="img-close" className="icon-btn" type="button" title="Close (Esc)" aria-label="Close" onClick={() => dlg.current?.close()}>
          <Icon name="close" />
        </button>
      </header>
      <div className="dlg-tools">
        <label className="search-box">
          <Icon name="search" />
          <input id="img-filter" ref={filter} type="search" placeholder="Filter by name" autoComplete="off" spellCheck={false}
            aria-label="Filter images" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="seg" role="group" aria-label="Show">
          <button id="img-scope-all" type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>{`All ${images.length}`}</button>
          <button id="img-scope-unused" type="button" aria-pressed={scope === 'unused'} onClick={() => setScope('unused')}>{`Not in note ${unused}`}</button>
        </div>
        <span className="spacer" />
        <button id="img-browse" className="primary-btn" type="button" onClick={() => void browse()}><Icon name="upload" />Upload</button>
      </div>
      <div className="img-body">
        <div className="img-main">
          <div id="img-grid" role="listbox" aria-multiselectable="true" aria-label="Images next to this note" hidden={!images.length}>
            {visible.map((im) => (
              <button key={im.link} type="button" className="thumb" role="option" aria-selected={selected.has(im.link)}
                title={`${im.name} · ${fmtSize(im.size)}${im.used ? ' · in this note' : ''}\nDouble-click to insert`}
                onClick={(e) => select(im, e)} onDoubleClick={() => insert([im.link])}>
                <span className="pic">
                  <img loading="lazy" alt="" src={im.url}
                    onLoad={(e) => { const img = e.currentTarget; setDims((d) => new Map(d).set(im.link, `${img.naturalWidth} × ${img.naturalHeight}`)); }} />
                  <Icon name="check" className="check" />
                  {im.used && <span className="used">In note</span>}
                </span>
                <span className="name">{shortName(stem(im.name))}</span>
              </button>
            ))}
          </div>
          <p id="img-none" className="muted small" hidden={!images.length || visible.length > 0}>No images match.</p>
          <div id="img-empty" className="img-empty" hidden={images.length > 0}>
            <Icon name="upload" className="icon big" />
            <b>No images next to this note yet</b>
            <span className="muted">Drop or paste images anywhere in this window, or</span>
            <button id="img-empty-browse" className="primary-btn" type="button" onClick={() => void browse()}>Choose files…</button>
          </div>
        </div>
        <aside id="img-details" aria-live="polite">
          {n === 0 && (
            <div className="details-empty">
              <Icon name="image" />
              <b>No image selected</b>
              <span className="muted small">Click an image to see it here. Double-click inserts it right away.</span>
            </div>
          )}
          {n > 1 && (
            <>
              <div className="stack">{chosen.slice(0, 6).map((im) => <img key={im.link} src={im.url} alt="" />)}</div>
              <b className="details-title">{`${n} images selected`}</b>
              <span className="muted small">Each one is inserted on its own line, with its file name as alt text.</span>
              <ul className="names">{chosen.map((im) => <li key={im.link}>{im.name}</li>)}</ul>
            </>
          )}
          {n === 1 && (() => {
            const im = chosen[0]!;
            return (
              <>
                <div className="preview"><img src={im.url} alt="" /></div>
                <b className="details-title">{im.name}</b>
                <div className="meta-line small muted">
                  {[dims.get(im.link), fmtSize(im.size)].filter(Boolean).join(' · ')}
                  {im.used && <span className="badge">In this note</span>}
                </div>
                <label className="alt-field small">Alt text
                  <input id="img-alt" type="text" placeholder="Describe the image" value={altDraft.get(im.link) ?? stem(im.name)}
                    onChange={(e) => setAltDraft((d) => new Map(d).set(im.link, e.target.value))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insert(); } }} />
                  <span className="hint">Shown if the image can't load, and read by screen readers.</span>
                </label>
                <code className="path small">{im.link}</code>
              </>
            );
          })()}
        </aside>
      </div>
      <footer className="dlg-foot">
        <span className="muted small hint"><Icon name="upload" />Drop or paste images anywhere here</span>
        <span className="spacer" />
        <span id="img-selection" className="small muted">{n ? `${n} selected` : ''}</span>
        <button id="img-cancel" type="button" onClick={() => dlg.current?.close()}>Cancel</button>
        <button id="img-insert" type="button" className="primary-btn" disabled={n === 0} onClick={() => insert()}>
          {n > 1 ? `Insert ${n} images` : 'Insert'}
        </button>
      </footer>
      <div id="img-overlay" hidden={!dragging}>
        <div className="drop-card">
          <Icon name="upload" className="icon big" />
          <b>Drop to add</b>
          <span id="img-drop-target" className="muted">{relDir ? `into ${relDir}/` : ''}</span>
        </div>
      </div>
    </dialog>
  );
}
