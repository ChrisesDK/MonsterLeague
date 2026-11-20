/**
 * Spawn density report: simulated walks through districts with spawn tables, counting
 * battle-able spawns (no field ability needed) that come within 40 m, per km walked.
 * GDD targets: one per 150–300 m in parks, forest and along water; one per 300–500 m in
 * dense streets. Deterministic (fixed seeds), so results are reproducible.
 */
import { readFileSync } from 'node:fs';
import { content, RegionFileSchema } from '@oml/data';
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
const districts = [...new Set(tables.map((t) => t.district))];
const area = [...region.cells.values()].filter((c) => districts.includes(c.district));
const inArea = new Set(area.map((c) => c.id));

type Klass = 'green' | 'streets' | 'other';
const TARGET: Record<Exclude<Klass, 'other'>, [number, number]> = {
  green: [150, 300],
  streets: [300, 500],
};
function klass(c: RegionCell): Klass {
  const s = c.shares;
  if (s.water + s.forest + s.park + s.meadow >= 0.5) return 'green';
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

const rng = new Rng(seedRng(20261120));
const walked: Record<Klass, number> = { green: 0, streets: 0, other: 0 };
const found: Record<Klass, number> = { green: 0, streets: 0, other: 0 };
let windows = 0;
let totalSpawns = 0;
const start = windowOf(Date.UTC(2026, 10, 20, 0, 0) / 1000);
for (let w = 0; w < 96 * 3; w += 3) {
  // Every 45 min over 3 days: covers day and night.
  const window = start + w;
  const seed = `report-${window}`;
  const spawns = computeSpawns({
    region,
    spawnTables: tables,
    seed,
    window,
    cellIds: inArea,
  }).filter((s) => s.requires === null);
  windows++;
  totalSpawns += spawns.length;
  const byCell = new Map<string, Spawn[]>();
  for (const s of spawns) byCell.set(s.cellId, [...(byCell.get(s.cellId) ?? []), s]);

  for (let walker = 0; walker < 12; walker++) {
    const startCell = area[rng.int(0, area.length - 1)]!;
    let pos = cellToLatLng(startCell.id) as [number, number];
    let heading = rng.next() * 2 * Math.PI;
    const seen = new Set<string>();
    for (let m = 0; m < WALK_M; m += STEP_M) {
      heading += (rng.next() - 0.5) * 0.6;
      const next: [number, number] = [
        pos[0] + (Math.cos(heading) * STEP_M) / M_LAT,
        pos[1] + (Math.sin(heading) * STEP_M) / mLng(pos[0]),
      ];
      if (!inArea.has(latLngToCell(next[0], next[1], 10))) {
        heading += Math.PI + (rng.next() - 0.5);
        continue;
      }
      pos = next;
      const cellId = latLngToCell(pos[0], pos[1], 10);
      const k = klass(region.cells.get(cellId)!);
      walked[k] += STEP_M;
      for (const near of gridDisk(cellId, 1)) {
        for (const s of byCell.get(near) ?? []) {
          if (!seen.has(s.id) && dist(pos, [s.lat, s.lng]) <= REACH_M) {
            seen.add(s.id);
            found[k]++;
          }
        }
      }
    }
  }
}

const km2 = (area.length * 0.015047).toFixed(1);
console.log(
  `Spawn density report (districts ${districts.join(', ')}: ${area.length} cells, ${km2} km²)`,
);
console.log(
  `${windows} windows over 3 days (day and night), ${(totalSpawns / windows).toFixed(0)} battle-able spawns per window`,
);
console.log(`Walks: 12 per window × ${WALK_M} m, reach ${REACH_M} m\n`);
let ok = true;
for (const k of ['green', 'streets', 'other'] as const) {
  const perKm = found[k] / (walked[k] / 1000);
  const mPer = found[k] ? walked[k] / found[k] : Infinity;
  const target = k === 'other' ? null : TARGET[k];
  const pass = target ? mPer >= target[0] && mPer <= target[1] : null;
  if (pass === false) ok = false;
  console.log(
    `  ${k.padEnd(8)} ${(walked[k] / 1000).toFixed(0).padStart(5)} km walked  ${perKm.toFixed(2).padStart(5)} spawns/km  ` +
      `1 per ${mPer.toFixed(0).padStart(4)} m` +
      (target ? `   target ${target[0]}–${target[1]} m ${pass ? '✅' : '❌'}` : '   (no target)'),
  );
}
console.log(
  '\nGreen = water+forest+park+meadow ≥ 50% of the cell; streets = urban+historic+industrial ≥ 50%.',
);
process.exit(ok ? 0 : 1);
