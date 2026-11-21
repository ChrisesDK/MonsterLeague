/** Region-builder configuration for Odense (one place to change the area). */
export const REGION = {
  id: 'odense',
  /** [west, south, east, north] in degrees (WGS84). */
  bbox: [10.3, 55.35, 10.47, 55.43] as [number, number, number, number],
  /** Gameplay cell resolution (GDD: H3 res 10, ~65 m edge, ~15,000 m²). */
  h3Res: 10,
  /** Sample-point resolution for area shares: the 49 res-12 children of each res-10 cell. */
  sampleRes: 12,
  /** Coarse resolution the client sends to the spawn service (GDD privacy: res 7). */
  coarseRes: 7,
};

/** Buffer radii in metres for features mapped as lines or points. */
/** GDD P10: a cell is noSpawn when at least this share of it lies in no-spawn areas. */
export const NO_SPAWN_SHARE = 0.25;

export const BUFFERS_M = {
  river: 15,
  canal: 10,
  stream: 5,
  historic: 20,
  noSpawnPoint: 30,
  railway: 10,
  /** Light rail / tram tracks: spawn positions are blocked, the cell is not (GDD P11). */
  lightRail: 5,
  majorRoad: 20,
};

import { BIOMES, type Biome } from '@oml/data';

export { BIOMES, type Biome };

/**
 * When a sample point lies in several biome areas, the first in this list wins (e.g. a
 * pond in a park counts as water, a listed building in a residential area as historic).
 */
export const BIOME_PRIORITY: readonly Biome[] = [
  'water',
  'forest',
  'park',
  'historic',
  'meadow',
  'farmland',
  'industrial',
  'urban',
];

/**
 * M2d wild areas (GDD "Wild areas and routes"): a cell is wild when park, forest,
 * meadow/field and water together cover at least half of it; a wild cell with at least this
 * much water is drawn as a water edge (ripples) instead of grass.
 */
export const WILD_MIN_SHARE = 0.5;
export const WATER_EDGE_MIN_SHARE = 0.25;
/** Route corridor: cells with at least this many of their 49 sample points within 30 m. */
export const ROUTE_CORRIDOR_M = 30;
export const ROUTE_CORRIDOR_MIN_POINTS = 3;

/** Region row flag bits (column 1; region file version 3). */
export const FLAG = { noSpawn: 1, wild: 2, waterEdge: 4, route: 8 } as const;

/** Wild / water-edge flags from biome shares in percent. */
export function wildFlags(shares: Partial<Record<string, number>>): number {
  const s = (b: string) => (shares[b] ?? 0) / 100;
  if (s('water') + s('forest') + s('park') + s('meadow') < WILD_MIN_SHARE) return 0;
  return FLAG.wild | (s('water') >= WATER_EDGE_MIN_SHARE ? FLAG.waterEdge : 0);
}
