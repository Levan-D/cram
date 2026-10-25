import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderApp, fakeEditor } from '../render-app';
import type { ImageInfo } from '../../src/api';

vi.mock('../../src/lib/editor', () => import('../fake-editor'));

const img = (name: string, used = false): ImageInfo => ({
  name, link: `images/${name}`, url: `file:///notes/images/${name}`, size: 17 * 1024, mtimeMs: 1, used,
});

async function openLibrary(images: ImageInfo[]) {
  const r = await renderApp({ state: { lastNote: 'react.md' } });
  r.api.listImages!.mockResolvedValue({ dir: 'C:/notes/images', relDir: 'images', images });
  await waitFor(() => expect(document.getElementById('note-title')).toHaveTextContent('react'));
  await r.user.click(screen.getByRole('button', { name: /edit/i }));
  await r.user.click(screen.getByTitle(/insert image/i));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  return r;
}

describe('image library', () => {
  it('filters, selects with Ctrl, and inserts with alt text', async () => {
    const { user } = await openLibrary([img('heap.png', true), img('database-types-schema-relationships-overview.png'), img('tree.png')]);
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByRole('button', { name: 'All 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dlg).getByRole('button', { name: 'Not in note 2' })).toBeInTheDocument();
    expect(within(dlg).getByText('database-types-s…-overview')).toBeInTheDocument(); // middle-truncated
    expect(within(dlg).getByRole('button', { name: 'Insert' })).toBeDisabled();

    await user.click(within(dlg).getByRole('button', { name: 'Not in note 2' }));
    expect(within(dlg).queryByText('heap')).not.toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: 'All 3' }));

    await user.type(within(dlg).getByRole('searchbox', { name: 'Filter images' }), 'tree');
    expect(within(dlg).getAllByRole('option')).toHaveLength(1);
    await user.clear(within(dlg).getByRole('searchbox', { name: 'Filter images' }));

    await user.click(within(dlg).getByTitle(/^heap\.png/));
    expect(within(dlg).getByText('In this note')).toBeInTheDocument();
    const alt = within(dlg).getByRole('textbox');
    expect(alt).toHaveValue('heap');
    await user.clear(alt);
    await user.type(alt, 'A max-heap');
    await user.click(within(dlg).getByRole('button', { name: 'Insert' }));
    expect(fakeEditor.insertImages).toHaveBeenCalledWith([{ link: 'images/heap.png', alt: 'A max-heap' }]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('inserts several images with their file names as alt text', async () => {
    const { user } = await openLibrary([img('a.png'), img('b.png')]);
    const dlg = screen.getByRole('dialog');
    await user.click(within(dlg).getByTitle(/^a\.png/));
    await user.keyboard('{Control>}');
    await user.click(within(dlg).getByTitle(/^b\.png/));
    await user.keyboard('{/Control}');
    expect(within(dlg).getByText('2 images selected')).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: 'Insert 2 images' }));
    expect(fakeEditor.insertImages).toHaveBeenCalledWith([{ link: 'images/a.png', alt: 'a' }, { link: 'images/b.png', alt: 'b' }]);
  });

  it('shows the empty state and uploads through the main process', async () => {
    const { user, api } = await openLibrary([]);
    expect(screen.getByText('No images next to this note yet')).toBeVisible();
    api.browseImages!.mockResolvedValueOnce(['images/new.png']);
    api.listImages!.mockResolvedValue({ dir: 'C:/notes/images', relDir: 'images', images: [img('new.png')] });
    await user.click(screen.getByRole('button', { name: 'Choose files…' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).toBeEnabled()); // the new one is selected
    expect(api.browseImages).toHaveBeenCalledWith('react.md');
  });
});
