/**
 * Journal (M2d, GDD "Journal"): data-driven goals. Pure: progress lives in the save, goals
 * are derived from content (POIs, routes, arena sites, side goals) and the save.
 *
 * Main goal chain per district: reach the district → walk its route (the live route that
 * ends at its arena) → beat its trainers → visit one of its rest stops → challenge its arena.
 * Steps that have no content yet (no trainers, no arena POI) are left out or marked
 * "coming soon". Steps can be completed in any order; the current goal is the first open
 * step of the next arena's district.
 *
 * Side goals (content/goals.json) are finite and never daily: explore the district's wild
 * areas, catch a creature of its typical type, meet its rare creature.
 */
import { content, type Dex, type Route, type SideGoal, type TypeId } from '@oml/data';
import { isDistrictUnlocked } from './rules';
import type { JournalProgress, SaveGame } from './save';
import { distanceM, type LatLng } from './world';

/** Route checkpoints every 100 m; one counts as reached within 30 m. */
export const CHECKPOINT_SPACING_M = 100;
export const CHECKPOINT_RADIUS_M = 30;
/** A route counts as walked when this share of its checkpoints was reached. */
export const ROUTE_DONE_SHARE = 0.8;

export const emptyJournal = (): JournalProgress => ({
  reached: [],
  routes: {},
  wildMetres: {},
  restStops: [],
});

const checkpointCache = new WeakMap<Route, LatLng[]>();
/** Points every CHECKPOINT_SPACING_M along a route, including both ends. */
export function routeCheckpoints(route: Route): LatLng[] {
  const cached = checkpointCache.get(route);
  if (cached) return cached;
  const pts = route.path.map(([lng, lat]) => ({ lat, lng }));
  const out: LatLng[] = [pts[0]!];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const d = distanceM(a, b);
    let at = CHECKPOINT_SPACING_M - carry;
    while (at <= d) {
      const t = at / d;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
      at += CHECKPOINT_SPACING_M;
    }
    carry = (carry + d) % CHECKPOINT_SPACING_M;
  }
  const end = pts[pts.length - 1]!;
  if (distanceM(out[out.length - 1]!, end) > CHECKPOINT_SPACING_M / 4) out.push(end);
  checkpointCache.set(route, out);
  return out;
}

/** The live route that leads to district `d`'s arena (null for district 1). */
export function routeInto(d: number, dex: Dex = content): Route | null {
  return Object.values(dex.routes).find((r) => !r.draft && r.to === d) ?? null;
}

export type GoalKind =
  'reach' | 'route' | 'trainers' | 'rest' | 'arena' | 'exploreWild' | 'catchType' | 'findRare';

export interface Goal {
  id: string;
  kind: GoalKind;
  district: number;
  main: boolean;
  done: boolean;
  /** n of `of` (trainers, metres) or route checkpoints. */
  progress: { n: number; of: number } | null;
  /** Where the direction arrow points (null = no single place). */
  target: LatLng | null;
  routeId?: string;
  arena?: number;
  type?: TypeId;
  species?: string;
  /** The arena is not built yet (its POI comes in a later milestone). */
  comingSoon?: boolean;
}

export interface DistrictGoals {
  district: number;
  main: Goal[];
  side: Goal[];
}

export interface Journal {
  /** The one goal shown on the map (null when every arena is won). */
  current: Goal | null;
  districts: DistrictGoals[];
  completed: Goal[];
}

/** The district of the next arena to win (null when all 8 are won). */
export function nextArenaDistrict(save: SaveGame): number | null {
  for (let d = 1; d <= 8; d++) if (!save.badges.includes(d)) return d;
  return null;
}

/** The nearest point as a plain position (POIs carry more fields). */
function nearest(from: LatLng | null, points: LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  const p = !from
    ? points[0]!
    : points.reduce((a, b) => (distanceM(from, a) <= distanceM(from, b) ? a : b));
  return { lat: p.lat, lng: p.lng };
}

/** Main goals of one district. */
export function mainGoals(
  save: SaveGame,
  d: number,
  from: LatLng | null,
  dex: Dex = content,
): Goal[] {
  const j = save.journal;
  const site = dex.arenaSites[d - 1]!;
  const sitePos = { lat: site.lat, lng: site.lng };
  const pois = Object.values(dex.pois).filter((p) => p.district === d);
  const goals: Goal[] = [];
  const base = { district: d, main: true };

  goals.push({
    ...base,
    id: `d${d}.reach`,
    kind: 'reach',
    done: j.reached.includes(d),
    progress: null,
    target: sitePos,
  });

  const route = routeInto(d, dex);
  if (route) {
    const cps = routeCheckpoints(route);
    const got = new Set(j.routes[route.id] ?? []);
    const furthest = Math.max(-1, ...got);
    const next = cps.findIndex((_, i) => i > furthest && !got.has(i));
    const open = cps.filter((_, i) => !got.has(i));
    goals.push({
      ...base,
      id: `d${d}.route`,
      kind: 'route',
      routeId: route.id,
      done: got.size >= Math.ceil(cps.length * ROUTE_DONE_SHARE),
      progress: { n: got.size, of: cps.length },
      target: next >= 0 ? cps[next]! : nearest(from, open),
    });
  }

  const trainers = pois.filter((p) => p.kind === 'trainer');
  if (trainers.length > 0) {
    const left = trainers.filter(
      (p) => p.kind === 'trainer' && !save.defeatedTrainers.includes(p.trainer),
    );
    goals.push({
      ...base,
      id: `d${d}.trainers`,
      kind: 'trainers',
      done: left.length === 0,
      progress: { n: trainers.length - left.length, of: trainers.length },
      target: nearest(from, left),
    });
  }

  const rests = pois.filter((p) => p.kind === 'restStop');
  if (rests.length > 0) {
    goals.push({
      ...base,
      id: `d${d}.rest`,
      kind: 'rest',
      done: rests.some((p) => j.restStops.includes(p.id)),
      progress: null,
      target: nearest(from, rests),
    });
  }

  const arenaPoi = site.poi ? dex.pois[site.poi] : undefined;
  goals.push({
    ...base,
    id: `d${d}.arena`,
    kind: 'arena',
    arena: d,
    done: save.badges.includes(d),
    progress: null,
    target: arenaPoi ? { lat: arenaPoi.lat, lng: arenaPoi.lng } : sitePos,
    ...(arenaPoi ? {} : { comingSoon: true }),
  });
  return goals;
}

/** Largest exploreWild target per district (progress is capped there). */
export function wildMetresGoal(d: number, dex: Dex = content): number {
  return Math.max(
    0,
    ...dex.sideGoals
      .filter((g) => g.district === d && g.kind === 'exploreWild')
      .map((g) => (g.kind === 'exploreWild' ? g.metres : 0)),
  );
}

export function sideGoal(save: SaveGame, g: SideGoal, dex: Dex = content): Goal {
  const base = { id: g.id, district: g.district, main: false, target: null };
  if (g.kind === 'exploreWild') {
    const n = Math.min(g.metres, Math.floor(save.journal.wildMetres[String(g.district)] ?? 0));
    return { ...base, kind: g.kind, done: n >= g.metres, progress: { n, of: g.metres } };
  }
  if (g.kind === 'catchType') {
    const done = Object.entries(save.caught).some(
      ([sp, ds]) => ds.includes(g.district) && !!dex.species[sp]?.types.includes(g.type),
    );
    return { ...base, kind: g.kind, type: g.type, done, progress: null };
  }
  const done = !!save.seen[g.species]?.includes(g.district);
  return { ...base, kind: g.kind, species: g.species, done, progress: null };
}

/** The whole Journal for the save, with arrows measured from `from`. */
export function journal(save: SaveGame, from: LatLng | null, dex: Dex = content): Journal {
  const districts: DistrictGoals[] = [];
  for (let d = 1; d <= 8; d++) {
    if (!isDistrictUnlocked(save.badges, d) && !save.journal.reached.includes(d)) continue;
    districts.push({
      district: d,
      main: isDistrictUnlocked(save.badges, d) ? mainGoals(save, d, from, dex) : [],
      side: dex.sideGoals.filter((g) => g.district === d).map((g) => sideGoal(save, g, dex)),
    });
  }
  const next = nextArenaDistrict(save);
  const current =
    next === null
      ? null
      : (districts.find((x) => x.district === next)?.main.find((g) => !g.done) ?? null);
  const completed = districts.flatMap((x) => [...x.main, ...x.side]).filter((g) => g.done);
  return { current, districts, completed };
}

// ---------------------------------------------------------------------------
// Recording progress (pure; each returns the same object when nothing changed)

/** The player is in `district` now. */
export function noteDistrict(save: SaveGame, district: number | null): SaveGame {
  if (district === null || save.journal.reached.includes(district)) return save;
  return {
    ...save,
    journal: {
      ...save.journal,
      reached: [...save.journal.reached, district].sort((a, b) => a - b),
    },
  };
}

/** Route checkpoints within reach of `pos` (live routes only). */
export function noteRoutes(save: SaveGame, pos: LatLng, dex: Dex = content): SaveGame {
  let routes = save.journal.routes;
  for (const r of Object.values(dex.routes)) {
    if (r.draft) continue;
    const have = routes[r.id] ?? [];
    const add = routeCheckpoints(r)
      .map((cp, i) => (distanceM(pos, cp) <= CHECKPOINT_RADIUS_M && !have.includes(i) ? i : -1))
      .filter((i) => i >= 0);
    if (add.length > 0) routes = { ...routes, [r.id]: [...have, ...add].sort((a, b) => a - b) };
  }
  return routes === save.journal.routes ? save : { ...save, journal: { ...save.journal, routes } };
}

/** Metres walked inside a wild area of `district` (capped at the district's explore goal). */
export function noteWildWalk(
  save: SaveGame,
  district: number,
  metres: number,
  dex: Dex = content,
): SaveGame {
  const cap = wildMetresGoal(district, dex);
  const key = String(district);
  const cur = save.journal.wildMetres[key] ?? 0;
  const next = Math.min(cap, Math.round(cur + metres));
  if (metres <= 0 || next === cur) return save;
  return {
    ...save,
    journal: { ...save.journal, wildMetres: { ...save.journal.wildMetres, [key]: next } },
  };
}

export function noteRestStop(save: SaveGame, poiId: string): SaveGame {
  if (save.journal.restStops.includes(poiId)) return save;
  return {
    ...save,
    journal: { ...save.journal, restStops: [...save.journal.restStops, poiId].sort() },
  };
}
