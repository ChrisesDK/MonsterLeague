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
export const SHOW_RADIUS_M = 100;
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
