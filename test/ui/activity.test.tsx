import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderApp, list } from '../render-app';
import { localDay } from '../../src/lib/activity';

vi.mock('../../src/lib/editor', () => import('../fake-editor'));

const day = (back: number) => { const d = new Date(); d.setDate(d.getDate() - back); return localDay(d); };

describe('study activity heatmap', () => {
  it('opens from the sidebar with the last 26 weeks, totals and streak', async () => {
    const { user } = await renderApp({ activity: { [day(0)]: { focus: 2, quizzes: 1, sessions: 1 }, [day(1)]: { focus: 1, quizzes: 0, sessions: 1 }, [day(3)]: { focus: 0, quizzes: 4 } } });
    await user.click(screen.getByRole('button', { name: 'Study activity' }));
    const pop = await screen.findByRole('dialog', { name: 'Study activity' });
    await waitFor(() => expect(pop).toHaveTextContent('3 study days · 2 sessions · 3 focus blocks · 5 quizzes · 2-day streak'));
    expect(pop.querySelectorAll('.heat .cell')).toHaveLength(26 * 7);
    expect(pop.querySelectorAll('.heat .cell.l2')).toHaveLength(1); // today: 3 units
    expect(pop.querySelectorAll('.heat .cell.l1')).toHaveLength(1);
    expect(pop.querySelectorAll('.heat .cell.l3')).toHaveLength(1); // 4 quizzes
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('export as PDF from the note menu goes through the main process', async () => {
    const { user, api } = await renderApp({ state: { lastNote: 'react.md' } });
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('react'));
    api.exportPdf!.mockResolvedValue('C:/Users/x/Documents/react.pdf');
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: /export as pdf/i }));
    await waitFor(() => expect(api.exportPdf).toHaveBeenCalledWith('react.md'));
    await waitFor(() => expect(document.getElementById('toast')).toHaveTextContent('Saved react.pdf'));

    // From the sidebar on another note: it opens first, then prints.
    await user.pointer({ keys: '[MouseRight]', target: within(list()).getByText('lists') });
    await user.click(await screen.findByRole('menuitem', { name: /export as pdf/i }));
    await waitFor(() => expect(api.exportPdf).toHaveBeenLastCalledWith('dsa/lists.md'));
    expect(document.getElementById('note-title')).toHaveTextContent('lists');
  });
});
