/**
 * Route builder (GDD P22): numbered walking routes between zones, found by a shortest-path
 * search over the OSM foot network (no routing service) through each route's waypoints.
 * The cost favours footpaths, park paths, wild areas and the river path, and avoids busy
 * roads, steps and no-spawn areas (railways, schools, …). Arena zones start and end at the
 * arena site, other zones at their centre. Writes packages/data/content/odense/routes.json.
 *
 *   pnpm routes:build            (uses the Overpass cache in tools/region-builder/cache)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { latLngToCell } from 'h3-js';
import {
  ArenasFileSchema,
  RegionFileSchema,
  RoutesFileSchema,
  ZonesFileSchema,
  type Route,
} from '@oml/data';
import { FLAG, REGION, wildFlags } from './config';
import { buildFootQuery, fetchOverpassTiled } from './overpass';
import {
  ROUTES,
  edgeFactor,
  routeMetrics,
  samplePath,
  segmentDistM,
  simplify,
  type LngLat,
} from './route-lib';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const cacheDir = fileURLToPath(new URL('../cache', import.meta.url));
const OUT = root('packages/data/content/odense/routes.json');

const region = RegionFileSchema.parse(
  JSON.parse(readFileSync(root('packages/data/region/odense/region.json'), 'utf8')),
);
const arenas = ArenasFileSchema.parse(
  JSON.parse(readFileSync(root('packages/data/content/odense/arenas.json'), 'utf8')),
).arenas;

const zones = ZonesFileSchema.parse(
  JSON.parse(readFileSync(root('packages/data/content/odense/zones.json'), 'utf8')),
).zones;

/** District and flags of a position's region cell (null outside the region). */
function cellInfo(p: LngLat): { district: number; flags: number } | null {
  const row = region.cells[latLngToCell(p[1], p[0], 10)];
  if (!row) return null;
  const shares = Object.fromEntries(region.biomes.map((b, i) => [b, row[3 + i]!]));
  return { district: row[0]!, flags: (row[2]! & FLAG.noSpawn) | wildFlags(shares) };
}

/** Where a route starts or ends in a zone: the arena site, or the zone's centre. */
function anchor(zoneId: string): LngLat {
  const z = zones.find((x) => x.id === zoneId);
  if (!z) throw new Error(`unknown zone ${zoneId}`);
  const site = z.arena ? arenas.find((a) => a.arena === z.arena) : undefined;
  return site ? [site.lng, site.lat] : [z.lng, z.lat];
}

/** Railway and motorway/trunk lines (written by the region build), bucketed on a coarse grid. */
const hazardGrid = new Map<string, [LngLat, LngLat][]>();
const gridKey = (p: LngLat) => `${Math.floor(p[0] / 0.002)},${Math.floor(p[1] / 0.001)}`;
for (const line of (
  JSON.parse(readFileSync(root('packages/data/region/odense/hazards.json'), 'utf8')) as {
    lines: { coords: LngLat[] }[];
  }
).lines)
  for (let i = 1; i < line.coords.length; i++) {
    const seg: [LngLat, LngLat] = [line.coords[i - 1]!, line.coords[i]!];
    for (const p of samplePath(seg, 20)) {
      const k = gridKey(p);
      const list = hazardGrid.get(k) ?? [];
      if (!list.includes(seg)) list.push(seg);
      hazardGrid.set(k, list);
    }
  }
function nearHazard(p: LngLat): boolean {
  const [gx, gy] = gridKey(p).split(',').map(Number) as [number, number];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (const [a, b] of hazardGrid.get(`${gx + dx},${gy + dy}`) ?? [])
        if (segmentDistM(p, a, b) < 12) return true;
  return false;
}

interface Osm {
  elements: (
    | { type: 'node'; id: number; lat: number; lon: number }
    | { type: 'way'; id: number; nodes: number[]; tags: Record<string, string> }
  )[];
}
const osm = (await fetchOverpassTiled(
  buildFootQuery,
  REGION.bbox,
  REGION.tiles[0],
  REGION.tiles[1],
  cacheDir,
)) as unknown as Osm;
const coords = new Map<number, LngLat>();
for (const e of osm.elements) if (e.type === 'node') coords.set(e.id, [e.lon, e.lat]);

const M_LAT = 110_540;
const mLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);
const dist = (a: LngLat, b: LngLat) =>
  Math.hypot((a[1] - b[1]) * M_LAT, (a[0] - b[0]) * mLng(a[1]));

interface Edge {
  to: number;
  length: number;
  cost: number;
  /** Every district the edge passes through (sampled every 5 m). */
  districts: number[];
}
const graph = new Map<number, Edge[]>();
let ways = 0;
for (const e of osm.elements) {
  if (e.type !== 'way') continue;
  const base = edgeFactor(e.tags);
  if (base === null) continue;
  ways++;
  for (let i = 1; i < e.nodes.length; i++) {
    const a = coords.get(e.nodes[i - 1]!);
    const b = coords.get(e.nodes[i]!);
    if (!a || !b) continue;
    const mid: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const infos = samplePath([a, b], 5).map(cellInfo);
    // Paths outside the region's cells (the causeway to Stige Ø, a bridge, the border) may
    // be used at an extra cost, so routes stay inside where they can (validate allows 400 m).
    const cm = cellInfo(mid);
    const inside = infos.filter((x) => x !== null);
    const ds = [...new Set(inside.map((x) => x!.district))];
    let f = base * (inside.length === 0 ? 3 : inside.length < infos.length ? 1.5 : 1);
    // Running along a railway or motorway is avoided (crossing one stays possible).
    if (nearHazard(mid)) f *= 12;
    // Mild preferences only: stronger ones made routes 1.5–3× the straight distance.
    const flags = cm?.flags ?? 0;
    if (flags & FLAG.noSpawn) f *= 1.6;
    else if (flags & FLAG.waterEdge) f *= 0.8;
    else if (flags & FLAG.wild) f *= 0.85;
    const length = dist(a, b);
    for (const [x, y] of [
      [e.nodes[i - 1]!, e.nodes[i]!],
      [e.nodes[i]!, e.nodes[i - 1]!],
    ] as const) {
      const list = graph.get(x) ?? [];
      list.push({ to: y, length, cost: length * f, districts: ds });
      graph.set(x, list);
    }
  }
}
console.log(`Foot network: ${ways} ways, ${graph.size} nodes`);

/** The largest connected part of the network: routes never start on a cut-off path piece. */
const main = new Set<number>();
{
  const seen = new Set<number>();
  for (const start of graph.keys()) {
    if (seen.has(start)) continue;
    const part = [start];
    seen.add(start);
    for (let i = 0; i < part.length; i++)
      for (const e of graph.get(part[i]!) ?? [])
        if (!seen.has(e.to)) {
          seen.add(e.to);
          part.push(e.to);
        }
    if (part.length > main.size) {
      main.clear();
      for (const n of part) main.add(n);
    }
  }
  console.log(`Main network: ${main.size} of ${graph.size} nodes`);
}

/** Dijkstra with a binary heap, restricted to edges inside `allowed` districts. */
function shortest(
  start: number,
  allowed: Set<number> | null,
): Map<number, { cost: number; prev: number }> {
  const best = new Map<number, { cost: number; prev: number }>([[start, { cost: 0, prev: -1 }]]);
  const heap: [number, number][] = [[0, start]];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= heap[i]![0]) break;
      [heap[p], heap[i]] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [c, n] = pop();
    if (c > (best.get(n)?.cost ?? Infinity)) continue;
    for (const e of graph.get(n) ?? []) {
      if (allowed && !e.districts.every((d) => allowed.has(d))) continue;
      const nc = c + e.cost;
      if (nc < (best.get(e.to)?.cost ?? Infinity)) {
        best.set(e.to, { cost: nc, prev: n });
        push([nc, e.to]);
      }
    }
  }
  return best;
}

/** Graph nodes sorted by distance to `p`, inside `allowed` districts. */
function nearestNodes(p: LngLat, allowed: Set<number> | null, n: number): number[] {
  const out: [number, number][] = [];
  for (const id of main) {
    const c = coords.get(id)!;
    const d = dist(c, p);
    if (d > 900) continue;
    const info = cellInfo(c);
    if (!info || (allowed && !allowed.has(info.district))) continue;
    out.push([d, id]);
  }
  return out
    .sort((a, b) => a[0] - b[0])
    .slice(0, n)
    .map(([, id]) => id);
}

const routes: Route[] = [];
for (const def of ROUTES) {
  const points = [anchor(def.from), ...def.via, anchor(def.to)];
  const path: LngLat[] = [];
  for (let i = 1; i < points.length; i++) {
    const starts = nearestNodes(points[i - 1]!, null, 5);
    const ends = new Set(nearestNodes(points[i]!, null, 5));
    let leg: LngLat[] | null = null;
    for (const s of starts) {
      const best = shortest(s, null);
      const end = [...ends].find((e) => best.has(e));
      if (end === undefined) continue;
      const ids: number[] = [];
      for (let n = end; n !== -1; n = best.get(n)!.prev) ids.push(n);
      leg = ids.reverse().map((id) => coords.get(id)!);
      break;
    }
    if (!leg) throw new Error(`route ${def.number}: no path for leg ${i} (${def.from}→${def.to})`);
    path.push(...(path.length ? leg.slice(1) : leg));
  }
  const simple = simplify(path, 2).map(
    ([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6] as LngLat,
  );
  const m = routeMetrics(simple, (p) => cellInfo(p));
  routes.push({
    id: `route${def.number}`,
    number: def.number,
    from: def.from,
    to: def.to,
    kind: def.kind,
    lengthM: Math.round(m.lengthM),
    wildShare: Math.round(m.wildShare * 100) / 100,
    path: simple,
  });
  console.log(
    `Route ${def.number} ${def.from}→${def.to} (${def.kind}): ${Math.round(m.lengthM)} m, ` +
      `${Math.round(m.wildShare * 100)}% wild, ${simple.length} points`,
  );
}

const file = RoutesFileSchema.parse({ region: REGION.id, routes });
writeFileSync(
  OUT,
  `${JSON.stringify(file, null, 2)}
`,
); // `pnpm routes:build` runs Prettier on it
console.log(`Wrote ${OUT}`);
