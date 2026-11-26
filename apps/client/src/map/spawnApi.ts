import type { RegionId } from '@oml/data';
import { getResolution, isValidCell } from 'h3-js';
import { COARSE_RES } from './geo';

/**
 * The ONLY module that talks to the spawn service. Privacy (GDD): the request carries the
 * region, one coarse H3 res-7 cell (~5 km²) and the window: never coordinates, never a
 * res-10 cell, never an id. A test enforces this. The region is the campaign being played (P27).
 */

export interface ApiSpawn {
  id: string;
  speciesId: string;
  /** GDD v1.7: the phone turns `levelRoll` into a level (spawnLevel in packages/game). */
  rarity: 'common' | 'rare';
  levelRoll: number;
  district: number;
  cellId: string;
  lat: number;
  lng: number;
  requires: string | null;
  window: number;
  expiresAt: number;
}

export interface SpawnList {
  region: string;
  cell: string;
  window: number;
  expiresAt: number;
  /** What the service runs (region-data hash, spawn-rules version); absent in old Workers. */
  versions?: { regionData: string; spawnRules: string };
  spawns: ApiSpawn[];
}

export type WindowParam = 'current' | 'next';

/** Spawn service base URL: build-time env, or the local `wrangler dev` default in dev. */
export function serviceUrl(
  env: { VITE_SPAWN_SERVICE_URL?: string; DEV?: boolean } = import.meta.env,
): string | null {
  const url = env.VITE_SPAWN_SERVICE_URL?.trim();
  if (url) return url.replace(/\/+$/, '');
  return env.DEV ? 'http://localhost:8787' : null;
}

export function spawnRequestUrl(
  base: string,
  cell: string,
  window: WindowParam,
  region: RegionId = 'odense',
): string {
  if (!isValidCell(cell) || getResolution(cell) !== COARSE_RES) {
    throw new Error(`Refusing to send a non-res-${COARSE_RES} cell to the spawn service`);
  }
  const params = new URLSearchParams({ region, cell, window });
  return `${base}/v1/spawns?${params}`;
}

export async function fetchSpawnList(
  base: string,
  cell: string,
  window: WindowParam,
  fetchImpl: typeof fetch = fetch,
  region: RegionId = 'odense',
): Promise<SpawnList> {
  const res = await fetchImpl(spawnRequestUrl(base, cell, window, region), {
    method: 'GET',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-cache',
  });
  if (!res.ok) throw new Error(`spawn service HTTP ${res.status}`);
  return (await res.json()) as SpawnList;
}
