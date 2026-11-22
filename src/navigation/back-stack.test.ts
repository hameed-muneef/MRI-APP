import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  EXIT_CONFIRM_WINDOW_MS,
  decideBackAction,
  hasBackHandler,
  registerBackHandler,
  runBackHandler,
} from './back-stack';

const cleanups: Array<() => void> = [];
function register(handler: () => void) {
  const cleanup = registerBackHandler(handler);
  cleanups.push(cleanup);
  return cleanup;
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

describe('back handler stack', () => {
  it('reports no handler when empty', () => {
    expect(hasBackHandler()).toBe(false);
    expect(runBackHandler()).toBe(false);
  });

  it('runs the most recently registered handler first (LIFO)', () => {
    const order: string[] = [];
    register(() => order.push('first'));
    const cleanupSecond = register(() => order.push('second'));

    expect(hasBackHandler()).toBe(true);
    expect(runBackHandler()).toBe(true);
    expect(order).toEqual(['second']);

    cleanupSecond();
    expect(runBackHandler()).toBe(true);
    expect(order).toEqual(['second', 'first']);
  });

  it('removes a handler when its cleanup runs', () => {
    const first = vi.fn();
    const second = vi.fn();
    register(first);
    const cleanupSecond = register(second);

    cleanupSecond();
    expect(runBackHandler()).toBe(true);
    expect(second).not.toHaveBeenCalled();
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('drops a throwing handler so back is not stuck', () => {
    const broken = vi.fn(() => {
      throw new Error('boom');
    });
    register(broken);

    expect(runBackHandler()).toBe(false);
    expect(hasBackHandler()).toBe(false);
    expect(runBackHandler()).toBe(false);
    expect(broken).toHaveBeenCalledTimes(1);
  });
});

describe('decideBackAction', () => {
  const now = 1_000_000;

  it('closes an open overlay before anything else', () => {
    expect(
      decideBackAction({view: 'quran', hasOverlay: true, lastExitPressAt: null, now}),
    ).toEqual({action: 'overlay', lastExitPressAt: null});
  });

  it('returns to home from any non-home view and resets the exit timer', () => {
    expect(
      decideBackAction({view: 'settings', hasOverlay: false, lastExitPressAt: now - 100, now}),
    ).toEqual({action: 'home', lastExitPressAt: null});
  });

  it('shows the exit hint on the first press at home', () => {
    expect(
      decideBackAction({view: 'home', hasOverlay: false, lastExitPressAt: null, now}),
    ).toEqual({action: 'hint', lastExitPressAt: now});
  });

  it('exits when the second press arrives inside the window', () => {
    expect(
      decideBackAction({
        view: 'home',
        hasOverlay: false,
        lastExitPressAt: now - EXIT_CONFIRM_WINDOW_MS,
        now,
      }),
    ).toEqual({action: 'exit', lastExitPressAt: null});
  });

  it('hints again when the window has elapsed', () => {
    expect(
      decideBackAction({
        view: 'home',
        hasOverlay: false,
        lastExitPressAt: now - EXIT_CONFIRM_WINDOW_MS - 1,
        now,
      }),
    ).toEqual({action: 'hint', lastExitPressAt: now});
  });

  it('treats clock skew as a fresh press instead of exiting', () => {
    expect(
      decideBackAction({view: 'home', hasOverlay: false, lastExitPressAt: now + 500, now}),
    ).toEqual({action: 'hint', lastExitPressAt: now});
  });

  it('honours a custom exit window', () => {
    expect(
      decideBackAction({
        view: 'home',
        hasOverlay: false,
        lastExitPressAt: now - 500,
        now,
        exitWindowMs: 400,
      }),
    ).toEqual({action: 'hint', lastExitPressAt: now});
  });
});
