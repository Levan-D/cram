import { describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderApp } from '../render-app';
import { openNoteAtSection } from '../../src/actions';

vi.mock('../../src/lib/editor', () => import('../fake-editor'));

const NOTE = '# Title\n\n## Lists\n\n### Linked\n\n#### Doubly linked\n\ntext\n\n##### Deeper\n\n## Trees\n';

describe('contents panel', () => {
  it('lists h1–h3 only, while deeper headings keep anchors and quiz jumps', async () => {
    await renderApp({ notes: { 'a.md': NOTE }, state: { lastNote: 'a.md' } });
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('a'));
    const items = [...document.querySelectorAll('#toc-list a')].map((a) => a.textContent);
    expect(items).toEqual(['Title', 'Lists', 'Linked', 'Trees']);
    expect(document.querySelector('#note-body h4')!.id).toBe('doubly-linked');
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    await openNoteAtSection('a.md', 'Lists > Linked > Doubly linked'); // re-renders the note, then jumps
    expect(scrolled.mock.instances.at(-1)).toHaveProperty('id', 'doubly-linked');
  });
});
