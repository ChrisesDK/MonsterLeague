/**
 * Active-time stopwatch as plain data (so it can be saved with the battle). Time while
 * paused (pause button, app in background, app closed) is not counted.
 */
export interface ActiveTimer {
  /** Milliseconds accumulated in finished running stretches. */
  activeMs: number;
  /** Clock time the current running stretch started, or null when paused. */
  runningSince: number | null;
}

export function startTimer(now: number): ActiveTimer {
  return { activeMs: 0, runningSince: now };
}

export function isRunning(t: ActiveTimer): boolean {
  return t.runningSince !== null;
}

/** Elapsed active time at `now` (never negative, even if the clock jumped back). */
export function readTimer(t: ActiveTimer, now: number): number {
  const running = t.runningSince === null ? 0 : Math.max(0, now - t.runningSince);
  return Math.round(t.activeMs + running);
}

export function pauseTimer(t: ActiveTimer, now: number): ActiveTimer {
  if (t.runningSince === null) return t;
  return { activeMs: readTimer(t, now), runningSince: null };
}

export function resumeTimer(t: ActiveTimer, now: number): ActiveTimer {
  if (t.runningSince !== null) return t;
  return { ...t, runningSince: now };
}

/**
 * Restoring a timer that was saved while running (the app was closed or crashed): count
 * time only up to when it was saved, and leave it paused.
 */
export function restoreTimer(t: ActiveTimer, savedAt: number): ActiveTimer {
  return pauseTimer(t, savedAt);
}
