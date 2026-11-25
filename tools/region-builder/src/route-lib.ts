/** Pure helpers for the route builder (tested in test/routes.test.ts). */
import { FLAG } from './config';

export type LngLat = [number, number];

/**
 * Routes between zones (GDD P22): numbered along the badge path first (main), then other ways
 * between the same places (alt) and routes to destinations (explore). `via` are waypoints
 * ([lng, lat]) the path must pass, e.g. a park or a river crossing.
 */
export const ROUTES: readonly {
  number: number;
  from: string;
  to: string;
  kind: 'main' | 'alt' | 'explore';
  via: LngLat[];
}[] = [
  { number: 1, from: 'centrum', to: 'naesbyhoved', kind: 'main', via: [] },
  { number: 2, from: 'naesbyhoved', to: 'havnen', kind: 'main', via: [] },
  { number: 3, from: 'havnen', to: 'strandskov', kind: 'main', via: [] },
  { number: 4, from: 'strandskov', to: 'stige', kind: 'main', via: [] },
  { number: 5, from: 'strandskov', to: 'hindemosen', kind: 'main', via: [] },
  { number: 6, from: 'hindemosen', to: 'hcaskoven', kind: 'main', via: [[10.4345, 55.4111]] },
  { number: 7, from: 'hcaskoven', to: 'lungsgrave', kind: 'main', via: [] },
  { number: 8, from: 'lungsgrave', to: 'botanisk', kind: 'main', via: [] },
  { number: 9, from: 'botanisk', to: 'oerbaek', kind: 'main', via: [] },
  { number: 10, from: 'oerbaek', to: 'faellesskov', kind: 'main', via: [] },
  { number: 11, from: 'faellesskov', to: 'hollufgaard', kind: 'main', via: [[10.435, 55.356]] },
  { number: 12, from: 'hollufgaard', to: 'hjallese', kind: 'main', via: [[10.43, 55.352]] },
  { number: 13, from: 'hjallese', to: 'fynskelandsby', kind: 'main', via: [[10.4056, 55.36475]] },
  { number: 14, from: 'fynskelandsby', to: 'zoo', kind: 'main', via: [[10.378, 55.3713]] },
  { number: 15, from: 'zoo', to: 'tusindaar', kind: 'main', via: [] },
  { number: 16, from: 'centrum', to: 'havnen', kind: 'alt', via: [] },
  { number: 17, from: 'havnen', to: 'sktjoergen', kind: 'alt', via: [] },
  { number: 18, from: 'sktjoergen', to: 'botanisk', kind: 'alt', via: [] },
  { number: 19, from: 'centrum', to: 'sktjoergen', kind: 'alt', via: [[10.4038, 55.3953]] },
  { number: 20, from: 'centrum', to: 'munkemose', kind: 'alt', via: [] },
  { number: 21, from: 'munkemose', to: 'zoo', kind: 'alt', via: [] },
  { number: 22, from: 'centrum', to: 'bolbro', kind: 'alt', via: [] },
  { number: 23, from: 'bolbro', to: 'tusindaar', kind: 'alt', via: [[10.3536, 55.3907]] },
  { number: 24, from: 'hindemosen', to: 'seden', kind: 'alt', via: [] },
  { number: 25, from: 'seden', to: 'hcaskoven', kind: 'alt', via: [] },
  { number: 26, from: 'naesbyhoved', to: 'maylandskoven', kind: 'explore', via: [] },
  { number: 27, from: 'maylandskoven', to: 'stavis', kind: 'explore', via: [] },
  { number: 28, from: 'bolbro', to: 'stavis', kind: 'explore', via: [] },
  { number: 29, from: 'stavis', to: 'odins', kind: 'explore', via: [] },
  { number: 30, from: 'odins', to: 'kirkendrup', kind: 'explore', via: [] },
  { number: 31, from: 'kirkendrup', to: 'lumby', kind: 'explore', via: [] },
  { number: 32, from: 'odins', to: 'korup', kind: 'explore', via: [[10.3025, 55.4164]] },
  { number: 33, from: 'korup', to: 'holeskov', kind: 'explore', via: [] },
  { number: 34, from: 'tusindaar', to: 'sanderum', kind: 'explore', via: [] },
  { number: 35, from: 'tusindaar', to: 'elmelund', kind: 'explore', via: [] },
  { number: 36, from: 'elmelund', to: 'sanderum', kind: 'explore', via: [] },
  { number: 37, from: 'elmelund', to: 'hesbjerg', kind: 'explore', via: [[10.255, 55.378]] },
  { number: 38, from: 'hesbjerg', to: 'braendekilde', kind: 'explore', via: [] },
  { number: 39, from: 'sanderum', to: 'bellinge', kind: 'explore', via: [] },
  { number: 40, from: 'bellinge', to: 'braendekilde', kind: 'explore', via: [] },
  { number: 41, from: 'bellinge', to: 'stenloese', kind: 'explore', via: [[10.3493, 55.3401]] },
  { number: 42, from: 'fynskelandsby', to: 'stenloese', kind: 'explore', via: [] },
  { number: 43, from: 'hollufgaard', to: 'hoejby', kind: 'explore', via: [] },
  { number: 44, from: 'hoejby', to: 'hjallese', kind: 'explore', via: [] },
  { number: 45, from: 'oerbaek', to: 'kohave', kind: 'explore', via: [] },
  { number: 46, from: 'hcaskoven', to: 'raeveskov', kind: 'explore', via: [] },
  { number: 47, from: 'hollufgaard', to: 'fraugde', kind: 'explore', via: [] },
  { number: 48, from: 'kohave', to: 'fraugde', kind: 'explore', via: [[10.4947, 55.3648]] },
  { number: 49, from: 'fraugde', to: 'romantiskehave', kind: 'explore', via: [] },
  { number: 50, from: 'romantiskehave', to: 'tarupdavinde', kind: 'explore', via: [] },
];

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
