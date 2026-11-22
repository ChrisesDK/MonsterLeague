import { describe, expect, it, vi } from 'vitest';
import { BASE, GUARD, installBackGuard } from '../src/ui/backGuard';

/** A minimal browser history: entries with state, a pointer, popstate on go(). */
function fakeWindow(before = 1) {
  const entries: { state: unknown; url: string }[] = Array.from({ length: before }, (_, i) => ({
    state: null,
    url: `prev${i}`,
  }));
  entries.push({ state: null, url: 'app' });
  let at = entries.length - 1;
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const timers: (() => void)[] = [];
  const win = {
    history: {
      get state() {
        return entries[at]!.state;
      },
      pushState(state: unknown) {
        entries.splice(at + 1);
        entries.push({ state, url: entries[at]!.url });
        at++;
      },
      replaceState(state: unknown) {
        entries[at]!.state = state;
      },
      go(n: number) {
        const to = at + n;
        if (to < 0 || to >= entries.length) return;
        at = to;
        for (const l of listeners.get('popstate') ?? []) l({ state: entries[at]!.state });
      },
    },
    location: {
      get href() {
        return entries[at]!.url;
      },
    },
    addEventListener: (type: string, l: (e: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(l);
    },
    removeEventListener: (type: string, l: (e: unknown) => void) => listeners.get(type)?.delete(l),
    setTimeout: (f: () => void) => (timers.push(f), 0),
    close: vi.fn(),
  };
  const fire = (type: string) => [...(listeners.get(type) ?? [])].forEach((l) => l({}));
  return {
    win: win as unknown as Parameters<typeof installBackGuard>[0],
    entries,
    at: () => at,
    fire,
    runTimers: () => timers.splice(0).forEach((f) => f()),
    close: win.close,
  };
}

describe('back guard (an edge swipe must not leave the app)', () => {
  it('does nothing until the first tap (Chrome skips entries added without input)', () => {
    const f = fakeWindow();
    installBackGuard(f.win, () => undefined);
    expect(f.entries).toHaveLength(2);
    f.fire('pointerdown');
    expect(f.entries.map((e) => (e.state as { oml?: string } | null)?.oml)).toEqual([
      undefined,
      BASE,
      GUARD,
    ]);
  });

  it('the first back asks; while it asks, a second back really leaves', () => {
    const f = fakeWindow();
    const ask = vi.fn();
    installBackGuard(f.win, ask);
    f.fire('pointerdown');
    f.win.history.go(-1);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(f.win.location.href).toBe('app');
    // the guard is not pushed again while asking: the phone's own back leaves
    expect((f.win.history.state as { oml: string }).oml).toBe(BASE);
    f.win.history.go(-1);
    expect(f.win.location.href).toBe('prev0');
  });

  it('"Stay" guards the next back again', () => {
    const f = fakeWindow();
    const ask = vi.fn();
    const g = installBackGuard(f.win, ask);
    f.fire('pointerdown');
    f.win.history.go(-1);
    g.stay();
    expect((f.win.history.state as { oml: string }).oml).toBe(GUARD);
    f.win.history.go(-1);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(f.win.location.href).toBe('app');
  });

  it('"Leave" goes back to the page before the game', () => {
    const f = fakeWindow();
    const cannot = vi.fn();
    const g = installBackGuard(f.win, () => undefined, cannot);
    f.fire('pointerdown');
    f.win.history.go(-1);
    g.leave();
    expect(f.win.location.href).toBe('prev0');
    f.runTimers();
    expect(f.close).not.toHaveBeenCalled();
    expect(cannot).not.toHaveBeenCalled();
  });

  it('with nothing before the game (installed app), "Leave" tries to close it, else asks for one more swipe', () => {
    const f = fakeWindow(0);
    const cannot = vi.fn();
    const g = installBackGuard(f.win, () => undefined, cannot);
    f.fire('pointerdown');
    f.win.history.go(-1);
    g.leave();
    f.runTimers();
    expect(f.close).toHaveBeenCalled();
    expect(cannot).toHaveBeenCalled();
    // still on the game's own entry, unguarded: the next swipe is the phone's own back
    expect(f.at()).toBe(0);
  });

  it('a reload on the guard entry does not stack another one', () => {
    const f = fakeWindow();
    f.entries[1]!.state = { oml: GUARD };
    installBackGuard(f.win, () => undefined);
    f.fire('pointerdown');
    expect(f.entries).toHaveLength(2);
  });
});
