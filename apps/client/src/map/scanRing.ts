/**
 * The scan inside the battle range (owner request): a thin circle on the ground that grows
 * from the player out to the 40 m ring and fades, again and again, like a scanner. It is
 * drawn from projected ground points into an SVG just above the map and below the icons,
 * so the map itself doesn't have to redraw every frame (battery) and it stays
 * perspective-correct at any tilt.
 */
export const SCAN_PERIOD_MS = 2400;
/** The ring's opacity at the player; it fades to nothing at the edge of the range. */
export const SCAN_OPACITY = 0.7;

/** How far through one sweep (0 at the player → 1 at the range ring). */
export function scanPhase(nowMs: number, periodMs = SCAN_PERIOD_MS): number {
  return (((nowMs % periodMs) + periodMs) % periodMs) / periodMs;
}

/** The ring's radius (metres) and opacity at a phase. */
export function scanRing(phase: number, rangeM: number): { radiusM: number; opacity: number } {
  // ease out: quick from the player, slowing towards the edge, like a ripple
  const r = 1 - (1 - phase) ** 2;
  // fades mostly near the edge, so the sweep stays visible most of the way out
  return { radiusM: r * rangeM, opacity: SCAN_OPACITY * Math.sqrt(1 - phase) };
}

/** A closed SVG path through screen points. */
export function ringPath(points: { x: number; y: number }[]): string {
  if (points.length < 3) return '';
  return `M${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z`;
}
