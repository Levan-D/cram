import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderApp } from '../render-app';
import { useApp } from '../../src/store';

vi.mock('../../src/lib/editor', () => import('../fake-editor'));

describe('settings dialog', () => {
  it('shows and changes theme, folder and autosave', async () => {
    const { user, api } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const dlg = screen.getByRole('dialog', { name: 'Settings' });
    expect(within(dlg).getByText('C:/notes')).toBeInTheDocument();
    expect(dlg).toHaveTextContent('Notes Viewer 0.0.0-test');
    expect(dlg).toHaveTextContent(`© ${new Date().getFullYear()} Levan D · MIT License`);

    await user.click(within(screen.getByRole('group', { name: 'Theme' })).getByRole('button', { name: 'Dark' }));
    expect(api.setPref).toHaveBeenLastCalledWith('theme', 'dark');
    expect(within(screen.getByRole('group', { name: 'Theme' })).getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(screen.getByRole('group', { name: 'Autosave' })).getByRole('button', { name: 'Off' }));
    expect(api.setPref).toHaveBeenLastCalledWith('autosave', false);
    await user.click(within(screen.getByRole('group', { name: 'Autosave' })).getByRole('button', { name: 'Off' })); // already off: no-op
    expect(api.setPref).toHaveBeenCalledTimes(2);

    await user.click(within(dlg).getByRole('button', { name: 'Change…' }));
    expect(api.pickFolder).toHaveBeenCalled();

    await user.click(within(dlg).getByRole('button', { name: 'Close' })); // (Esc is the dialog's own cancel; jsdom has no such thing)
    expect(useApp.getState().settingsOpen).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.keyboard('{Control>},{/Control}');
    expect(useApp.getState().settingsOpen).toBe(true);
  });
});
