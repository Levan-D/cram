// Markdown source editor (CodeMirror 6). Edits the raw text, so saving never reformats a note.
import { EditorView, keymap } from '@codemirror/view';
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { indentWithTab, redo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { openSearchPanel, search } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import { createSearchPanel } from './search-panel';
import { markdownHeadings } from './toc';

type Command = (view: EditorView) => boolean;
export interface ImageItem { link: string; alt: string }

// Colors come from the app's CSS variables, so light/dark mode just works.
const theme = EditorView.theme({
  '&': { height: '100%', fontSize: 'calc(14px * var(--zoom, 1))', backgroundColor: 'var(--bg)', color: 'var(--fg)' },
  '.cm-scroller': { fontFamily: '"Cascadia Mono", Consolas, ui-monospace, monospace', lineHeight: '1.6' },
  '.cm-content': { padding: '16px 0 80px', caretColor: 'var(--fg)', maxWidth: '820px' },
  '.cm-line': { padding: '0 16px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--selection) !important' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--hover) 60%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--fg)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--code-bg)', border: 'none', color: 'var(--muted)' },
  '.cm-panels': { backgroundColor: 'var(--sidebar)', color: 'var(--fg)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '.cm-panel input, .cm-panel button': { font: 'inherit', fontSize: '13px' },
  '.cm-textfield': { backgroundColor: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--border)', borderRadius: '4px' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--border)', borderRadius: '4px' },
  '.cm-searchMatch': { backgroundColor: 'var(--mark)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--mark-current)' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--mark) 45%, transparent)' },
  '.cm-tooltip': { backgroundColor: 'var(--bg)', border: '1px solid var(--border)' },
});

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', fontSize: '1.25em', color: 'var(--tok-heading)' },
  { tag: t.heading2, fontWeight: '700', fontSize: '1.12em', color: 'var(--tok-heading)' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: '700', color: 'var(--tok-heading)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--accent)' },
  { tag: t.monospace, color: 'var(--tok-string)' },
  { tag: t.quote, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.contentSeparator, t.labelName], color: 'var(--muted)' },
  // (No style for t.list: @lezer/markdown tags *everything* inside a list with it, which painted
  // whole bullet lines. The -, *, 1. markers are processingInstruction and stay muted above.)
  // code inside fenced blocks
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword], color: 'var(--tok-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--tok-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--tok-number)' },
  { tag: [t.comment, t.meta], color: 'var(--tok-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: 'var(--tok-title)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--tok-type)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--tok-attr)' },
  { tag: [t.tagName, t.standard(t.variableName)], color: 'var(--tok-builtin)' },
]);

// Ctrl+B / Ctrl+I: wrap the selection in a marker, or unwrap it if it's already wrapped.
function toggleWrap(marker: string): Command {
  return (view) => {
    const { state } = view;
    const changes = state.changeByRange((range) => {
      const n = marker.length;
      const before = state.sliceDoc(range.from - n, range.from);
      const after = state.sliceDoc(range.to, range.to + n);
      if (before === marker && after === marker) {
        return {
          changes: [{ from: range.from - n, to: range.from }, { from: range.to, to: range.to + n }],
          range: EditorSelection.range(range.from - n, range.to - n),
        };
      }
      return {
        changes: [{ from: range.from, insert: marker }, { from: range.to, insert: marker }],
        range: EditorSelection.range(range.from + n, range.to + n),
      };
    });
    view.dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  };
}

// Toggle a line prefix ("- ", "> ", "## ", …) on every line the selection touches.
// Other prefixes of the same family are replaced, e.g. "- " → "1. ".
const PREFIX_FAMILY = /^(#{1,6} |> |- \[[ xX]\] |[-*+] |\d+\. )/;
function toggleLinePrefix(prefix: string): Command {
  return (view) => {
    const { state } = view;
    const lines = new Map<number, { from: number; text: string }>();
    for (const r of state.selection.ranges) {
      for (let pos = r.from; pos <= r.to; ) {
        const line = state.doc.lineAt(pos);
        lines.set(line.number, line);
        pos = line.to + 1;
      }
    }
    const all = [...lines.values()];
    const allHave = all.every((l) => l.text.startsWith(prefix));
    const changes = all.map((l) => {
      const existing = l.text.match(PREFIX_FAMILY)?.[0] ?? '';
      return { from: l.from, to: l.from + existing.length, insert: allHave ? '' : prefix };
    });
    // Map the selection "forward" (assoc 1) so a cursor at the line start ends up after the
    // inserted prefix instead of in front of it.
    const set = state.changes(changes);
    view.dispatch({ changes: set, selection: state.selection.map(set, 1), userEvent: 'input', scrollIntoView: true });
    view.focus();
    return true;
  };
}

// Ctrl+L like VS Code: select the whole line; press again to extend to the next one.
// (CodeMirror's built-in selectLine won't grow a selection that already ends at a line start.)
const selectLine: Command = (view) => {
  const { doc } = view.state;
  const ranges = view.state.selection.ranges.map((r) =>
    EditorSelection.range(doc.lineAt(r.from).from, Math.min(doc.lineAt(r.to).to + 1, doc.length)));
  view.dispatch({ selection: EditorSelection.create(ranges, view.state.selection.mainIndex), scrollIntoView: true, userEvent: 'select' });
  return true;
};

// Put images on their own lines at the cursor. With an empty alt text the cursor lands in it.
function insertImageLines(view: EditorView, items: ImageItem[]) {
  const r = view.state.selection.main;
  const line = view.state.doc.lineAt(r.from);
  const before = r.from > line.from ? '\n' : '';
  const after = r.to < view.state.doc.lineAt(r.to).to ? '\n' : '';
  const body = items.map((it) => `![${it.alt}](${it.link})`).join('\n');
  const anchor = items.length === 1 && !items[0]!.alt ? r.from + before.length + 2 : r.from + before.length + body.length;
  view.dispatch({ changes: { from: r.from, to: r.to, insert: before + body + after }, selection: { anchor }, userEvent: 'input', scrollIntoView: true });
  view.focus();
}

// Insert text at the cursor (replacing the selection) and select part of it.
function insertSnippet(build: (selected: string) => { text: string; selFrom: number; selTo: number }): Command {
  return (view) => {
    const r = view.state.selection.main;
    const selected = view.state.sliceDoc(r.from, r.to);
    const { text, selFrom, selTo } = build(selected);
    view.dispatch({
      changes: { from: r.from, to: r.to, insert: text },
      selection: EditorSelection.range(r.from + selFrom, r.from + selTo),
      userEvent: 'input',
      scrollIntoView: true,
    });
    view.focus();
    return true;
  };
}

// Formatting toolbar commands; the common ones are also keyboard shortcuts below.
export const commands = {
  bold: toggleWrap('**'),
  italic: toggleWrap('*'),
  strike: toggleWrap('~~'),
  code: toggleWrap('`'),
  h1: toggleLinePrefix('# '),
  h2: toggleLinePrefix('## '),
  h3: toggleLinePrefix('### '),
  bullet: toggleLinePrefix('- '),
  numbered: toggleLinePrefix('1. '),
  task: toggleLinePrefix('- [ ] '),
  quote: toggleLinePrefix('> '),
  codeBlock: insertSnippet((sel) => {
    const body = sel || 'code';
    return { text: '```ts\n' + body + '\n```\n', selFrom: 6, selTo: 6 + body.length };
  }),
  link: insertSnippet((sel) => (sel
    ? { text: `[${sel}](url)`, selFrom: sel.length + 3, selTo: sel.length + 6 }
    : { text: '[text](url)', selFrom: 1, selTo: 5 })),
  table: insertSnippet(() => ({ text: '\n| Column | Column |\n| --- | --- |\n| cell | cell |\n', selFrom: 3, selTo: 9 })),
  hr: insertSnippet(() => ({ text: '\n---\n', selFrom: 5, selTo: 5 })),
} satisfies Record<string, Command>;

export type CommandName = keyof typeof commands;

export interface EditorHandlers {
  onChange(text: string): void;
  onSave(): void;
  onPasteImage(file: File): Promise<string | null>;
  onDropImages(files: File[]): Promise<ImageItem[]>;
  onScroll(): void;
}

export interface Editor {
  load(text: string): void;
  replace(text: string): void;
  readonly text: string;
  focus(): void;
  find(): void;
  run(name: CommandName): void;
  insertImages(items: ImageItem[]): void;
  insert(text: string): void;
  headings(): { level: number; text: string; pos: number }[];
  jumpTo(pos: number): void;
  topPos(): number;
  topLine(): number;
  scrollToLine(x: number, opts?: { cursor?: boolean }): void;
  destroy(): void;
}

export function createEditor(parent: HTMLElement, handlers: EditorHandlers): Editor {
  const extensions = [
    basicSetup,
    search({ top: true, createPanel: createSearchPanel }), // our own find & replace UI
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(highlight),
    theme,
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => { handlers.onSave(); return true; } },
      { key: 'Mod-b', run: commands.bold },
      { key: 'Mod-i', run: commands.italic },
      { key: 'Mod-k', run: commands.link, preventDefault: true },
      { key: 'Mod-l', run: selectLine, preventDefault: true },
      { key: 'Mod-Shift-z', run: redo, preventDefault: true }, // VS Code-style redo (Ctrl+Y works too)
      indentWithTab,
    ]),
    EditorView.updateListener.of((u) => { if (u.docChanged) handlers.onChange(u.state.doc.toString()); }),
    // Spellcheck (red squiggles + right-click suggestions come from Chromium / the main process).
    EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'off', autocapitalize: 'off' }),
    EditorView.domEventHandlers({
      // Pasting an image saves it next to the note and inserts a markdown link to it.
      paste(event, view) {
        const file = [...(event.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
        if (!file) return false;
        event.preventDefault();
        void handlers.onPasteImage(file).then((link) => { if (link) insertImageLines(view, [{ link, alt: '' }]); });
        return true;
      },
      // Dropping image files onto the editor: copy them next to the note and link them where they landed.
      drop(event, view) {
        const files = [...(event.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
        view.dispatch({ selection: { anchor: pos } });
        void handlers.onDropImages(files).then((items) => { if (items.length) insertImageLines(view, items); });
        return true;
      },
    }),
  ];

  const view = new EditorView({ parent, state: EditorState.create({ doc: '', extensions }) });
  const onScroll = () => handlers.onScroll();
  view.scrollDOM.addEventListener('scroll', onScroll);

  return {
    // Load a document with a fresh undo history (Ctrl+Z won't jump back into another note).
    load(text) { view.setState(EditorState.create({ doc: text, extensions })); },
    // Replace the text but keep undo history (e.g. reloading from disk can be undone).
    replace(text) { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); },
    get text() { return view.state.doc.toString(); },
    focus() { view.focus(); },
    find() { view.focus(); openSearchPanel(view); },
    run(name) { commands[name](view); },
    insertImages(items) { insertImageLines(view, items); },
    insert(text) { view.dispatch(view.state.replaceSelection(text), { userEvent: 'input', scrollIntoView: true }); view.focus(); },
    headings() { return markdownHeadings(view.state.doc.toString()); },
    // Put the cursor on pos and scroll it to the top.
    jumpTo(pos) {
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 16 }) });
      view.focus();
    },
    // Document position of the first visible line.
    topPos() { return view.lineBlockAtHeight(view.scrollDOM.scrollTop).from; },
    // Source line at the top edge, 0-based with a fraction for how far into a (wrapped) line.
    topLine() {
      const h = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
      const block = view.lineBlockAtHeight(Math.max(0, h));
      const frac = block.height ? Math.min(1, Math.max(0, (h - block.top) / block.height)) : 0;
      return view.state.doc.lineAt(block.from).number - 1 + frac;
    },
    // Scroll so that (fractional) source line x sits at the top. With `cursor`, put the cursor
    // at the start of the first non-blank line from there.
    scrollToLine(x, { cursor = false } = {}) {
      const { doc } = view.state;
      const n = Math.min(doc.lines, Math.max(1, Math.floor(x) + 1));
      const line = doc.line(n);
      const frac = Math.min(1, Math.max(0, x - (n - 1)));
      const pos = line.from + Math.round(frac * line.length);
      const spec: TransactionSpec = { effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 0 }) };
      if (cursor) {
        let c = frac >= 0.5 && n < doc.lines ? n + 1 : n;
        while (c < doc.lines && c < n + 4 && !doc.line(c).text.trim()) c++;
        spec.selection = { anchor: doc.line(c).from };
      }
      view.dispatch(spec);
    },
    destroy() { view.scrollDOM.removeEventListener('scroll', onScroll); view.destroy(); },
  };
}
