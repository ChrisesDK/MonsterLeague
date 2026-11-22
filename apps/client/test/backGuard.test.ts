import { describe, expect, it, vi } from 'vitest';
import { BASE, GUARD, guardMode, installBackGuard } from '../src/ui/backGuard';

/** A minimal browser: history entries with state, popstate on go(), optional CloseWatcher. */
function fakeWindow({ before = 1, installed = false, watcher = false } = {}) {
  const entries: { state: unknown; url: string }[] = Array.from({ length: before }, (_, i) => ({
    state: null,
    url: `prev${i}`,
  }));
  entries.push({ state: null, url: 'app#/' });
  let at = entries.length - 1;
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const docListeners = new Set<(e: unknown) => void>();
  const timers: (() => void)[] = [];
  const watchers: { onclose: (() => void) | null; destroyed: boolean }[] = [];
  class CW {
    onclose: (() => void) | null = null;
    destroyed = false;
    constructor() {
      watchers.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const win = {
    history: {
      get state() {
        return entries[at]!.state;
      },
      get length() {
        return entries.length;
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
      replace(url: string) {
        entries[at] = { state: null, url: 'app' + url };
      },
    },
    matchMedia: (q: string) => ({ matches: installed && q === '(display-mode: standalone)' }),
    CloseWatcher: watcher ? CW : undefined,
    document: {
      addEventListener: (_t: string, l: (e: unknown) => void) => docListeners.add(l),
      removeEventListener: (_t: string, l: (e: unknown) => void) => docListeners.delete(l),
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
  /** The phone's back gesture: the newest live close watcher takes it, else history back. */
  const swipeBack = () => {
    const w = [...watchers].reverse().find((x) => !x.destroyed);
    if (w) {
      w.destroyed = true;
      w.onclose?.();
    } else win.history.go(-1);
  };
  const clickLink = (href: string) => {
    let prevented = false;
    const e = {
      target: { closest: () => ({ getAttribute: () => href }) },
      preventDefault: () => (prevented = true),
    };
    docListeners.forEach((l) => l(e));
    if (!prevented) win.history.pushState(null); // a normal link adds an entry
  };
  return {
    win: win as unknown as Parameters<typeof installBackGuard>[0],
    entries,
    at: () => at,
    fire,
    swipeBack,
    clickLink,
    runTimers: () => timers.splice(0).forEach((f) => f()),
    close: win.close,
  };
}

describe('back guard: which way', () => {
  it('the installed app with CloseWatcher uses a watcher; otherwise the history', () => {
    expect(guardMode(fakeWindow({ installed: true, watcher: true }).win)).toBe('watcher');
    expect(guardMode(fakeWindow({ installed: true }).win)).toBe('history');
    expect(guardMode(fakeWindow({ watcher: true }).win)).toBe('history');
  });
});

describe('back guard in the browser (history)', () => {
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

  it('swipe → asks; a second swipe really goes back', () => {
    const f = fakeWindow();
    const ask = vi.fn();
    installBackGuard(f.win, ask);
    f.fire('pointerdown');
    f.swipeBack();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(f.win.location.href).toBe('app#/');
    f.swipeBack();
    expect(f.win.location.href).toBe('prev0');
  });

  it('swipe → Stay: the swipe had no effect, the next one asks again', () => {
    const f = fakeWindow();
    const ask = vi.fn();
    const g = installBackGuard(f.win, ask);
    f.fire('pointerdown');
    f.swipeBack();
    g.stay();
    f.swipeBack();
    expect(ask).toHaveBeenCalledTimes(2);
    expect(f.win.location.href).toBe('app#/');
  });

  it('swipe → Leave: back to the page before the game', () => {
    const f = fakeWindow();
    const g = installBackGuard(f.win, () => undefined);
    f.fire('pointerdown');
    f.swipeBack();
    g.leave();
    expect(f.win.location.href).toBe('prev0');
    f.runTimers();
    expect(f.close).not.toHaveBeenCalled();
  });

  it('a reload on the guard entry does not stack another one', () => {
    const f = fakeWindow();
    f.entries[1]!.state = { oml: GUARD };
    installBackGuard(f.win, () => undefined);
    f.fire('pointerdown');
    expect(f.entries).toHaveLength(2);
  });
});

describe('back guard in the installed app (CloseWatcher)', () => {
  const app = () => fakeWindow({ before: 0, installed: true, watcher: true });

  it('catches the swipe without adding history (one entry, so the app may close)', () => {
    const f = app();
    const ask = vi.fn();
    installBackGuard(f.win, ask);
    f.fire('pointerdown');
    expect(f.entries).toHaveLength(1);
    f.swipeBack();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(f.entries).toHaveLength(1);
  });

  it('swipe → Leave: closes the app', () => {
    const f = app();
    const g = installBackGuard(f.win, () => undefined);
    f.fire('pointerdown');
    f.swipeBack();
    g.leave();
    expect(f.close).toHaveBeenCalledTimes(1);
  });

  it('swipe → swipe: the second is the phone’s own back (no watcher while asking)', () => {
    const f = app();
    const ask = vi.fn();
    installBackGuard(f.win, ask);
    f.fire('pointerdown');
    f.swipeBack();
    const before = f.at();
    f.swipeBack(); // no live watcher: history back from the only entry = the app closes
    expect(ask).toHaveBeenCalledTimes(1);
    expect(f.at()).toBe(before);
  });

  it('swipe → Stay: watched again, the next swipe asks again', () => {
    const f = app();
    const ask = vi.fn();
    const g = installBackGuard(f.win, ask);
    f.fire('pointerdown');
    f.swipeBack();
    g.stay();
    f.swipeBack();
    expect(ask).toHaveBeenCalledTimes(2);
    expect(f.close).not.toHaveBeenCalled();
  });

  it('in-app links replace the entry, so the history stays at one entry', () => {
    const f = app();
    installBackGuard(f.win, () => undefined);
    f.fire('pointerdown');
    f.clickLink('#/playtest');
    expect(f.entries).toHaveLength(1);
    expect(f.win.location.href).toBe('app#/playtest');
  });

  it('if the phone refuses to close, the dialog just closes (no extra message)', () => {
    const f = app();
    const cannot = vi.fn();
    const g = installBackGuard(f.win, () => undefined, { onCannotLeave: cannot });
    f.fire('pointerdown');
    f.swipeBack();
    g.leave();
    f.runTimers();
    expect(cannot).toHaveBeenCalled();
  });
});
