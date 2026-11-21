/** Pure helpers for the route builder (tested in test/routes.test.ts). */
import { FLAG } from './config';

export type LngLat = [number, number];

/** Routes between consecutive arenas (GDD v1.9: 1→2→3→4 now; 4→8 drafts). */
export const ROUTES = [
  { number: 1, from: 1, to: 2, draft: false },
  { number: 2, from: 2, to: 3, draft: false },
  { number: 3, from: 3, to: 4, draft: false },
  { number: 4, from: 4, to: 5, draft: true },
  { number: 5, from: 5, to: 6, draft: true },
  { number: 6, from: 6, to: 7, draft: true },
  { number: 7, from: 7, to: 8, draft: true },
] as const;

/**
 * Cost per metre of an OSM way for walking routes, or null when it can't be walked.
 * Footpaths and park paths are cheapest; streets cost more the busier they are; steps are
 * avoided (not step-free). Motorways, trunk roads and railways are never in the network.
 */
export function edgeFactor(tags: Record<string, string | undefined>): number | null {
  const hw = tags.highway ?? '';
  if (/^(motorway|trunk)/.test(hw) || tags.railway) return null;
  if (tags.foot === 'no') return null;
  const footOk = ['yes', 'designated', 'permissive'].includes(tags.foot ?? '');
  if ((tags.access === 'no' || tags.access === 'private') && !footOk) return null;
  if (tags.area === 'yes' && hw !== 'pedestrian') return null;
  switch (hw) {
    case 'footway':
      return tags.footway === 'sidewalk' ? 1.3 : 1.0;
    case 'path':
    case 'pedestrian':
    case 'track':
    case 'bridleway':
      return 1.0;
    case 'cycleway':
      return footOk ? 1.0 : 1.5;
    case 'steps':
      return 4;
    case 'living_street':
      return 1.15;
    case 'residential':
    case 'service':
    case 'unclassified':
      return tags.service === 'parking_aisle' ? 2 : 1.4;
    case 'tertiary':
    case 'tertiary_link':
      return 1.8;
    case 'secondary':
    case 'secondary_link':
      return 2.2;
    case 'primary':
    case 'primary_link':
      return 2.8;
    default:
      return null;
  }
}

const M_LAT = 110_540;
const mLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);
export const distM = (a: LngLat, b: LngLat) =>
  Math.hypot((a[1] - b[1]) * M_LAT, (a[0] - b[0]) * mLng(a[1]));

/** Distance in metres from p to segment a–b (local flat projection). */
export function segmentDistM(p: LngLat, a: LngLat, b: LngLat): number {
  const k = mLng(p[1]);
  const ax = (a[0] - p[0]) * k;
  const ay = (a[1] - p[1]) * M_LAT;
  const bx = (b[0] - p[0]) * k;
  const by = (b[1] - p[1]) * M_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Douglas–Peucker simplification with a tolerance in metres. */
export function simplify(path: LngLat[], tolM: number): LngLat[] {
  if (path.length <= 2) return path;
  let worst = 0;
  let at = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const d = segmentDistM(path[i]!, path[0]!, path[path.length - 1]!);
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= tolM) return [path[0]!, path[path.length - 1]!];
  const left = simplify(path.slice(0, at + 1), tolM);
  return [...left.slice(0, -1), ...simplify(path.slice(at), tolM)];
}

/** Points every `stepM` metres along a path (including both ends). */
export function samplePath(path: LngLat[], stepM: number): LngLat[] {
  const out: LngLat[] = [path[0]!];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const d = distM(a, b);
    const n = Math.max(1, Math.ceil(d / stepM));
    for (let k = 1; k <= n; k++)
      out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** Length, wild share and districts crossed, from 5 m samples. */
export function routeMetrics(
  path: LngLat[],
  info: (p: LngLat) => { district: number; flags: number } | null,
): { lengthM: number; wildShare: number; districts: Set<number> } {
  let lengthM = 0;
  for (let i = 1; i < path.length; i++) lengthM += distM(path[i - 1]!, path[i]!);
  const samples = samplePath(path, 5);
  let wild = 0;
  const districts = new Set<number>();
  for (const p of samples) {
    const c = info(p);
    if (!c) continue;
    districts.add(c.district);
    if (c.flags & FLAG.wild) wild++;
  }
  return { lengthM, wildShare: samples.length ? wild / samples.length : 0, districts };
}
