// The strips between the toolbar and the note: reading progress, the formatting bar (edit
// mode), the find bar (read mode), and the "changed on disk" banner.
import { useApp } from '../store';
import { refs } from '../refs';
import { bannerDismiss, bannerReload, closeFindbar, findStep, setFindText } from '../actions';
import type { CommandName } from '../lib/editor';
import type { IconName } from '../lib/icons';
import { Icon } from './Icon';
import { toggleEmoji } from './EmojiPopover';

export function Progress() {
  const frac = useApp((s) => s.meta.frac);
  return (
    <div id="progress" aria-hidden="true">
      <div id="progress-fill" style={{ width: `${(frac * 100).toFixed(1)}%` }} />
    </div>
  );
}

type FormatButton = { cmd: CommandName | 'image' | 'emoji'; title: string; icon?: IconName; text?: React.ReactNode } | 'sep';
const FORMAT: FormatButton[] = [
  { cmd: 'bold', title: 'Bold (Ctrl+B)', text: <b>B</b> },
  { cmd: 'italic', title: 'Italic (Ctrl+I)', text: <i>I</i> },
  { cmd: 'strike', title: 'Strikethrough', text: <s>S</s> },
  'sep',
  { cmd: 'h1', title: 'Heading 1', text: 'H1' },
  { cmd: 'h2', title: 'Heading 2', text: 'H2' },
  { cmd: 'h3', title: 'Heading 3', text: 'H3' },
  'sep',
  { cmd: 'bullet', title: 'Bullet list', icon: 'list' },
  { cmd: 'numbered', title: 'Numbered list', icon: 'listOrdered' },
  { cmd: 'task', title: 'Task list', icon: 'task' },
  { cmd: 'quote', title: 'Quote', icon: 'quote' },
  'sep',
  { cmd: 'code', title: 'Inline code', icon: 'code' },
  { cmd: 'codeBlock', title: 'Code block', icon: 'codeBlock' },
  { cmd: 'link', title: 'Link (Ctrl+K)', icon: 'link' },
  { cmd: 'image', title: 'Insert image (copied into images/ next to the note)', icon: 'image' },
  { cmd: 'table', title: 'Table', icon: 'table' },
  { cmd: 'emoji', title: 'Emoji', icon: 'smile' },
  { cmd: 'hr', title: 'Divider', icon: 'hr' },
];

export function FormatBar() {
  const emojiOpen = useApp((s) => s.emojiOpen);
  return (
    // mousedown is prevented so the editor keeps its selection.
    <div id="formatbar" className="edit-only" role="toolbar" aria-label="Formatting"
      onMouseDown={(e) => { if ((e.target as Element).closest('button')) e.preventDefault(); }}>
      {FORMAT.map((b, i) => {
        if (b === 'sep') return <span key={i} className="sep" />;
        const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
          const path = useApp.getState().current?.path;
          if (b.cmd === 'image') { if (path) useApp.setState({ imageDialogFor: path }); }
          else if (b.cmd === 'emoji') toggleEmoji(e.currentTarget);
          else refs.editor?.run(b.cmd);
        };
        return (
          <button key={b.cmd} id={b.cmd === 'emoji' ? 'emoji-btn' : undefined} type="button" data-cmd={b.cmd} title={b.title}
            className={b.cmd === 'emoji' && emojiOpen ? 'active' : undefined} onClick={onClick}
            ref={b.cmd === 'emoji' ? (el) => { refs.emojiBtn = el; } : undefined}>
            {b.icon ? <Icon name={b.icon} /> : b.text}
          </button>
        );
      })}
    </div>
  );
}

export function FindBar() {
  const find = useApp((s) => s.find);
  const countText = find.count ? `${find.index + 1} / ${find.count}` : find.text.trim() ? 'No matches' : '';
  return (
    <div id="findbar" hidden={!find.open}>
      <Icon name="find" />
      <input id="find-input" ref={(el) => { refs.findInput = el; }} type="search" placeholder="Find in note" autoComplete="off"
        spellCheck={false} aria-label="Find in note" value={find.text}
        onChange={(e) => setFindText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); }
          else if (e.key === 'Escape') { e.preventDefault(); closeFindbar(); }
        }} />
      <span id="find-count" className="muted small">{countText}</span>
      <button id="find-prev" className="icon-btn" type="button" title="Previous (Shift+Enter)" aria-label="Previous match" onClick={() => findStep(-1)}>
        <Icon name="up" />
      </button>
      <button id="find-next" className="icon-btn" type="button" title="Next (Enter)" aria-label="Next match" onClick={() => findStep(1)}>
        <Icon name="down" />
      </button>
      <button id="find-close" className="icon-btn" type="button" title="Close (Esc)" aria-label="Close find" onClick={closeFindbar}>
        <Icon name="close" />
      </button>
    </div>
  );
}

export function Banner() {
  const banner = useApp((s) => s.banner);
  return (
    <div id="banner" hidden={!banner}>
      <span id="banner-text">{banner?.text ?? ''}</span>
      <button id="banner-reload" type="button" className="small" hidden={!banner?.reload} onClick={() => void bannerReload()}>Reload from disk</button>
      <button id="banner-dismiss" type="button" className="small" onClick={bannerDismiss}>Keep my edits</button>
    </div>
  );
}
