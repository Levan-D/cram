// Things that aren't React state: DOM nodes the imperative parts measure or fill (the rendered
// note, the reader's scroll box), the CodeMirror editor, the find highlighter. Components
// register them on mount; actions.ts uses them.
import type { Editor } from './lib/editor';
import { createFinder } from './lib/find';

export const refs = {
  reader: null as HTMLDivElement | null,        // read mode's scroll container
  noteBody: null as HTMLElement | null,          // the rendered note (filled with innerHTML, not React)
  editor: null as Editor | null,
  readHeadings: [] as HTMLHeadingElement[],      // rendered headings (read mode contents)
  editHeadings: [] as { level: number; text: string; pos: number }[],
  lastHtml: '',
  findInput: null as HTMLInputElement | null,
  searchInput: null as HTMLInputElement | null,
  moreBtn: null as HTMLButtonElement | null,
  themeBtn: null as HTMLButtonElement | null,
  emojiBtn: null as HTMLButtonElement | null,
};

export const finder = createFinder(() => refs.noteBody);
