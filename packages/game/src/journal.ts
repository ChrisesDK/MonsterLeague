/**
 * Journal (M2d, GDD "Journal", P22): data-driven goals. Pure: progress lives in the save,
 * goals are derived from content (zones, routes, POIs, arena sites, side goals) and the save.
 *
 * Routes fill in like a progress bar: each has a checkpoint every 25 m, reached within 30 m,
 * and a route is finished at 90 %. A finished route opens the zones at both its ends as soon
 * as one of them is open (so a route walked "from the wrong side" pays off later).
 *
 * Main goal chain per arena: open the arena's zone (walk the next route toward it) → beat
 * the district's trainers → visit one of its rest stops → challenge the arena. Steps that
 * have no content yet (no trainers, no arena POI) are left out or marked "coming soon".
 * Steps can be completed in any order; the current goal is the first open step of the next
 * arena.
 *
 * Side goals (content/goals.json) are finite and never daily: explore the district's wild
 * areas, catch a creature of its typical type, meet its rare creature.
 */
import { content, type Dex, type Route, type SideGoal, type TypeId } from '@oml/data';
import { isDistrictOpen, isZoneOpen } from './rules';
import type { JournalProgress, SaveGame } from './save';
import { distanceM, type LatLng } from './world';

/** Route checkpoints every 25 m (the progress bar's steps); one counts as reached within 30 m. */
export const CHECKPOINT_SPACING_M = 25;
export const CHECKPOINT_RADIUS_M = 30;
/** A route counts as finished when this share of its checkpoints was reached (GPS gaps). */
export const ROUTE_DONE_SHARE = 0.9;

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

/** Route progress: checkpoints reached of all, and whether the route is finished. */
export function routeProgress(
  save: Pick<SaveGame, 'journal'>,
  route: Route,
): { n: number; of: number; done: boolean } {
  const of = routeCheckpoints(route).length;
  const n = Math.min(of, save.journal.routes[route.id]?.length ?? 0);
  return { n, of, done: n >= Math.ceil(of * ROUTE_DONE_SHARE) };
}

/**
 * Opens the zones that finished routes lead to: a finished route with one open end opens the
 * other end, repeated until nothing changes. Same object when nothing opened.
 */
export function openZones(save: SaveGame, dex: Dex = content): SaveGame {
  const open = new Set(save.zones);
  const isOpen = (z: string) => open.has(z) || dex.zones[z]?.start === true;
  const done = Object.values(dex.routes).filter((r) => routeProgress(save, r).done);
  for (let changed = true; changed;) {
    changed = false;
    for (const r of done) {
      if (isOpen(r.from) === isOpen(r.to)) continue;
      open.add(isOpen(r.from) ? r.to : r.from);
      changed = true;
    }
  }
  if (open.size === save.zones.length) return save;
  return { ...save, zones: [...open].sort() };
}

/** Routes with exactly one end open: the ones that open a new zone when finished. */
export function frontierRoutes(save: SaveGame, dex: Dex = content): Route[] {
  return Object.values(dex.routes).filter(
    (r) => isZoneOpen(save, r.from, dex) !== isZoneOpen(save, r.to, dex),
  );
}

/**
 * The next route to walk toward `zone`: the first unfinished route on the shortest way from
 * the open zones, measured in metres still to walk (null when the zone is open already).
 */
export function nextRouteToward(save: SaveGame, zone: string, dex: Dex = content): Route | null {
  if (isZoneOpen(save, zone, dex)) return null;
  const left = (r: Route) => {
    const p = routeProgress(save, r);
    return p.done ? 0 : r.lengthM * (1 - p.n / p.of);
  };
  const dist = new Map<string, number>();
  const via = new Map<string, Route>();
  for (const z of Object.values(dex.zones)) if (isZoneOpen(save, z.id, dex)) dist.set(z.id, 0);
  const done = new Set<string>();
  for (;;) {
    let u: string | null = null;
    for (const [k, d] of dist) if (!done.has(k) && (u === null || d < dist.get(u)!)) u = k;
    if (u === null || u === zone) break;
    done.add(u);
    for (const r of Object.values(dex.routes)) {
      if (r.from !== u && r.to !== u) continue;
      const v = r.from === u ? r.to : r.from;
      const d = dist.get(u)! + left(r);
      if (d < (dist.get(v) ?? Infinity)) {
        dist.set(v, d);
        via.set(v, r);
      }
    }
  }
  // Walk back to the open side: the route leaving an open zone is the one to walk now.
  let route: Route | null = null;
  for (let z = zone; via.has(z);) {
    const r = via.get(z)!;
    route = r;
    const prev = r.from === z ? r.to : r.from;
    if (isZoneOpen(save, prev, dex)) break;
    z = prev;
  }
  return route;
}

/** The next checkpoint to walk to on `route`, starting from its open end. */
export function nextCheckpoint(save: SaveGame, route: Route, dex: Dex = content): LatLng | null {
  const cps = routeCheckpoints(route);
  const got = new Set(save.journal.routes[route.id] ?? []);
  const order = cps.map((_, i) => i);
  if (!isZoneOpen(save, route.from, dex) && isZoneOpen(save, route.to, dex)) order.reverse();
  const i = order.find((k) => !got.has(k));
  return i === undefined ? null : cps[i]!;
}

export type GoalKind =
  'route' | 'trainers' | 'rest' | 'arena' | 'exploreWild' | 'catchType' | 'findRare';

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
  /** The zone a route goal opens. */
  zone?: string;
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
  /** Region progress (P22): finished routes and open zones (start zone included). */
  routesDone: number;
  routesTotal: number;
  zonesOpen: number;
  zonesTotal: number;
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

/** Main goals of one arena's district (P22). */
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

  if (!dex.zones[site.zone]?.start) {
    const route = nextRouteToward(save, site.zone, dex);
    const open = isZoneOpen(save, site.zone, dex);
    const p = route ? routeProgress(save, route) : null;
    goals.push({
      ...base,
      id: `d${d}.route`,
      kind: 'route',
      zone: site.zone,
      ...(route ? { routeId: route.id } : {}),
      done: open,
      progress: p ? { n: p.n, of: p.of } : null,
      target: route ? (nextCheckpoint(save, route, dex) ?? sitePos) : sitePos,
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
  const next = nextArenaDistrict(save);
  for (let d = 1; d <= 8; d++) {
    const open = isDistrictOpen(save, d, dex);
    if (!open && d !== next && !save.journal.reached.includes(d)) continue;
    districts.push({
      district: d,
      main: open || d === next ? mainGoals(save, d, from, dex) : [],
      side: dex.sideGoals.filter((g) => g.district === d).map((g) => sideGoal(save, g, dex)),
    });
  }
  const current =
    next === null
      ? null
      : (districts.find((x) => x.district === next)?.main.find((g) => !g.done) ?? null);
  const completed = districts.flatMap((x) => [...x.main, ...x.side]).filter((g) => g.done);
  const routes = Object.values(dex.routes);
  const zones = Object.values(dex.zones);
  return {
    current,
    districts,
    completed,
    routesDone: routes.filter((r) => routeProgress(save, r).done).length,
    routesTotal: routes.length,
    zonesOpen: zones.filter((z) => isZoneOpen(save, z.id, dex)).length,
    zonesTotal: zones.length,
  };
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

const boxCache = new WeakMap<Route, [number, number, number, number]>();
/** A route's bounding box [minLat, minLng, maxLat, maxLng] (cheap "near this route?" test). */
function routeBox(r: Route): [number, number, number, number] {
  let b = boxCache.get(r);
  if (!b) {
    const lats = r.path.map((p) => p[1]);
    const lngs = r.path.map((p) => p[0]);
    b = [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)];
    boxCache.set(r, b);
  }
  return b;
}

/**
 * Route checkpoints within reach of `pos` (every route, P22), then the zones finished routes
 * open. Same object when nothing changed.
 */
export function noteRoutes(save: SaveGame, pos: LatLng, dex: Dex = content): SaveGame {
  let routes = save.journal.routes;
  const dLat = CHECKPOINT_RADIUS_M / 110_540;
  const dLng = CHECKPOINT_RADIUS_M / (111_320 * Math.cos((pos.lat * Math.PI) / 180));
  for (const r of Object.values(dex.routes)) {
    const [s, w, n, e] = routeBox(r);
    if (pos.lat < s - dLat || pos.lat > n + dLat || pos.lng < w - dLng || pos.lng > e + dLng)
      continue;
    const have = routes[r.id] ?? [];
    const add = routeCheckpoints(r)
      .map((cp, i) => (distanceM(pos, cp) <= CHECKPOINT_RADIUS_M && !have.includes(i) ? i : -1))
      .filter((i) => i >= 0);
    if (add.length > 0) routes = { ...routes, [r.id]: [...have, ...add].sort((a, b) => a - b) };
  }
  if (routes === save.journal.routes) return save;
  return openZones({ ...save, journal: { ...save.journal, routes } }, dex);
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
