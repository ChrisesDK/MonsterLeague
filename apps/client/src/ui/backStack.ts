import { useEffect, useRef } from 'react';

/**
 * What a back gesture does inside the game (owner request): in a menu it goes back one
 * level (a menu screen → the menu → the game view), on the Town Map it closes the map, and
 * only on the game view itself does it ask "Leave the game?" (backGuard.ts). Screens that
 * handle back register here while they are open; the newest one handles the gesture.
 * Cards and strips on the game view (the Journal goal, Nearby) register nothing: a back
 * gesture there asks to leave.
 */
const handlers: { fn: () => void }[] = [];

/** Registers a back handler; returns a function that removes it. */
export function pushBackHandler(fn: () => void): () => void {
  const h = { fn };
  handlers.push(h);
  return () => {
    const i = handlers.indexOf(h);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** Lets the newest open screen handle a back gesture. False when none is open. */
export function handleBack(): boolean {
  const h = handlers[handlers.length - 1];
  if (!h) return false;
  h.fn();
  return true;
}

/** While `active`, a back gesture calls `fn` (always the latest one passed). */
export function useBackHandler(active: boolean, fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => ref.current());
  }, [active]);
}
