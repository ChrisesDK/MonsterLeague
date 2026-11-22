/**
 * Back guard (owner request): an accidental edge swipe ("go back") must not leave the site
 * or close the installed app. After the first tap or key press, one extra history entry
 * (GUARD) is pushed on top of the page's own entry (BASE). A back gesture then lands on
 * BASE and the game asks "Leave the game?". While it asks, GUARD is not pushed again, so a
 * second back gesture really leaves (the phone's own back, which no page can trigger).
 * "Stay" pushes GUARD again; "Leave" goes back to the page before the game.
 *
 * - Pushed only after user input: Chrome skips history entries a page added without one.
 * - In-app hash links (#/playtest, #/) push their own entries above GUARD, so going back
 *   through them never asks; only stepping back past the app's first entry does.
 * - Where there is nothing before the game (an installed app, a tab opened straight to it),
 *   "Leave" can't go back: it tries `window.close()`, and if the phone doesn't allow that,
 *   `onCannotLeave` lets the dialog say "Swipe back once more to leave" (that swipe exits).
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

export function installBackGuard(
  win: Win,
  onLeaveAttempt: () => void,
  onCannotLeave: () => void = () => undefined,
) {
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
    // on the game's own entry now: the next back gesture leaves, unless the player stays
    onLeaveAttempt();
  };
  win.addEventListener('pointerdown', arm, true);
  win.addEventListener('keydown', arm, true);
  win.addEventListener('popstate', onPop as EventListener);
  return {
    /** Stay: guard the next back gesture again (the tap counts as user input). */
    stay() {
      leaving = false;
      if (tag(win.history.state) !== GUARD) win.history.pushState({ oml: GUARD }, '');
    },
    /** Leave: back to the page before the game, or close it (see above). */
    leave() {
      leaving = true;
      const at = win.location.href;
      win.history.go(-1);
      win.setTimeout(() => {
        if (win.location.href !== at) return;
        // nothing before the game: try to close it; else the next swipe leaves
        win.close();
        onCannotLeave();
      }, 400);
    },
    dispose() {
      win.removeEventListener('pointerdown', arm, true);
      win.removeEventListener('keydown', arm, true);
      win.removeEventListener('popstate', onPop as EventListener);
    },
  };
}
