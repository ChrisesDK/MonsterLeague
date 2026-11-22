/**
 * Back guard (owner request): an accidental edge swipe ("go back") must not leave the site
 * or close the installed app; the game asks "Leave the game?" first.
 *
 *   swipe back → dialog → Leave        → the app closes (browser: back to the page before)
 *   swipe back → dialog → swipe back   → the app closes (browser: back to the page before)
 *   swipe back → dialog → Stay         → the dialog closes, the swipe had no effect
 *
 * Two ways, chosen at start:
 *
 * - **watcher** (the installed app, where the browser has `CloseWatcher`: Chrome 120+ on
 *   Android): a CloseWatcher catches the phone's back gesture without touching the history.
 *   The history keeps a single entry, which is what lets `window.close()` close the app on
 *   Leave. While the dialog asks there is no watcher, so a second swipe is the phone's own
 *   back and closes the app. Stay starts a new watcher. In-app links (#/playtest, #/)
 *   replace the current entry instead of adding one, so the history stays at one entry.
 * - **history** (the browser, or no CloseWatcher): one extra history entry (GUARD) on top of
 *   the game's own (BASE). A back gesture lands on BASE and the game asks; GUARD is not
 *   pushed again while it asks, so a second swipe really goes back. Stay pushes GUARD again;
 *   Leave goes back to the page before the game. In-app links add their own entries above
 *   GUARD, so going back through them never asks.
 *
 * Both arm on the first tap or key press: Chrome ignores history entries and close watchers
 * a page adds without user input. Where nothing can be closed or gone back to (a tab opened
 * straight to the game), Leave just closes the dialog and the next swipe leaves.
 */
export const BASE = 'oml-base';
export const GUARD = 'oml-guard';

/** The parts of the browser's CloseWatcher the guard uses (not in every TS DOM lib yet). */
export interface CloseWatcherLike {
  onclose: (() => void) | null;
  destroy(): void;
}

type Win = Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout' | 'close'> & {
  history: Pick<History, 'state' | 'pushState' | 'replaceState' | 'go' | 'length'>;
  location: Pick<Location, 'href' | 'replace'>;
  matchMedia?: (q: string) => { matches: boolean };
  navigator?: object;
  CloseWatcher?: new () => CloseWatcherLike;
  document?: Pick<Document, 'addEventListener' | 'removeEventListener'>;
};

const mark = (state: unknown, oml: string) => ({
  ...(state && typeof state === 'object' ? state : {}),
  oml,
});
const tag = (state: unknown) =>
  state && typeof state === 'object' ? (state as { oml?: string }).oml : undefined;

/** True when running as the installed app (its own window, no browser address bar). */
export function isInstalledApp(win: Win): boolean {
  const m = (q: string) => !!win.matchMedia?.(q).matches;
  return (
    m('(display-mode: standalone)') ||
    m('(display-mode: fullscreen)') ||
    m('(display-mode: minimal-ui)') ||
    (win.navigator as { standalone?: boolean } | undefined)?.standalone === true
  );
}

export type GuardMode = 'watcher' | 'history';
export function guardMode(win: Win, forceInstalled = false): GuardMode {
  return (forceInstalled || isInstalledApp(win)) && typeof win.CloseWatcher === 'function'
    ? 'watcher'
    : 'history';
}

export function installBackGuard(
  win: Win,
  onLeaveAttempt: () => void,
  options: { onCannotLeave?: () => void; forceInstalled?: boolean } = {},
) {
  const onCannotLeave = options.onCannotLeave ?? (() => undefined);
  const mode = guardMode(win, options.forceInstalled);
  let leaving = false;
  let watcher: CloseWatcherLike | null = null;

  const watch = () => {
    watcher?.destroy();
    const w = new win.CloseWatcher!();
    w.onclose = () => {
      if (watcher !== w) return;
      watcher = null; // no watcher while asking: a second swipe is the phone's own back
      if (!leaving) onLeaveAttempt();
    };
    watcher = w;
  };

  const arm = () => {
    win.removeEventListener('pointerdown', arm, true);
    win.removeEventListener('keydown', arm, true);
    if (mode === 'watcher') return watch();
    if (tag(win.history.state) === GUARD) return; // already armed (a reload keeps it)
    win.history.replaceState(mark(win.history.state, BASE), '');
    win.history.pushState({ oml: GUARD }, '');
  };
  const onPop = (e: PopStateEvent) => {
    if (leaving || tag(e.state) !== BASE) return;
    onLeaveAttempt(); // on the game's own entry: the next swipe leaves unless Stay
  };
  // installed app: in-app links replace the entry, so the history stays at one entry
  const onLink = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    win.location.replace(a.getAttribute('href')!);
  };

  win.addEventListener('pointerdown', arm, true);
  win.addEventListener('keydown', arm, true);
  if (mode === 'history') win.addEventListener('popstate', onPop as EventListener);
  else win.document?.addEventListener('click', onLink, true);

  /** If still here shortly after trying to leave: close the dialog, unguarded. */
  const unlessGone = (at: string) =>
    win.setTimeout(() => {
      if (win.location.href === at) onCannotLeave();
    }, 400);

  return {
    mode,
    /** Stay: the swipe had no effect, and the next one asks again. */
    stay() {
      leaving = false;
      if (mode === 'watcher') watch();
      else if (tag(win.history.state) !== GUARD) win.history.pushState({ oml: GUARD }, '');
    },
    /** Leave: close the installed app, or go back to the page before the game. */
    leave() {
      leaving = true;
      const at = win.location.href;
      if (mode === 'watcher') {
        watcher?.destroy();
        watcher = null;
        win.close();
        unlessGone(at);
        return;
      }
      win.history.go(-1);
      win.setTimeout(() => {
        if (win.location.href !== at) return;
        win.close(); // nothing before the game: try to close it
        unlessGone(at);
      }, 400);
    },
    dispose() {
      watcher?.destroy();
      win.removeEventListener('pointerdown', arm, true);
      win.removeEventListener('keydown', arm, true);
      win.removeEventListener('popstate', onPop as EventListener);
      win.document?.removeEventListener('click', onLink, true);
    },
  };
}
