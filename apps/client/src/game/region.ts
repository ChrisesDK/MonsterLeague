import type { RegionFile } from '@oml/data';
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

export function districtOfCell(region: Region | null, cellId: string): number {
  return region?.cells.get(cellId)?.district ?? 1;
}
