import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp, list, fakeEditor } from '../render-app';
import { useApp } from '../../src/store';

vi.mock('../../src/lib/editor', () => import('../fake-editor'));

const openNote = async (user: Awaited<ReturnType<typeof renderApp>>['user'], title: string) => {
  await user.click(within(list()).getByText(title));
  await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent(title));
};

describe('sidebar', () => {
  it('shows the folder tree with counts', async () => {
    await renderApp();
    const tree = list();
    expect(within(tree).getByText('dsa').closest('li')).toHaveAttribute('aria-expanded', 'true');
    expect(within(tree).getByText('dsa').parentElement!.querySelector('.count')).toHaveTextContent('2');
    expect(within(tree).getByText('heaps')).toBeInTheDocument();
    expect(screen.getByText('Select a note.')).toBeVisible();
  });

  it('collapses a folder and remembers it', async () => {
    const { user } = await renderApp();
    await user.click(within(list()).getByText('dsa'));
    expect(within(list()).queryByText('heaps')).not.toBeInTheDocument();
    expect(localStorage.getItem('nv-collapsed:C:/notes')).toBe('["dsa"]');
  });

  it('puts favorites on top', async () => {
    await renderApp({ state: { favorites: ['react.md'] } });
    const heads = [...list().querySelectorAll('.section-head')].map((h) => h.textContent);
    expect(heads).toEqual(['Favorites', 'All notes']);
  });

  it('searches with snippets, and opens a result from the keyboard', async () => {
    const { user, api } = await renderApp();
    await user.type(screen.getByRole('searchbox', { name: /search all notes/i }), 'bubble');
    expect(screen.getByText('1 result')).toBeVisible();
    expect(list().querySelector('mark')).toHaveTextContent('bubble');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(api.readNote).toHaveBeenCalledWith('dsa/heaps.md'));
    expect(document.getElementById('note-title')).toHaveTextContent('heaps');
    expect(document.getElementById('findbar')).toBeVisible(); // search words get highlighted in the note
    await user.keyboard('{Escape}'); // clears the search first
    expect(screen.getByRole('searchbox', { name: /search all notes/i })).toHaveValue('');
  });

  it('opens the last note on startup and renders it', async () => {
    await renderApp({ state: { lastNote: 'react.md' } });
    await waitFor(() => expect(document.getElementById('note-body')).toHaveTextContent('Keys keep state.'));
    expect(document.body).toHaveClass('has-note', 'mode-read');
    expect(document.title).toBe('react - Notes Viewer');
  });
});

describe('menus', () => {
  it('favorites a note from its right-click menu', async () => {
    const { user, api } = await renderApp();
    fireEvent.contextMenu(within(list()).getByText('react'), { clientX: 10, clientY: 10 });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual([
      'Open', 'Add to favoritesCtrl+D', 'Rename / move…F2', 'Quiz this noteCtrl+Shift+Q', 'Show in Explorer', 'Open in VS Code', 'Export as PDF…', 'Delete…',
    ]);
    await user.click(within(menu).getByText('Add to favorites'));
    await waitFor(() => expect(api.setFavorite).toHaveBeenCalledWith('react.md', true));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(await screen.findByText('Added to favorites')).toBeInTheDocument();
  });

  it('colors a folder from the swatches', async () => {
    const { user, api } = await renderApp();
    fireEvent.contextMenu(within(list()).getByText('dsa'), { clientX: 10, clientY: 10 });
    await user.click(await screen.findByTitle('Green'));
    await waitFor(() => expect(api.setFolderColor).toHaveBeenCalledWith('dsa', 'green'));
    await waitFor(() => expect(within(list()).getByText('dsa').closest('li')).toHaveClass('colored'));
  });

  it('closes on Esc and moves with the arrow keys', async () => {
    const { user } = await renderApp({ state: { lastNote: 'react.md' } });
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('react'));
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('Add to favorites');
    await waitFor(() => expect(items[0]).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('deletes only after the main process confirms', async () => {
    const { user, api } = await renderApp({ state: { lastNote: 'react.md' } });
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('react'));
    api.deleteNote!.mockResolvedValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByText('Delete…'));
    await waitFor(() => expect(screen.getByText('Moved "react" to the Recycle Bin.')).toBeVisible());
    expect(document.body).not.toHaveClass('has-note');
  });
});

describe('reading', () => {
  it('goes back and forward through opened notes', async () => {
    const { user } = await renderApp();
    await openNote(user, 'react');
    await openNote(user, 'lists');
    const back = screen.getByRole('button', { name: 'Back' });
    expect(screen.getByRole('button', { name: 'Forward' })).toBeDisabled();
    await user.click(back);
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('react'));
    expect(back).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Forward' }));
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('lists'));
  });

  it('builds the contents from headings and opens the find bar with Ctrl+F', async () => {
    const { user } = await renderApp({ state: { lastNote: 'dsa/heaps.md' } });
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Table of contents' })).toBeVisible());
    expect(within(screen.getByRole('navigation', { name: 'Table of contents' })).getAllByRole('link').map((a) => a.textContent)).toEqual(['Heaps', 'Insert', 'Remove']);
    await user.keyboard('{Control>}f{/Control}');
    expect(document.getElementById('findbar')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(document.getElementById('findbar')).not.toBeVisible();
  });

  it('reloads the note when it changes on disk', async () => {
    const { api } = await renderApp({ state: { lastNote: 'react.md' } });
    await waitFor(() => expect(document.getElementById('note-body')).toHaveTextContent('Keys keep state.'));
    const onChanged = api.onChanged!.mock.calls[0]![0] as (paths: string[]) => void;
    api.readNote!.mockResolvedValueOnce({ path: 'react.md', dir: '', title: 'react', source: '# React\n\nNew text.\n', mtimeMs: 5, html: '<p data-line="2">New text.</p>' });
    await act(async () => onChanged(['react.md']));
    await waitFor(() => expect(document.getElementById('note-body')).toHaveTextContent('New text.'));
  });

  it('zooms with the status bar buttons', async () => {
    const { user, api } = await renderApp({ state: { lastNote: 'react.md' } });
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByRole('button', { name: '110%' })).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--zoom')).toBe('1.1');
    expect(api.setPref).toHaveBeenCalledWith('zoom', 1.1);
  });
});

describe('editing', () => {
  it('edits, marks the note dirty, and saves with Ctrl+S', async () => {
    const { user, api } = await renderApp({ state: { lastNote: 'react.md' } });
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('react'));
    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(document.body).toHaveClass('mode-edit');
    expect(fakeEditor.load).toHaveBeenLastCalledWith('# React\n\nKeys keep state.\n');
    act(() => fakeEditor.type('# React\n\nKeys keep state. Edited.\n'));
    expect(document.title).toBe('• react - Notes Viewer');
    expect(screen.getByText('● Unsaved changes')).toBeInTheDocument();
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(api.saveNote).toHaveBeenCalledWith('react.md', '# React\n\nKeys keep state. Edited.\n', 1, { silent: true }));
    await waitFor(() => expect(screen.getByText(/^Saved · /)).toBeInTheDocument());
    expect(document.title).toBe('react - Notes Viewer');
  });

  it('autosave off: Cancel asks before discarding, and stays when you say no', async () => {
    const { user, api } = await renderApp({ state: { lastNote: 'react.md', autosave: false } });
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('react'));
    await user.click(screen.getByRole('button', { name: /edit/i }));
    act(() => fakeEditor.type('changed'));
    const cancel = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancel);
    await waitFor(() => expect(api.confirmCancelEdit).toHaveBeenCalledWith('react'));
    expect(document.body).toHaveClass('mode-edit');
    expect(api.saveNote).not.toHaveBeenCalled();
  });

  it('autosave off: switching notes with unsaved edits asks Save / Don\'t save / Cancel', async () => {
    const { user, api } = await renderApp({ state: { lastNote: 'react.md', autosave: false } });
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('react'));
    await user.click(screen.getByRole('button', { name: /edit/i }));
    act(() => fakeEditor.type('changed'));
    await user.click(within(list()).getByText('lists'));
    await waitFor(() => expect(api.confirmDiscard).toHaveBeenCalledWith('react'));
    expect(document.getElementById('note-title')).toHaveTextContent('react'); // cancelled: stays
  });

  it('autosave on: Done saves silently and goes back to reading', async () => {
    const { user, api } = await renderApp({ state: { lastNote: 'react.md' } });
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('react'));
    await user.click(screen.getByRole('button', { name: /edit/i }));
    act(() => fakeEditor.type('# React\n\nRewritten.\n'));
    await user.click(screen.getByRole('button', { name: /done/i }));
    await waitFor(() => expect(document.body).toHaveClass('mode-read'));
    expect(api.saveNote).toHaveBeenCalledWith('react.md', '# React\n\nRewritten.\n', 1, { silent: true });
    await waitFor(() => expect(document.getElementById('note-body')).toHaveTextContent('Rewritten.'));
  });

  it('formatting buttons run editor commands; the image button opens the library', async () => {
    const { user, api } = await renderApp({ state: { lastNote: 'react.md' } });
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('react'));
    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByTitle('Bold (Ctrl+B)'));
    expect(fakeEditor.run).toHaveBeenCalledWith('bold');
    await user.click(screen.getByTitle(/insert image/i));
    await waitFor(() => expect(api.listImages).toHaveBeenCalledWith('react.md'));
    expect(await screen.findByText('No images next to this note yet')).toBeInTheDocument();
    expect(useApp.getState().imageDialogFor).toBe('react.md');
  });

  it('a conflict pauses autosave and shows the banner', async () => {
    const { user, api } = await renderApp({ state: { lastNote: 'react.md' } });
    await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('react'));
    await user.click(screen.getByRole('button', { name: /edit/i }));
    act(() => fakeEditor.type('mine'));
    api.saveNote!.mockResolvedValueOnce({ saved: false, reason: 'conflict' });
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(screen.getByText(/changed on disk while you were editing/)).toBeVisible());
    expect(useApp.getState().autosavePaused).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Keep my edits' }));
    expect(document.getElementById('banner')).not.toBeVisible();
  });
});
