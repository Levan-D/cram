// Render the whole app against the fake API. CodeMirror is replaced by test/fake-editor.ts
// (vi.mock in each test file) because jsdom can't lay out a real editor.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, type Mock } from 'vitest';
import { App } from '../src/ui/App';
import { useApp, initialState } from '../src/store';
import { useQuiz } from '../src/quiz';
import { fakeApi } from './fake-api';
import { fakeEditor } from './fake-editor';

export async function renderApp(opts: Parameters<typeof fakeApi>[0] = {}) {
  useApp.setState(initialState(), true);
  useQuiz.setState({ view: 'closed', shown: false, scope: null, data: null, run: null }, true);
  localStorage.clear();
  document.body.className = 'booting';
  window.notesApi = fakeApi(opts);
  fakeEditor.text = '';
  vi.clearAllMocks();
  const user = userEvent.setup();
  const utils = render(<App />);
  await waitFor(() => expect(useApp.getState().view).not.toBe('loading'));
  return { user, // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api: window.notesApi as unknown as Record<string, Mock<(...args: any[]) => any>>, ...utils };
}

export const list = () => screen.getByRole('listbox', { name: 'Notes' });
export { fakeEditor };
