import type { RegionFile } from '@oml/data';
import type { LevelBands } from '@oml/game';
import districtsRaw from '@oml/data/content/districts.odense.geojson?raw';
import { decodeRegion, type Region } from '@oml/spawn';
import { latLngToCell } from 'h3-js';

let loading: Promise<Region> | null = null;

/** The region file (~330 kB) is loaded lazily, once: tutorial placement and spawn districts. */
export function loadRegion(): Promise<Region> {
  loading ??= import('@oml/data/region/odense.json').then((m) =>
    decodeRegion(m.default as unknown as RegionFile),
  );
  return loading;
}

/** District at a position (null outside the region file). */
export function districtAt(region: Region | null, p: { lat: number; lng: number }): number | null {
  if (!region) return null;
  return region.cells.get(latLngToCell(p.lat, p.lng, 10))?.district ?? null;
}

/** Level band per district, from the district file (GDD World table). */
export const LEVEL_BANDS: LevelBands = Object.fromEntries(
  (
    JSON.parse(districtsRaw) as {
      features: { properties: { id: number; wildLevels: [number, number] } }[];
    }
  ).features.map((f) => [f.properties.id, f.properties.wildLevels]),
);
