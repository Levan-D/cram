import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../render-app';
import { useApp } from '../../src/store';

vi.mock('../../src/lib/editor', () => import('../fake-editor'));

const NOTES = {
  'dsa/heaps.md': '# Heaps\n\nA heap is a tree. ??? why complete\n\n## Insert\n\nBubble up. idk why log n\n- [ ] draw it (a checklist, not a marker)\n',
  'react.md': '# React\n\nKeys keep state.\n\nTODO: reconciliation section\n➕ Claude: keys are compared per sibling list.\n',
  'clean.md': '# Clean\n\nNothing here.\n',
};

describe('unresolved page', () => {
  it('counts markers in the sidebar, lists them by note, filters by kind, and jumps to the line', async () => {
    const { user } = await renderApp({ notes: NOTES, state: { lastNote: 'clean.md' } });
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('clean'));
    const btn = screen.getByRole('button', { name: 'Unresolved (3)' });
    await user.click(btn);
    expect(document.body).toHaveClass('unresolved-open');
    const page = screen.getByRole('region', { name: 'Unresolved' });
    expect(page).toHaveTextContent('3 in 2 notes');
    expect(within(page).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['heapsdsa2', 'react1']);
    const items = () => [...page.querySelectorAll('.unres-item')];
    expect(items().map((b) => b.textContent)).toEqual([
      'ConfusedA heap is a tree. ??? why completeHeaps',
      'ConfusedBubble up. idk why log nInsert',
      'To doTODO: reconciliation sectionReact',
    ]);

    await user.click(within(page).getByRole('button', { name: 'To do 1' }));
    expect(items()).toHaveLength(1);
    expect(within(page).queryByRole('button', { name: /➕/ })).toBeNull(); // ➕ lines aren't markers
    await user.click(within(page).getByRole('button', { name: 'All 3' }));

    // Click a line: the note opens, the page closes, the block flashes.
    await user.click(within(page).getByRole('button', { name: /idk why log n/ }));
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('heaps'));
    expect(document.body).not.toHaveClass('unresolved-open');
    expect(document.querySelector('#note-body [data-line="6"]')).toHaveClass('flash');

    // Ctrl+Shift+U toggles, Esc closes.
    await user.keyboard('{Control>}{Shift>}u{/Shift}{/Control}');
    expect(useApp.getState().unresolvedOpen).toBe(true);
    await user.keyboard('{Escape}');
    expect(useApp.getState().unresolvedOpen).toBe(false);
  });

  it('shows the empty state when nothing is flagged', async () => {
    const { user } = await renderApp({ notes: { 'clean.md': NOTES['clean.md'] } });
    await user.click(screen.getByRole('button', { name: 'Unresolved (0)' }));
    expect(screen.getByRole('region', { name: 'Unresolved' })).toHaveTextContent('Nothing flagged.');
    expect(screen.getByRole('region', { name: 'Unresolved' })).toHaveTextContent('Confused: ??? ?? ?! idk wtf huh no idea don\'t get it confused To do: todo fixme');
  });
});
