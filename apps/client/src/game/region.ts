import { regions, type RegionFile, type RegionId } from '@oml/data';
import type { LevelBands } from '@oml/game';
import { decodeRegion, type Region } from '@oml/spawn';
import { latLngToCell } from 'h3-js';

/** Each region's file, loaded lazily (P27: only the region being played is fetched). */
const IMPORTS: Record<RegionId, () => Promise<{ default: unknown }>> = {
  odense: () => import('@oml/data/region/odense/region.json'),
  svendborg: () => import('@oml/data/region/svendborg/region.json'),
};
const loading = new Map<RegionId, Promise<Region>>();

/** The region file is loaded lazily, once per region: tutorial placement, districts and zones. */
export function loadRegion(region: RegionId = 'odense'): Promise<Region> {
  let p = loading.get(region);
  if (!p) {
    p = IMPORTS[region]().then((m) => decodeRegion(m.default as RegionFile));
    loading.set(region, p);
  }
  return p;
}

/** District at a position (null outside the region file). */
export function districtAt(region: Region | null, p: { lat: number; lng: number }): number | null {
  if (!region) return null;
  return region.cells.get(latLngToCell(p.lat, p.lng, 10))?.district ?? null;
}

/** Zone at a position (P22; null outside the region file or before it has loaded). */
export function zoneAt(region: Region | null, p: { lat: number; lng: number }): string | null {
  if (!region) return null;
  return region.cells.get(latLngToCell(p.lat, p.lng, 10))?.zone || null;
}

/** Level band per district (GDD World table, content/<region>/zones.json). */
export function levelBands(region: RegionId = 'odense'): LevelBands {
  return regions[region].districtBands;
}
