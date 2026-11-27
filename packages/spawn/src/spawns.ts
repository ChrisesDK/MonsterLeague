import type { Biome, Spawn as SpawnEntry } from '@oml/data';
import { mixSeed, Rng, seedRng } from '@oml/engine/rng';
import { cellToChildren, cellToLatLng, getResolution, latLngToCell } from 'h3-js';
import type { Region, RegionCell } from './region';
import { isNight } from './sun';

/** GDD: time is cut into 15-minute windows. */
export const WINDOW_SECONDS = 900;
export const MAX_SPAWNS_PER_CELL = 3;
/**
 * How many windows a spawn lives (owner: creatures vanished too fast, all at once at the end
 * of a 15-minute window). Each window makes 1/SPAWN_LIFE_WINDOWS of the density and each
 * spawn lives SPAWN_LIFE_WINDOWS windows (2 hours), so as many creatures are about as
 * before, but at a window's end only about one in eight goes and one in eight comes.
 */
export const SPAWN_LIFE_WINDOWS = 8;
/** Spawn positions snap to a res-12 child centre of the res-10 cell (deterministic jitter). */
export const POSITION_RES = 12;

export const windowOf = (unixSeconds: number): number => Math.floor(unixSeconds / WINDOW_SECONDS);
export const windowEnd = (window: number): number => (window + 1) * WINDOW_SECONDS;

/**
 * Expected spawns per res-10 cell per window, by biome. A cell's density is the share-
 * weighted sum (0 in noSpawn cells), times DESTINATION_FACTOR in destinations (nature in a
 * forest, field or lake zone, D167), WILD_FACTOR in other wild areas, ROUTE_FACTOR in route
 * corridors and STREET_FACTOR elsewhere. Tuned with `pnpm spawn:report` against the GDD
 * v1.13 targets: destinations are the place to catch (about one spawn per 80–120 m walked),
 * streets and routes are for trainers (one per 300–450 m).
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

/** GDD v1.13 (D167): destinations > other wild areas > route corridors > streets. */
export const DESTINATION_FACTOR = 2.3;
export const WILD_FACTOR = 1.4;
export const ROUTE_FACTOR = 1.0;
export const STREET_FACTOR = 0.8;
/** D167: rare entries weigh this much more in destinations. */
export const DESTINATION_RARE_BOOST = 3;

export interface Spawn {
  /** Stable id: hash of region, window, cell and index. */
  id: string;
  speciesId: string;
  /**
   * GDD v1.7: common creatures can be battled anywhere at the player's own level band;
   * rare ones lock with their district and use its band.
   */
  rarity: 'common' | 'rare';
  /** Deterministic roll in [0, 1); the phone turns it into a level from the right band. */
  levelRoll: number;
  /** District of the spawn's cell. */
  district: number;
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
  /**
   * P28: extra spawns made on the phone (finished routes) use a share of each cell's density
   * and a tag in their ids so they never collide with the shared ones. Default: 1 and none.
   */
  densityScale?: number;
  idTag?: string;
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
  const factor = cell.destination
    ? DESTINATION_FACTOR
    : cell.wild
      ? WILD_FACTOR
      : cell.route
        ? ROUTE_FACTOR
        : STREET_FACTOR;
  return d * factor;
}

/**
 * Species weight of a table entry in a cell: weight × Σ share(biome) × preference(biome).
 * Destination-only entries weigh 0 outside destinations, and entries with `zones` weigh 0
 * outside those zones (D171); rare entries weigh
 * DESTINATION_RARE_BOOST times more inside them (D167).
 */
export function entryWeight(entry: SpawnEntry, cell: RegionCell): number {
  if (entry.destinationOnly && !cell.destination) return 0;
  if (entry.zones && !entry.zones.includes(cell.zone)) return 0;
  let fit = 0;
  for (const [b, pref] of Object.entries(entry.biomes) as [Biome, number][])
    fit += cell.shares[b] * pref;
  const boost = cell.destination && entry.rarity === 'rare' ? DESTINATION_RARE_BOOST : 1;
  return entry.weight * fit * boost;
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
  densityScale = 1,
  idTag,
}: ComputeSpawnsInput): Spawn[] {
  const idRegion = idTag ? `${region.id}+${idTag}` : region.id;
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
    const density = cellDensity(cell) * densityScale;
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
      const [lat, lng] = children[rng.int(0, children.length - 1)]!;
      out.push({
        id: spawnId(idRegion, window, cellId, i),
        speciesId: entry.species,
        rarity: entry.rarity,
        levelRoll: rng.next(),
        district: cell.district,
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

export interface AliveSpawnsInput {
  region: Region;
  spawnTables: readonly SpawnEntry[];
  /** The window seed of each generation window (`window - SPAWN_LIFE_WINDOWS + 1` … `window`). */
  seedFor: (window: number) => string;
  window: number;
  cellIds: Iterable<string>;
  /** As in computeSpawns (P28: a player's own extra spawns on finished routes). */
  densityScale?: number;
  idTag?: string;
}

/**
 * The spawns alive in `window`: those made in each of the last SPAWN_LIFE_WINDOWS windows,
 * each window with 1/SPAWN_LIFE_WINDOWS of the density, each spawn ending when its own
 * life ends (`expiresAt`). Ids, positions and creatures stay the same for the whole life.
 */
export function computeAliveSpawns({
  region,
  spawnTables,
  seedFor,
  window,
  cellIds,
  densityScale = 1,
  idTag,
}: AliveSpawnsInput): Spawn[] {
  const cells = [...cellIds];
  const out: Spawn[] = [];
  for (let k = SPAWN_LIFE_WINDOWS - 1; k >= 0; k--) {
    const born = window - k;
    for (const s of computeSpawns({
      region,
      spawnTables,
      seed: seedFor(born),
      window: born,
      cellIds: cells,
      densityScale: densityScale / SPAWN_LIFE_WINDOWS,
      ...(idTag ? { idTag } : {}),
    }))
      out.push({ ...s, expiresAt: windowEnd(born + SPAWN_LIFE_WINDOWS - 1) });
  }
  return out;
}
