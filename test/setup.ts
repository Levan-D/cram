// Vitest setup: jest-dom matchers, a fake window.notesApi, and the browser bits jsdom lacks.
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { fakeApi } from './fake-api';

// jsdom has <dialog> but not showModal / close.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
// …nor scrollIntoView, ResizeObserver, matchMedia.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
window.matchMedia ??= ((query: string) => ({
  matches: query.includes('min-width: 1000px'), // tests run "wide": contents docked
  media: query, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

window.notesApi = fakeApi();

afterEach(() => {
  cleanup();
  window.notesApi = fakeApi();
  vi.useRealTimers();
});
