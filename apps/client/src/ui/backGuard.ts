/**
 * Back guard (owner request): an accidental edge swipe ("go back") must not leave the site
 * or close the installed app. After the first tap or key press, one extra history entry
 * (GUARD) is pushed on top of the page's own entry (BASE). A back gesture then lands on
 * BASE: the guard pushes GUARD again and asks "Do you want to leave?".
 *
 * - Pushed only after user input: Chrome skips history entries a page added without one.
 * - In-app hash links (#/playtest, #/) push their own entries above GUARD, so going back
 *   through them never asks; only stepping back past the app's first entry does.
 * - Leaving goes back past both entries. Where there is nothing before them (an installed
 *   app, a new tab), the guard steps back to BASE and tries `window.close()`; if the phone
 *   doesn't allow that, the next back gesture leaves without asking.
 */
export const BASE = 'oml-base';
export const GUARD = 'oml-guard';

type Win = Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout' | 'close'> & {
  history: Pick<History, 'state' | 'pushState' | 'replaceState' | 'go'>;
  location: Pick<Location, 'href'>;
};

const mark = (state: unknown, oml: string) => ({
  ...(state && typeof state === 'object' ? state : {}),
  oml,
});
const tag = (state: unknown) =>
  state && typeof state === 'object' ? (state as { oml?: string }).oml : undefined;

export function installBackGuard(win: Win, onLeaveAttempt: () => void) {
  let leaving = false;
  const arm = () => {
    win.removeEventListener('pointerdown', arm, true);
    win.removeEventListener('keydown', arm, true);
    if (tag(win.history.state) === GUARD) return; // already armed (a reload keeps it)
    win.history.replaceState(mark(win.history.state, BASE), '');
    win.history.pushState({ oml: GUARD }, '');
  };
  const onPop = (e: PopStateEvent) => {
    if (leaving || tag(e.state) !== BASE) return;
    win.history.pushState({ oml: GUARD }, '');
    onLeaveAttempt();
  };
  win.addEventListener('pointerdown', arm, true);
  win.addEventListener('keydown', arm, true);
  win.addEventListener('popstate', onPop as EventListener);
  return {
    /** Leave for real: back past the app's entries (or close it, see above). */
    leave() {
      leaving = true;
      const at = win.location.href;
      win.history.go(-2);
      win.setTimeout(() => {
        if (win.location.href !== at) return;
        // nothing before the app: step back to its own entry and try to close the window
        win.history.go(-1);
        win.close();
      }, 400);
    },
    dispose() {
      win.removeEventListener('pointerdown', arm, true);
      win.removeEventListener('keydown', arm, true);
      win.removeEventListener('popstate', onPop as EventListener);
    },
  };
}
