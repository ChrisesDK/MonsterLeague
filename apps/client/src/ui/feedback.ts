/**
 * Haptics for feedback moments (M2d). Follows the Vibration setting (D151; it used to
 * follow "reduce motion") and only vibrates after a user gesture (browsers block it
 * otherwise).
 */
export const HAPTICS = {
  encounter: [120],
  catch: [30, 50, 30, 50, 90],
  levelUp: [40, 40, 40],
  evolve: [60, 60, 60, 60, 160],
  badge: [80, 60, 80, 60, 220],
  /** A finished route opened a zone (P22). */
  zone: [60, 40, 60],
  tap: [12],
} as const;

export function buzz(kind: keyof typeof HAPTICS): void {
  try {
    if (document.documentElement.dataset.vibration === 'off') return;
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
      .userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate?.([...HAPTICS[kind]]);
  } catch {
    // not supported
  }
}
