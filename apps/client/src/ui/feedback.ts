/**
 * Haptics for feedback moments (M2d). Respects "reduce motion" (no buzz either) and only
 * vibrates after a user gesture (browsers block it otherwise).
 */
export const HAPTICS = {
  encounter: [120],
  catch: [30, 50, 30, 50, 90],
  levelUp: [40, 40, 40],
  evolve: [60, 60, 60, 60, 160],
  badge: [80, 60, 80, 60, 220],
  tap: [12],
} as const;

export function buzz(kind: keyof typeof HAPTICS): void {
  try {
    if (document.documentElement.dataset.reduceMotion === 'true') return;
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
      .userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate?.([...HAPTICS[kind]]);
  } catch {
    // not supported
  }
}
