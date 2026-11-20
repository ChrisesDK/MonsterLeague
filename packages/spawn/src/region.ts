import { BIOMES, type Biome, type RegionDistrict, type RegionFile } from '@oml/data';
import { cellToParent } from 'h3-js';

export interface RegionCell {
  id: string;
  district: number;
  noSpawn: boolean;
  /** Biome area shares, 0–1. */
  shares: Record<Biome, number>;
}

export interface Region {
  id: string;
  cells: Map<string, RegionCell>;
  districts: Map<number, RegionDistrict>;
  /** res-7 cell → the res-10 region cells inside it (what one spawn request covers). */
  byCoarse: Map<string, string[]>;
  coarseRes: number;
  /** Region centre (used for sunrise/sunset). */
  center: { lat: number; lng: number };
}

/** Decodes the compact region file (`[district, noSpawn, ...shares%]` per cell). */
export function decodeRegion(file: RegionFile): Region {
  const cells = new Map<string, RegionCell>();
  const byCoarse = new Map<string, string[]>();
  for (const [id, row] of Object.entries(file.cells)) {
    const shares = {} as Record<Biome, number>;
    BIOMES.forEach((b, i) => (shares[b] = (row[2 + i] ?? 0) / 100));
    cells.set(id, { id, district: row[0]!, noSpawn: row[1] === 1, shares });
    const parent = cellToParent(id, file.coarseRes);
    const list = byCoarse.get(parent);
    if (list) list.push(id);
    else byCoarse.set(parent, [id]);
  }
  const [w, s, e, n] = file.bbox;
  return {
    id: file.region,
    cells,
    districts: new Map(file.districts.map((d) => [d.id, d])),
    byCoarse,
    coarseRes: file.coarseRes,
    center: { lat: (s + n) / 2, lng: (w + e) / 2 },
  };
}
