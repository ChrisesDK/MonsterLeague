import { latLngToCell } from 'h3-js';

export interface Fix {
  lat: number;
  lng: number;
  /** Accuracy radius in metres. */
  accuracy: number;
  /** Milliseconds since epoch. */
  time: number;
  /** Device-reported speed in m/s, if any. */
  speed?: number | null;
}

/** GDD: ignore fixes worse than 50 m; no spawns above 25 km/h. */
export const MAX_ACCURACY_M = 50;
export const MAX_SPEED_KMH = 25;
/** Speed must drop below this again before spawns come back (hysteresis). */
export const RESUME_SPEED_KMH = 20;
/** GDD v1.9: creatures are drawn up to 200 m away (faint beyond 100 m). */
export const SHOW_RADIUS_M = 200;
export const BATTLE_RADIUS_M = 40;
/** Also fetch a neighbouring res-7 cell when the player is this close to its edge. */
export const EDGE_PREFETCH_M = 350;
export const COARSE_RES = 7;

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Point `meters` away from `p` along `bearingDeg` (0 = north). */
export function offset(p: { lat: number; lng: number }, meters: number, bearingDeg: number) {
  const b = rad(bearingDeg);
  return {
    lat: p.lat + (meters * Math.cos(b)) / 110_540,
    lng: p.lng + (meters * Math.sin(b)) / (111_320 * Math.cos(rad(p.lat))),
  };
}

/** The player's res-7 cell plus any neighbouring res-7 cells within EDGE_PREFETCH_M. */
export function coarseCellsAround(p: { lat: number; lng: number }): string[] {
  const cells = new Set([latLngToCell(p.lat, p.lng, COARSE_RES)]);
  for (let bearing = 0; bearing < 360; bearing += 45) {
    const q = offset(p, EDGE_PREFETCH_M, bearing);
    cells.add(latLngToCell(q.lat, q.lng, COARSE_RES));
  }
  return [...cells];
}

/**
 * Travel speed in km/h from recent good fixes (device speed if reported, else distance over
 * the last ≥ 5 s). Returns null until there is enough data.
 */
export function speedKmh(fixes: readonly Fix[]): number | null {
  const last = fixes[fixes.length - 1];
  if (!last) return null;
  if (typeof last.speed === 'number' && last.speed >= 0) return last.speed * 3.6;
  for (let i = fixes.length - 2; i >= 0; i--) {
    const dt = (last.time - fixes[i]!.time) / 1000;
    if (dt >= 5) return (distanceM(fixes[i]!, last) / dt) * 3.6;
  }
  return null;
}

/** Applies the speed rule with hysteresis: true while the player is too fast for spawns. */
export function tooFast(previous: boolean, kmh: number | null): boolean {
  if (kmh === null) return previous;
  return previous ? kmh > RESUME_SPEED_KMH : kmh > MAX_SPEED_KMH;
}

/**
 * Short GPS dips (a fix of 100 m for a few seconds under trees or between buildings) should
 * not hide the creatures. The last accurate fix stays in play this long.
 */
export const GPS_GRACE_MS = 90_000;

/** The position to play with: the newest accurate fix, kept through short weak spells. */
export function playableFix(latest: Fix | null, lastGood: Fix | null, nowMs: number): Fix | null {
  if (latest && latest.accuracy <= MAX_ACCURACY_M) return latest;
  if (lastGood && nowMs - lastGood.time <= GPS_GRACE_MS) return lastGood;
  return null;
}

/** How quickly the player figure glides to a new fix (time constant, seconds). */
export const GLIDE_SECONDS = 0.45;
/** Jumps longer than this (a first fix, a teleport) are not animated. */
export const GLIDE_SNAP_M = 300;

/**
 * One animation step of the shown player position towards the newest fix: exponential
 * easing, so a GPS correction slides into place instead of jumping (owner request).
 */
export function glideStep(
  shown: { lat: number; lng: number } | null,
  target: { lat: number; lng: number },
  dtSeconds: number,
): { lat: number; lng: number } {
  if (!shown || distanceM(shown, target) > GLIDE_SNAP_M) return target;
  const k = 1 - Math.exp(-Math.max(0, dtSeconds) / GLIDE_SECONDS);
  const next = {
    lat: shown.lat + (target.lat - shown.lat) * k,
    lng: shown.lng + (target.lng - shown.lng) * k,
  };
  return distanceM(next, target) < 0.05 ? target : next;
}
