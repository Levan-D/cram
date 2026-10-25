// Stand-in for src/lib/editor (CodeMirror can't lay out in jsdom). Test files do:
//   vi.mock('../../src/lib/editor', () => import('../fake-editor'));
import { vi } from 'vitest';
import { markdownHeadings } from '../src/lib/toc';
import type { EditorHandlers } from '../src/lib/editor';

export const fakeEditor = {
  handlers: null as EditorHandlers | null,
  text: '',
  load: vi.fn(),
  scrollToLine: vi.fn(),
  run: vi.fn(),
  insertImages: vi.fn(),
  insert: vi.fn(),
  // What typing does: the doc changes, CodeMirror reports it.
  type(text: string) { this.text = text; this.handlers!.onChange(text); },
};

export const commands = {};

export function createEditor(_parent: HTMLElement, handlers: EditorHandlers) {
      fakeEditor.handlers = handlers;
      return {
        load: (t: string) => { fakeEditor.text = t; fakeEditor.load(t); },
        replace: (t: string) => { fakeEditor.text = t; },
        get text() { return fakeEditor.text; },
        focus() {},
        find() {},
        run: (name: string) => fakeEditor.run(name),
        insertImages: (items: unknown) => fakeEditor.insertImages(items),
        insert: (t: string) => fakeEditor.insert(t),
        headings: () => markdownHeadings(fakeEditor.text),
        jumpTo() {},
        topPos: () => 0,
        topLine: () => 0,
        scrollToLine: (...a: unknown[]) => fakeEditor.scrollToLine(...a),
        destroy() {},
  };
}
