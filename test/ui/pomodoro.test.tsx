import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../render-app';
import { usePomo } from '../../src/pomodoro';

vi.mock('../../src/lib/editor', () => import('../fake-editor'));

const pill = () => screen.getByRole('button', { name: /^pomodoro/i });
const box = () => document.getElementById('pomodoro')!;

describe('pomodoro', () => {
  it('opens the settings from the footer, changes them, resets to defaults', async () => {
    const { user, api } = await renderApp();
    expect(pill()).toHaveTextContent('Pomodoro');
    await user.click(pill());
    const pop = screen.getByRole('dialog', { name: 'Pomodoro' });
    expect(pop).toHaveTextContent('3 × 25 min focus with 5 min breaks, then a 10 min long break ≈ 1 h 35 min.');
    expect(pop).toHaveTextContent('0 of 3 today');

    await user.click(within(pop).getByRole('button', { name: 'More focus' }));
    expect(api.setPref).toHaveBeenLastCalledWith('pomodoro', { focus: 30, shortBreak: 5, longBreak: 10, cycles: 3 });
    expect(pop).toHaveTextContent('≈ 1 h 50 min');
    await user.click(within(pop).getByRole('button', { name: 'Less focus blocks' }));
    await user.click(within(pop).getByRole('button', { name: 'Less focus blocks' }));
    expect(api.setPref).toHaveBeenLastCalledWith('pomodoro', { focus: 30, shortBreak: 5, longBreak: 10, cycles: 1 });
    expect(pop).toHaveTextContent('1 × 30 min focus, then a 10 min long break ≈ 40 min.');
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
    expect(pop).toHaveTextContent('Next: 15 min long break');

    await user.click(within(pop).getByRole('button', { name: 'Stop' }));
    expect(usePomo.getState().phase).toBeNull();
    expect(pill()).toHaveTextContent('Pomodoro');
    expect(document.title).toBe('Notes Viewer');
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

  it('ends the session after the long break', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = await renderApp({ state: { pomodoro: { focus: 5, shortBreak: 1, longBreak: 5, cycles: 1 } }, today: { sessions: 1 } });
    await user.click(pill());
    await user.click(screen.getByRole('button', { name: /start focus/i }));
    await act(async () => { vi.advanceTimersByTime(5 * 60_000 + 400); });
    expect(box()).toHaveClass('rest');
    expect(screen.getByRole('dialog')).toHaveTextContent('Next: Session complete');
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Session 2 today · 3 makes it sexy'));
    await act(async () => { vi.advanceTimersByTime(5 * 60_000 + 400); });
    expect(usePomo.getState().phase).toBeNull();
    expect(document.getElementById('toast')).toHaveTextContent('Session complete');
  });
});
