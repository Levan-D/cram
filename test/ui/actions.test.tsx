import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp, list, fakeEditor } from '../render-app';
import { useApp } from '../../src/store';
import type { EditMenuInfo } from '../../src/api';

vi.mock('../../src/lib/editor', () => import('../fake-editor'));

const title = () => document.getElementById('note-title');
const ready = (t: string) => waitFor(() => expect(title()).toHaveTextContent(t));

describe('note actions', () => {
  it('renames the open note and keeps history pointing at it', async () => {
    const { user, api } = await renderApp({ state: { lastNote: 'react.md' } });
    await ready('react');
    api.renameNote!.mockImplementationOnce(async () => {
      // the main process moved the file
      const notes = await api.listNotes!();
      api.listNotes!.mockResolvedValue(notes.map((n: { path: string }) => (n.path === 'react.md' ? { ...n, path: 'frontend/react.md', dir: 'frontend' } : n)));
      api.readNote!.mockResolvedValue({ path: 'frontend/react.md', dir: 'frontend', title: 'react', source: '# React\n', mtimeMs: 2, html: '<h1 data-line="0">React</h1>' });
      return 'frontend/react.md';
    });
    await user.keyboard('{F2}');
    await waitFor(() => expect(screen.getByText('Moved to frontend/react.md')).toBeInTheDocument());
    expect(document.getElementById('note-dir')).toHaveTextContent('frontend');
    expect(useApp.getState().history).toEqual(['frontend/react.md']);
  });

  it('creates a note and opens it for editing (Ctrl+N)', async () => {
    const { user, api } = await renderApp();
    api.createNote!.mockResolvedValueOnce('new.md');
    api.listNotes!.mockResolvedValue([{ path: 'new.md', dir: '', title: 'new', text: '' }]);
    api.readNote!.mockResolvedValue({ path: 'new.md', dir: '', title: 'new', source: '', mtimeMs: 1, html: '' });
    await user.keyboard('{Control>}n{/Control}');
    await waitFor(() => expect(document.body).toHaveClass('mode-edit'));
    expect(title()).toHaveTextContent('new');
  });

  it('toggles a favorite with Ctrl+D and shows the star', async () => {
    const { user } = await renderApp({ state: { lastNote: 'react.md' } });
    await ready('react');
    await user.keyboard('{Control>}d{/Control}');
    await waitFor(() => expect(document.getElementById('fav-mark')).toBeVisible());
    expect(list().querySelector('.section-head')).toHaveTextContent('Favorites');
  });

  it('follows links between notes', async () => {
    const { api } = await renderApp({ state: { lastNote: 'react.md' } });
    await ready('react');
    document.getElementById('note-body')!.insertAdjacentHTML('beforeend', '<a href="note:dsa%2Flists.md">lists</a>');
    fireEvent.click(screen.getByText('lists', { selector: 'a' }));
    await waitFor(() => expect(api.readNote).toHaveBeenLastCalledWith('dsa/lists.md'));
    await ready('lists');
  });

  it('collapses the sidebar and brings it back', async () => {
    const { user, api } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(document.body).toHaveClass('sidebar-collapsed');
    expect(api.setPref).toHaveBeenCalledWith('sidebarCollapsed', true);
    await user.keyboard('{Control>}\\{/Control}');
    expect(document.body).not.toHaveClass('sidebar-collapsed');
  });

  it('cycles the theme with Ctrl+Shift+L', async () => {
    const { user, api } = await renderApp();
    await user.keyboard('{Control>}{Shift>}L{/Shift}{/Control}');
    await waitFor(() => expect(api.setPref).toHaveBeenCalledWith('theme', 'light'));
    expect(await screen.findByText('Theme: light')).toBeInTheDocument();
  });

  it('skips deleted notes in history', async () => {
    const { user, api } = await renderApp();
    await user.click(within(list()).getByText('react'));
    await ready('react');
    await user.click(within(list()).getByText('lists'));
    await ready('lists');
    await user.click(within(list()).getByText('heaps'));
    await ready('heaps');
    // lists disappears
    api.listNotes!.mockResolvedValue([{ path: 'dsa/heaps.md', dir: 'dsa', title: 'heaps', text: '' }, { path: 'react.md', dir: '', title: 'react', text: '' }]);
    const onChanged = api.onChanged!.mock.calls[0]![0] as (p: string[]) => Promise<void>;
    await act(async () => onChanged(['dsa/lists.md']));
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    await ready('react');
  });
});

describe('editing edge cases', () => {
  it('keeps your edits when the note changes on disk, and can reload from disk', async () => {
    const { user, api } = await renderApp({ state: { lastNote: 'react.md' } });
    await ready('react');
    await user.click(screen.getByRole('button', { name: /edit/i }));
    act(() => fakeEditor.type('my edits'));
    api.readNote!.mockResolvedValue({ path: 'react.md', dir: '', title: 'react', source: 'their edits', mtimeMs: 9, html: '' });
    const onChanged = api.onChanged!.mock.calls[0]![0] as (p: string[]) => Promise<void>;
    await act(async () => onChanged(['react.md']));
    expect(screen.getByText(/changed on disk while you were editing/)).toBeVisible();
    expect(fakeEditor.text).toBe('my edits');
    await user.click(screen.getByRole('button', { name: 'Reload from disk' }));
    expect(fakeEditor.text).toBe('their edits');
    expect(useApp.getState().dirty).toBe(false);
    expect(screen.getByText('Reloaded from disk')).toBeInTheDocument();
  });

  it('a clean editor just picks up the change on disk', async () => {
    const { user, api } = await renderApp({ state: { lastNote: 'react.md' } });
    await ready('react');
    await user.click(screen.getByRole('button', { name: /edit/i }));
    api.readNote!.mockResolvedValue({ path: 'react.md', dir: '', title: 'react', source: 'outside', mtimeMs: 9, html: '' });
    const onChanged = api.onChanged!.mock.calls[0]![0] as (p: string[]) => Promise<void>;
    await act(async () => onChanged(['react.md']));
    expect(fakeEditor.text).toBe('outside');
  });

  it('autosaves every 10 s while dirty', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, api } = await renderApp({ state: { lastNote: 'react.md' } });
    await ready('react');
    await user.click(screen.getByRole('button', { name: /edit/i }));
    act(() => fakeEditor.type('draft'));
    await act(async () => { vi.advanceTimersByTime(10_100); });
    await waitFor(() => expect(api.saveNote).toHaveBeenCalledWith('react.md', 'draft', 1, { silent: true }));
    expect(screen.getByText(/^Autosaved · /)).toBeInTheDocument();
  });

  it('turning autosave off makes Done a Cancel while dirty', async () => {
    const { user, api } = await renderApp({ state: { lastNote: 'react.md' } });
    await ready('react');
    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /autosave/i }));
    expect(api.setPref).toHaveBeenCalledWith('autosave', false);
    act(() => fakeEditor.type('x'));
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('closing the window with unsaved edits saves first (autosave on)', async () => {
    const { user, api } = await renderApp({ state: { lastNote: 'react.md' } });
    await ready('react');
    await user.click(screen.getByRole('button', { name: /edit/i }));
    act(() => fakeEditor.type('last words'));
    const onRequestClose = api.onRequestClose!.mock.calls[0]![0] as () => void;
    await act(async () => onRequestClose());
    await waitFor(() => expect(api.closeWindow).toHaveBeenCalled());
    expect(api.saveNote).toHaveBeenCalledWith('react.md', 'last words', 1, { silent: true });
  });
});

describe('text right-click menu', () => {
  it('offers spelling suggestions and sends the choice to the main process', async () => {
    const { user, api } = await renderApp();
    const onEditMenu = api.onEditMenu!.mock.calls[0]![0] as (info: EditMenuInfo) => void;
    act(() => onEditMenu({ x: 5, y: 5, editable: true, hasSelection: false, misspelled: 'teh', suggestions: ['the', 'tea'], canCut: false, canCopy: false, canPaste: true }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual([
      'the', 'tea', 'Add "teh" to dictionary', 'CutCtrl+X', 'CopyCtrl+C', 'PasteCtrl+V', 'Select allCtrl+A',
    ]);
    expect(within(menu).getByText('Cut').closest('button')).toBeDisabled();
    await user.click(within(menu).getByText('the'));
    expect(api.editAction).toHaveBeenCalledWith('replace', 'the');
  });
});
