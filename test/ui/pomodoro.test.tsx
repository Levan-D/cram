import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../render-app';
import { usePomo, breakAfter, sessionMinutes, DEFAULT_POMODORO } from '../../src/pomodoro';
import { requestClose } from '../../src/actions';

vi.mock('../../src/lib/editor', () => import('../fake-editor'));

const pill = () => screen.getByRole('button', { name: /^pomodoro/i });
const box = () => document.getElementById('pomodoro')!;

describe('pomodoro', () => {
  it('opens the settings from the footer, changes them, resets to defaults', async () => {
    const { user, api } = await renderApp();
    expect(pill()).toHaveTextContent('Pomodoro');
    await user.click(pill());
    const pop = screen.getByRole('dialog', { name: 'Pomodoro' });
    expect(pop).toHaveTextContent('3 × 25 min focus with 5 min breaks ≈ 1 h 25 min.');
    // A long break only exists from 5 blocks on (after every 4th): with 3 it doesn't apply.
    expect(within(pop).getByRole('button', { name: 'More long break' })).toBeDisabled();
    expect(pop).toHaveTextContent('0 of 3 today');

    await user.click(within(pop).getByRole('button', { name: 'More focus' }));
    expect(api.setPref).toHaveBeenLastCalledWith('pomodoro', { focus: 30, shortBreak: 5, longBreak: 10, cycles: 3 });
    expect(pop).toHaveTextContent('≈ 1 h 40 min');
    await user.click(within(pop).getByRole('button', { name: 'Less focus blocks' }));
    await user.click(within(pop).getByRole('button', { name: 'Less focus blocks' }));
    expect(api.setPref).toHaveBeenLastCalledWith('pomodoro', { focus: 30, shortBreak: 5, longBreak: 10, cycles: 1 });
    expect(pop).toHaveTextContent('1 × 30 min focus ≈ 30 min.');
    await user.click(within(pop).getByRole('button', { name: /reset to defaults/i }));
    expect(api.setPref).toHaveBeenLastCalledWith('pomodoro', { focus: 25, shortBreak: 5, longBreak: 10, cycles: 3 });
    expect(within(pop).getByRole('button', { name: /reset to defaults/i })).toBeDisabled();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('runs focus → break → focus with chimes, pauses, skips and stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, api } = await renderApp({ state: { pomodoro: { focus: 25, shortBreak: 5, longBreak: 15, cycles: 2 } } });
    await user.click(pill());
    await user.click(screen.getByRole('button', { name: /start focus · 25 min/i }));
    expect(box()).toHaveClass('focus');
    expect(pill()).toHaveTextContent('25:001/2');
    expect(document.title).toMatch(/^🍅 25:00 · /);
    const pop = screen.getByRole('dialog', { name: 'Pomodoro' });
    expect(pop).toHaveTextContent('Next: 5 min break');

    // The focus block ends: short break, green, a toast (and a chime + notification outside jsdom).
    await act(async () => { vi.advanceTimersByTime(25 * 60_000 + 400); });
    expect(box()).toHaveClass('rest');
    expect(pill()).toHaveTextContent('05:001/2');
    expect(document.getElementById('toast')).toHaveTextContent('Focus 1 of 2 done · session 1 today');
    expect(api.activityBump).toHaveBeenCalledWith('focus'); // counted for the heatmap
    expect(api.activityBump).toHaveBeenCalledWith('session'); // the first finished block makes it a session
    await waitFor(() => expect(pop).toHaveTextContent('Session 1 today'));

    // Pause freezes the clock.
    await user.click(within(pop).getByRole('button', { name: 'Pause' }));
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(pill()).toHaveTextContent('05:00');
    expect(pill()).toHaveTextContent('paused');
    await user.click(within(pop).getByRole('button', { name: 'Resume' }));

    // Skip the break: second focus block.
    await user.click(within(pop).getByRole('button', { name: 'Skip' }));
    expect(box()).toHaveClass('focus');
    expect(pill()).toHaveTextContent('25:002/2');
    expect(pop).toHaveTextContent('Next: Session complete'); // no break after the last block

    await user.click(within(pop).getByRole('button', { name: 'Stop' }));
    expect(usePomo.getState().phase).toBeNull();
    expect(pill()).toHaveTextContent('Pomodoro');
    expect(document.title).toBe('Cram');
    // One session today: one dot on, and the session was counted once for the whole run.
    expect(pill().querySelectorAll('.pomo-dots span.on')).toHaveLength(1);
    expect(api.activityBump!.mock.calls.filter((c) => c[0] === 'session')).toHaveLength(1);
  });

  it('shows today\'s sessions as dots; three make the tomato ripe', async () => {
    const { user } = await renderApp({ today: { sessions: 3, focus: 6 } });
    await waitFor(() => expect(pill().querySelectorAll('.pomo-dots span.on')).toHaveLength(3));
    expect(box()).toHaveClass('full');
    expect(pill()).toHaveAttribute('title', '3 of 3 sessions today · sexy');
    await user.click(pill());
    await user.click(screen.getByRole('button', { name: /start focus/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Bonus run · 3 sessions already today');
  });

  it('ends the session with the last focus block: no break after it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, api } = await renderApp({ state: { pomodoro: { focus: 5, shortBreak: 1, longBreak: 5, cycles: 1 } }, today: { sessions: 1 } });
    await user.click(pill());
    await user.click(screen.getByRole('button', { name: /start focus/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Next: Session complete');
    await act(async () => { vi.advanceTimersByTime(5 * 60_000 + 400); });
    expect(usePomo.getState().phase).toBeNull();
    expect(document.getElementById('toast')).toHaveTextContent('Session complete 🍅 · session 2 today');
    expect(api.activityBump).toHaveBeenCalledWith('focus');
    expect(api.activityBump).toHaveBeenCalledWith('session');
  });

  it('puts the long break after every 4th block, never after the last', () => {
    const p = (cycles: number) => ({ ...DEFAULT_POMODORO, cycles });
    expect([1, 2, 3, 4].map((c) => breakAfter(c, p(4)))).toEqual(['short', 'short', 'short', null]);
    expect([1, 2, 3, 4, 5, 6].map((c) => breakAfter(c, p(6)))).toEqual(['short', 'short', 'short', 'long', 'short', null]);
    expect([4, 8].map((c) => breakAfter(c, p(8)))).toEqual(['long', null]);
    expect(sessionMinutes(p(3))).toBe(3 * 25 + 2 * 5); // 85
    expect(sessionMinutes(p(6))).toBe(6 * 25 + 4 * 5 + 10); // 180
  });

  it('shows the long break in the summary only when the run has one', async () => {
    const { user } = await renderApp({ state: { pomodoro: { focus: 25, shortBreak: 5, longBreak: 10, cycles: 6 } } });
    await user.click(pill());
    const pop = screen.getByRole('dialog', { name: 'Pomodoro' });
    expect(pop).toHaveTextContent('6 × 25 min focus with 5 min breaks and a 10 min long break after every 4th block ≈ 3 h.');
    expect(within(pop).getByRole('button', { name: 'More long break' })).toBeEnabled();
  });

  it('starts each phase when the last one ended, so late ticks don\'t add up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = await renderApp({ state: { pomodoro: { focus: 25, shortBreak: 5, longBreak: 10, cycles: 3 } } });
    await user.click(pill());
    await user.click(screen.getByRole('button', { name: /start focus/i }));
    const focusEnd = usePomo.getState().endsAt!;
    await act(async () => { vi.advanceTimersByTime(25 * 60_000 + 400); });
    expect(usePomo.getState().phase).toBe('short');
    expect(usePomo.getState().endsAt).toBe(focusEnd + 5 * 60_000);
  });

  it('pauses instead of counting the time the computer was asleep', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, api } = await renderApp();
    await user.click(pill());
    await user.click(screen.getByRole('button', { name: /start focus/i }));
    await act(async () => { vi.advanceTimersByTime(60_000); }); // a minute of focus
    vi.setSystemTime(Date.now() + 40 * 60_000); // then 40 min asleep: no ticks in between
    await act(async () => { vi.advanceTimersByTime(300); });
    const s = usePomo.getState();
    expect(s.phase).toBe('focus'); // not "done": the sleep didn't count as focus
    expect(s.pausedLeft).toBeGreaterThan(23 * 60_000);
    expect(pill()).toHaveTextContent('paused');
    expect(document.getElementById('toast')).toHaveTextContent('the computer was asleep');
    expect(api.activityBump).not.toHaveBeenCalled();
  });

  it('asks before closing the window while a timer runs', async () => {
    const { user, api } = await renderApp();
    await user.click(pill());
    await user.click(screen.getByRole('button', { name: /start focus/i }));
    expect(api.setDirty).toHaveBeenLastCalledWith(true); // the main process asks the page before closing
    void requestClose();
    const askDialog = async () => (await screen.findByText('Stop the Pomodoro?')).closest('dialog')!;
    const dlg = await askDialog();
    await user.click(within(dlg).getByRole('button', { name: 'Keep running' }));
    expect(api.closeWindow).not.toHaveBeenCalled();
    void requestClose();
    await user.click(within(await askDialog()).getByRole('button', { name: 'Close anyway' }));
    await waitFor(() => expect(api.closeWindow).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Stop the timer' }));
    expect(api.setDirty).toHaveBeenLastCalledWith(false);
  });
});
