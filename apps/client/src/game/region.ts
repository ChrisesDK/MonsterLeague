import { content, type RegionFile } from '@oml/data';
import type { LevelBands } from '@oml/game';
import { decodeRegion, type Region } from '@oml/spawn';
import { latLngToCell } from 'h3-js';

let loading: Promise<Region> | null = null;

/** The region file is loaded lazily, once: tutorial placement, districts and zones. */
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

/** Zone at a position (P22; null outside the region file or before it has loaded). */
export function zoneAt(region: Region | null, p: { lat: number; lng: number }): string | null {
  if (!region) return null;
  return region.cells.get(latLngToCell(p.lat, p.lng, 10))?.zone || null;
}

/** Level band per district (GDD World table, content/zones.odense.json). */
export const LEVEL_BANDS: LevelBands = content.districtBands;
