/**
 * Spawn density report: simulated walks counting battle-able spawns (no field ability
 * needed) that come within 40 m, per km walked. GDD v1.13 targets (the CI gate, D167):
 *  - destinations (nature in forest, field and lake zones): 1 per 70–110 m;
 *  - other wild areas (city parks): 1 per 100–170 m;
 *  - route corridors outside wild areas: 1 per 200–400 m;
 *  - streets: 1 per 300–450 m;
 *  - rare creatures are at least twice as common (share of finds) in destinations as elsewhere;
 *  - a 30-minute walk in a destination (2 km at 4 km/h, two 15-minute windows) offers
 *    15–22 creatures.
 * Also: what a player with 0 badges finds outside district 1 (commons only, GDD v1.7), and
 * whether streets favour urban species and wild areas their biome species.
 * Deterministic (fixed seeds), so results are reproducible.
 */
import { readFileSync } from 'node:fs';
import { content, RegionFileSchema, type Biome } from '@oml/data';
import { Rng, seedRng } from '@oml/engine/rng';
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { computeSpawns, decodeRegion, windowOf, type RegionCell, type Spawn } from '../src/index';

const file = RegionFileSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../data/region/region.odense.json', import.meta.url), 'utf8'),
  ),
);
const region = decodeRegion(file);
const tables = content.spawns;
const districts = [...new Set(tables.map((t) => t.district))].sort((a, b) => a - b);
const allCells = [...region.cells.values()].filter((c) => districts.includes(c.district));

const KLASSES = ['destination', 'wild', 'route', 'streets', 'other'] as const;
type Klass = (typeof KLASSES)[number];
const TARGET: Record<Exclude<Klass, 'other'>, [number, number]> = {
  destination: [70, 110],
  wild: [100, 170],
  route: [200, 400],
  streets: [300, 450],
};
const PARK_WALK_TARGET: [number, number] = [15, 22];
/** Rare finds: at least this many times the share in destinations as elsewhere. */
const RARE_RATIO_TARGET = 2;
const URBAN: Biome[] = ['urban', 'historic', 'industrial'];
function klass(c: RegionCell): Klass {
  if (c.destination) return 'destination';
  if (c.wild) return 'wild';
  if (c.route) return 'route';
  const s = c.shares;
  if (s.urban + s.historic + s.industrial >= 0.5) return 'streets';
  return 'other';
}

const REACH_M = 40;
const STEP_M = 10;
const WALK_M = 1200; // ~14 min at walking pace: one 15-minute window
const M_LAT = 110_540;
const mLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);
const dist = (a: [number, number], b: [number, number]) =>
  Math.hypot((a[0] - b[0]) * M_LAT, (a[1] - b[1]) * mLng(a[0]));
const START_WINDOW = windowOf(Date.UTC(2026, 10, 20, 0, 0) / 1000);

function spawnsFor(window: number, cellIds: Set<string>, keep: (s: Spawn) => boolean) {
  const spawns = computeSpawns({
    region,
    spawnTables: tables,
    seed: `report-${window}`,
    window,
    cellIds,
  }).filter(keep);
  const byCell = new Map<string, Spawn[]>();
  for (const s of spawns) byCell.set(s.cellId, [...(byCell.get(s.cellId) ?? []), s]);
  return { spawns, byCell };
}

/** One random walk of `metres` inside `area`; calls `onFind` for each new spawn in reach. */
function walk(
  rng: Rng,
  area: Set<string>,
  start: string,
  metres: number,
  byCellAt: (m: number) => Map<string, Spawn[]>,
  onStep: (cell: RegionCell) => void,
  onFind: (cell: RegionCell, s: Spawn) => void,
) {
  let pos = cellToLatLng(start) as [number, number];
  let heading = rng.next() * 2 * Math.PI;
  const seen = new Set<string>();
  for (let m = 0; m < metres; m += STEP_M) {
    heading += (rng.next() - 0.5) * 0.6;
    const next: [number, number] = [
      pos[0] + (Math.cos(heading) * STEP_M) / M_LAT,
      pos[1] + (Math.sin(heading) * STEP_M) / mLng(pos[0]),
    ];
    if (!area.has(latLngToCell(next[0], next[1], 10))) {
      heading += Math.PI + (rng.next() - 0.5);
      continue;
    }
    pos = next;
    const cellId = latLngToCell(pos[0], pos[1], 10);
    const cell = region.cells.get(cellId)!;
    onStep(cell);
    const byCell = byCellAt(m);
    for (const near of gridDisk(cellId, 1)) {
      for (const s of byCell.get(near) ?? []) {
        if (!seen.has(s.id) && dist(pos, [s.lat, s.lng]) <= REACH_M) {
          seen.add(s.id);
          onFind(cell, s);
        }
      }
    }
  }
}

interface Result {
  walked: Record<Klass, number>;
  found: Record<Klass, number>;
  /** Found spawns whose species prefers an urban biome most. */
  urbanFound: Record<Klass, number>;
  rareFound: Record<Klass, number>;
  windows: number;
  spawns: number;
  cells: number;
}

/** The species entry's favourite biome (for the urban/wild species mix). */
const topCache = new Map<string, Biome | null>();
function topBiome(s: Spawn): Biome | null {
  const key = `${s.speciesId}|${s.district}`;
  if (!topCache.has(key)) {
    const e = tables.find((t) => t.species === s.speciesId && t.district === s.district);
    topCache.set(
      key,
      e ? (Object.entries(e.biomes) as [Biome, number][]).sort((a, b) => b[1] - a[1])[0]![0] : null,
    );
  }
  return topCache.get(key)!;
}

/** Seeded walks through `cells`, counting spawns that pass `keep` within REACH_M. */
function measure(cells: RegionCell[], keep: (s: Spawn) => boolean): Result {
  const inArea = new Set(cells.map((c) => c.id));
  const rng = new Rng(seedRng(20261120));
  const zero = () => ({ destination: 0, wild: 0, route: 0, streets: 0, other: 0 });
  const r: Result = {
    walked: zero(),
    found: zero(),
    urbanFound: zero(),
    rareFound: zero(),
    windows: 0,
    spawns: 0,
    cells: cells.length,
  };
  for (let w = 0; w < 96 * 3; w += 3) {
    // Every 45 min over 3 days: covers day and night.
    const { spawns, byCell } = spawnsFor(START_WINDOW + w, inArea, keep);
    r.windows++;
    r.spawns += spawns.length;
    for (let walker = 0; walker < 12; walker++) {
      const start = cells[rng.int(0, cells.length - 1)]!.id;
      walk(
        rng,
        inArea,
        start,
        WALK_M,
        () => byCell,
        (cell) => (r.walked[klass(cell)] += STEP_M),
        (cell, s) => {
          const k = klass(cell);
          r.found[k]++;
          if (s.rarity === 'rare') r.rareFound[k]++;
          const top = topBiome(s);
          if (top && URBAN.includes(top)) r.urbanFound[k]++;
        },
      );
    }
  }
  return r;
}

function print(r: Result, gate: boolean): boolean {
  let ok = true;
  for (const k of KLASSES) {
    const perKm = r.found[k] / (r.walked[k] / 1000);
    const mPer = r.found[k] ? r.walked[k] / r.found[k] : Infinity;
    const target = k === 'other' || !gate ? null : TARGET[k];
    const pass = target ? mPer >= target[0] && mPer <= target[1] : null;
    if (pass === false) ok = false;
    const urban = r.found[k] ? Math.round((100 * r.urbanFound[k]) / r.found[k]) : 0;
    const rare = r.found[k] ? ((100 * r.rareFound[k]) / r.found[k]).toFixed(1) : '0';
    console.log(
      `  ${k.padEnd(11)} ${(r.walked[k] / 1000).toFixed(0).padStart(5)} km walked  ${perKm.toFixed(2).padStart(5)} spawns/km  ` +
        `1 per ${mPer.toFixed(0).padStart(4)} m  ${String(urban).padStart(3)}% urban species  ${rare.padStart(4)}% rare` +
        (target ? `   target ${target[0]}–${target[1]} m ${pass ? '✅' : '❌'}` : '   (no target)'),
    );
  }
  const total = Object.values(r.walked).reduce((a, b) => a + b, 0) / 1000;
  const n = Object.values(r.found).reduce((a, b) => a + b, 0);
  console.log(
    `  all         ${total.toFixed(0).padStart(5)} km walked  ${(n / total).toFixed(2).padStart(5)} spawns/km`,
  );
  if (gate) {
    const share = (ks: readonly Klass[]) =>
      ks.reduce((a, k) => a + r.rareFound[k], 0) /
      Math.max(
        1,
        ks.reduce((a, k) => a + r.found[k], 0),
      );
    const ratio = share(['destination']) / share(['wild', 'route', 'streets', 'other']);
    const pass = ratio >= RARE_RATIO_TARGET;
    if (!pass) ok = false;
    console.log(
      `  rare share in destinations vs elsewhere: ${ratio.toFixed(1)}×   target ≥ ${RARE_RATIO_TARGET}× ${pass ? '✅' : '❌'}`,
    );
  }
  return ok;
}

/**
 * 30-minute destination walk: 2 km at 4 km/h through connected destination cells (at least
 * 40), across two spawn windows (the list refreshes after 15 minutes).
 */
function parkWalk(keep: (s: Spawn) => boolean): { mean: number; p10: number; p90: number } {
  const wild = new Set(allCells.filter((c) => c.destination).map((c) => c.id));
  // connected components of wild cells
  const comp = new Map<string, number>();
  const sizes: number[] = [];
  for (const id of wild) {
    if (comp.has(id)) continue;
    const stack = [id];
    comp.set(id, sizes.length);
    let n = 0;
    while (stack.length) {
      const c = stack.pop()!;
      n++;
      for (const nb of gridDisk(c, 1))
        if (wild.has(nb) && !comp.has(nb)) {
          comp.set(nb, sizes.length);
          stack.push(nb);
        }
    }
    sizes.push(n);
  }
  const parks = [...wild].filter((id) => sizes[comp.get(id)!]! >= 40);
  const areas = new Map<number, Set<string>>();
  for (const id of parks) {
    const c = comp.get(id)!;
    if (!areas.has(c)) areas.set(c, new Set());
    areas.get(c)!.add(id);
  }
  const rng = new Rng(seedRng(1930));
  const counts: number[] = [];
  for (let w = 0; w < 96 * 3; w += 6) {
    const a = spawnsFor(START_WINDOW + w, wild, keep).byCell;
    const b = spawnsFor(START_WINDOW + w + 1, wild, keep).byCell;
    for (let walker = 0; walker < 8; walker++) {
      const start = parks[rng.int(0, parks.length - 1)]!;
      const area = areas.get(comp.get(start)!)!;
      let n = 0;
      walk(
        rng,
        area,
        start,
        2000,
        (m) => (m < 1000 ? a : b),
        () => undefined,
        () => n++,
      );
      counts.push(n);
    }
  }
  counts.sort((x, y) => x - y);
  return {
    mean: counts.reduce((s, x) => s + x, 0) / counts.length,
    p10: counts[Math.floor(counts.length * 0.1)]!,
    p90: counts[Math.floor(counts.length * 0.9)]!,
  };
}

const main = measure(allCells, (s) => s.requires === null);
console.log(
  `Spawn density report (districts ${districts.join(', ')}: ${main.cells} cells, ${(main.cells * 0.015047).toFixed(1)} km²)`,
);
console.log(
  `${main.windows} windows over 3 days (day and night), ${(main.spawns / main.windows).toFixed(0)} battle-able spawns per window`,
);
console.log(`Walks: 12 per window × ${WALK_M} m, reach ${REACH_M} m\n`);
console.log('Battle-able spawns (no field ability needed; districts unlocked):');
let ok = print(main, true);

const pw = parkWalk((s) => s.requires === null);
const pwOk = pw.mean >= PARK_WALK_TARGET[0] && pw.mean <= PARK_WALK_TARGET[1];
ok &&= pwOk;
console.log(
  `\n30-minute destination walk (2 km at 4 km/h in a destination of 40+ cells, two windows): ` +
    `${pw.mean.toFixed(1)} creatures on average (10th–90th percentile ${pw.p10}–${pw.p90})` +
    `   target ${PARK_WALK_TARGET[0]}–${PARK_WALK_TARGET[1]} ${pwOk ? '✅' : '❌'}`,
);
const pw0 = parkWalk((s) => s.requires === null && s.rarity === 'common');
console.log(
  `  with 0 badges (common creatures only): ${pw0.mean.toFixed(1)} (${pw0.p10}–${pw0.p90})`,
);

const outside = allCells.filter((c) => c.district !== 1);
const zero = measure(outside, (s) => s.requires === null && s.rarity === 'common');
console.log('\nA player with 0 badges outside district 1 (common creatures only, GDD v1.7):');
print(zero, false);
console.log(
  '\nDestination, wild and route come from the region flags (in that order); streets = urban+historic+industrial ≥ 50%.' +
    '\n"Urban species" = found creatures whose spawn entry prefers urban, historic or industrial most.',
);
process.exit(ok ? 0 : 1);
