import { fileURLToPath } from 'node:url';
import type { LngLat } from './route-lib';
import { odense } from './regions/odense';
import { svendborg } from './regions/svendborg';

/** One region's builder settings (P27): src/regions/<region>.ts. */
export interface RegionConfig {
  id: 'odense' | 'svendborg';
  /** The municipality's name in OSM (boundary=administrative, admin_level=7). */
  osmName: string;
  /** [west, south, east, north] in degrees (WGS84), a little larger than the municipality. */
  bbox: [number, number, number, number];
  /** Overpass requests are split into this grid of tiles (columns, rows). */
  tiles: [number, number];
  /** Routes between zones: badge path (main), other ways (alt), destinations (explore). */
  routes: readonly {
    number: number;
    from: string;
    to: string;
    kind: 'main' | 'alt' | 'explore';
    via: LngLat[];
  }[];
  /** P27: ferry crossings to islands that open on arrival; a path over the water. */
  ferries?: readonly { number: number; from: string; to: string; path: LngLat[] }[];
}

export const REGION_CONFIGS = { odense, svendborg } as const;

/**
 * The region to build: `--region <id>` on the command line or OML_REGION, else Odense.
 * Every output goes to that region's own folders (never another region's).
 */
function selectedRegion(): RegionConfig['id'] {
  const i = process.argv.indexOf('--region');
  const id = (i >= 0 ? process.argv[i + 1] : process.env.OML_REGION) ?? 'odense';
  if (!(id in REGION_CONFIGS))
    throw new Error(`Unknown region "${id}" (${Object.keys(REGION_CONFIGS).join(', ')})`);
  return id as RegionConfig['id'];
}

/** The selected region's settings plus the shared cell resolutions. */
export const REGION = {
  ...REGION_CONFIGS[selectedRegion()],
  /** Gameplay cell resolution (GDD: H3 res 10, ~65 m edge, ~15,000 m²). */
  h3Res: 10,
  /** Sample-point resolution for area shares: the 49 res-12 children of each res-10 cell. */
  sampleRes: 12,
  /** Coarse resolution the client sends to the spawn service (GDD privacy: res 7). */
  coarseRes: 7,
};

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
/** Where a region's files live (P27: one folder per region, nothing shared by accident). */
export function regionPaths(id: RegionConfig['id']) {
  return {
    content: (f: string) => root(`packages/data/content/${id}/${f}`),
    region: (f: string) => root(`packages/data/region/${id}/${f}`),
    tiles: root(`apps/client/public/tiles/${id}.pmtiles`),
  };
}

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

/** Region row flag bits (column 2; region file version 4). */
export const FLAG = { noSpawn: 1, wild: 2, waterEdge: 4, route: 8, destination: 16 } as const;

/**
 * Destination (D167): a cell of real nature (water, forest, park, meadow or farmland) in a
 * forest, field or lake zone (zone kind wild or water). Spawns are denser and rarer there.
 */
export function isDestination(shares: Partial<Record<string, number>>, zoneKind: string): boolean {
  if (zoneKind !== 'wild' && zoneKind !== 'water') return false;
  const s = (b: string) => (shares[b] ?? 0) / 100;
  return s('water') + s('forest') + s('park') + s('meadow') + s('farmland') >= WILD_MIN_SHARE;
}

/** Wild / water-edge flags from biome shares in percent. */
export function wildFlags(shares: Partial<Record<string, number>>): number {
  const s = (b: string) => (shares[b] ?? 0) / 100;
  if (s('water') + s('forest') + s('park') + s('meadow') < WILD_MIN_SHARE) return 0;
  return FLAG.wild | (s('water') >= WATER_EDGE_MIN_SHARE ? FLAG.waterEdge : 0);
}
