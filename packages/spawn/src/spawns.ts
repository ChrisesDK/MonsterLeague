import type { Biome, Spawn as SpawnEntry } from '@oml/data';
import { mixSeed, Rng, seedRng } from '@oml/engine/rng';
import { cellToChildren, cellToLatLng, getResolution, latLngToCell } from 'h3-js';
import type { Region, RegionCell } from './region';
import { isNight } from './sun';

/** GDD: time is cut into 15-minute windows. */
export const WINDOW_SECONDS = 900;
export const MAX_SPAWNS_PER_CELL = 3;
/** Spawn positions snap to a res-12 child centre of the res-10 cell (deterministic jitter). */
export const POSITION_RES = 12;

export const windowOf = (unixSeconds: number): number => Math.floor(unixSeconds / WINDOW_SECONDS);
export const windowEnd = (window: number): number => (window + 1) * WINDOW_SECONDS;

/**
 * Expected spawns per res-10 cell per window, by biome. A cell's density is the share-
 * weighted sum (0 in noSpawn cells). Tuned with `pnpm spawn:report` against the GDD targets:
 * one battle-able spawn per 150–300 m walked in parks, forest and along water, and per
 * 300–500 m in dense streets.
 */
export const DENSITY: Record<Biome, number> = {
  water: 1.0,
  forest: 0.95,
  park: 1.0,
  meadow: 0.85,
  farmland: 0.6,
  urban: 0.5,
  industrial: 0.4,
  historic: 0.6,
};

export interface Spawn {
  /** Stable id: hash of region, window, cell and index. */
  id: string;
  speciesId: string;
  level: number;
  cellId: string;
  lat: number;
  lng: number;
  /** Field ability needed to battle it (null = anyone). */
  requires: string | null;
  window: number;
  /** Unix seconds when the window (and the spawn) ends. */
  expiresAt: number;
}

export interface ComputeSpawnsInput {
  region: Region;
  spawnTables: readonly SpawnEntry[];
  /** Window seed (hex; the service derives it with HMAC-SHA256(secret, region|window)). */
  seed: string;
  window: number;
  cellIds: Iterable<string>;
}

/** FNV-1a, 32-bit. */
export function hash32(text: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Turns a hex seed into four 32-bit words (shorter seeds are hashed). */
export function seedWords(seed: string): number[] {
  if (/^[0-9a-f]{32,}$/i.test(seed)) {
    return [0, 1, 2, 3].map((i) => Number.parseInt(seed.slice(i * 8, i * 8 + 8), 16) >>> 0);
  }
  return [0, 1, 2, 3].map((i) => hash32(seed, hash32(String(i))));
}

export function spawnId(region: string, window: number, cell: string, index: number): string {
  const key = `${region}|${window}|${cell}|${index}`;
  const a = hash32(key).toString(16).padStart(8, '0');
  const b = hash32(key, 0x9747b28c).toString(16).padStart(8, '0');
  return `${a}${b}`;
}

export function cellDensity(cell: RegionCell): number {
  if (cell.noSpawn) return 0;
  let d = 0;
  for (const [b, share] of Object.entries(cell.shares) as [Biome, number][])
    d += share * DENSITY[b];
  return d;
}

/** Species weight of a table entry in a cell: weight × Σ share(biome) × preference(biome). */
export function entryWeight(entry: SpawnEntry, cell: RegionCell): number {
  let fit = 0;
  for (const [b, pref] of Object.entries(entry.biomes) as [Biome, number][])
    fit += cell.shares[b] * pref;
  return entry.weight * fit;
}

/**
 * Candidate spawn positions: centres of the cell's res-12 children that are not blocked
 * (inside a no-spawn area or on light-rail tracks, GDD P10/P11) and really lie inside
 * the cell after rounding to 6 decimals (H3 children don't nest exactly, so a few centres
 * fall in, or on the edge of, a neighbour).
 */
export function positionsInside(cellId: string, blockedMask = 0): [number, number][] {
  const res = getResolution(cellId);
  return cellToChildren(cellId, POSITION_RES)
    .map((c) => cellToLatLng(c).map((v) => Math.round(v * 1e6) / 1e6) as [number, number])
    .filter((p, i) => !isBlocked(blockedMask, i) && latLngToCell(p[0], p[1], res) === cellId);
}

/** Bit i of a mask stored as a plain number (49 bits fit exactly in a double). */
export function isBlocked(mask: number, i: number): boolean {
  return Math.floor(mask / 2 ** i) % 2 === 1;
}

/** Deterministic spawns for the given res-10 cells in one window. Pure: no clock, no Math.random. */
export function computeSpawns({
  region,
  spawnTables,
  seed,
  window,
  cellIds,
}: ComputeSpawnsInput): Spawn[] {
  const words = seedWords(seed);
  const night = isNight(
    window * WINDOW_SECONDS + WINDOW_SECONDS / 2,
    region.center.lat,
    region.center.lng,
  );
  const out: Spawn[] = [];
  for (const cellId of cellIds) {
    const cell = region.cells.get(cellId);
    if (!cell || cell.noSpawn) continue;
    const district = region.districts.get(cell.district);
    if (!district) continue;
    const entries = spawnTables.filter(
      (e) => e.district === cell.district && (e.time === 'any' || (e.time === 'night') === night),
    );
    const weights = entries.map((e) => entryWeight(e, cell));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;

    const rng = new Rng(seedRng(mixSeed(...words, hash32(cellId), window)));
    const density = cellDensity(cell);
    const count = Math.min(
      MAX_SPAWNS_PER_CELL,
      Math.floor(density) + (rng.next() < density % 1 ? 1 : 0),
    );
    const children = count > 0 ? positionsInside(cellId, cell.blockedMask) : [];
    if (count > 0 && children.length === 0) continue; // every position is blocked
    for (let i = 0; i < count; i++) {
      let pick = rng.next() * total;
      let entry = entries[entries.length - 1]!;
      for (let k = 0; k < entries.length; k++) {
        pick -= weights[k]!;
        if (pick < 0) {
          entry = entries[k]!;
          break;
        }
      }
      const [lo, hi] = district.wildLevels;
      const [lat, lng] = children[rng.int(0, children.length - 1)]!;
      out.push({
        id: spawnId(region.id, window, cellId, i),
        speciesId: entry.species,
        level: rng.int(lo, hi),
        cellId,
        lat,
        lng,
        requires: entry.requires ?? null,
        window,
        expiresAt: windowEnd(window),
      });
    }
  }
  return out;
}
