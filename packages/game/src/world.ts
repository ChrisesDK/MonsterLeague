import { content, type Dex, type Poi, type Spawn as SpawnEntry } from '@oml/data';
import { positionsInside, type Region } from '@oml/spawn';
import { latLngToCell } from 'h3-js';

export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial bearing from a to b in degrees (0 = north, clockwise). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function offset(p: LatLng, meters: number, bearing: number): LatLng {
  const b = rad(bearing);
  return {
    lat: p.lat + (meters * Math.cos(b)) / 110_540,
    lng: p.lng + (meters * Math.sin(b)) / (111_320 * Math.cos(rad(p.lat))),
  };
}

export const TUTORIAL_MIN_M = 100;
export const TUTORIAL_MAX_M = 200;

/**
 * Where the personal tutorial creature appears: 100–200 m from the player on a spawnable
 * spot (a region cell that is not no-spawn, snapped to an unblocked res-12 position, so
 * never in a no-spawn area or on light-rail tracks). Outside the region file there is
 * nothing to check, so any point at that distance is used. `random` returns [0, 1).
 */
export function placeTutorial(
  from: LatLng,
  region: Region | null,
  random: () => number,
  res = 10,
): LatLng {
  let fallback: LatLng | null = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const dist = TUTORIAL_MIN_M + 20 + random() * (TUTORIAL_MAX_M - TUTORIAL_MIN_M - 40);
    const p = offset(from, dist, random() * 360);
    if (!region) return p;
    const cell = region.cells.get(latLngToCell(p.lat, p.lng, res));
    if (!cell) {
      fallback ??= p;
      continue;
    }
    if (cell.noSpawn) continue;
    const spots = positionsInside(cell.id, cell.blockedMask).map(([lat, lng]) => ({ lat, lng }));
    let best: LatLng | null = null;
    let bestD = Infinity;
    for (const s of spots) {
      const d = distanceM(s, p);
      const fromPlayer = distanceM(s, from);
      if (d < bestD && fromPlayer >= TUTORIAL_MIN_M && fromPlayer <= TUTORIAL_MAX_M) {
        best = s;
        bestD = d;
      }
    }
    if (best) return best;
  }
  // Every nearby cell is no-spawn (unlikely): fall back to a point outside the region or
  // the last candidate; the battle still works, it just is not checked.
  return fallback ?? offset(from, (TUTORIAL_MIN_M + TUTORIAL_MAX_M) / 2, 0);
}

export interface NearestPoi {
  poi: Poi;
  distance: number;
  bearing: number;
}

export function nearestPoi(
  from: LatLng,
  pois: readonly Poi[],
  filter: (p: Poi) => boolean = () => true,
): NearestPoi | null {
  let best: NearestPoi | null = null;
  for (const poi of pois) {
    if (!filter(poi)) continue;
    const distance = distanceM(from, poi);
    if (!best || distance < best.distance) best = { poi, distance, bearing: bearingDeg(from, poi) };
  }
  return best;
}

export function insidePoi(from: LatLng, poi: Poi): boolean {
  return distanceM(from, poi) <= poi.radius;
}

/**
 * After onboarding the map points the player to district 1: the nearest district-1 rest
 * stop and the nearest unbeaten district-1 trainer; already in district 1, only the
 * nearest rest stop.
 */
export function onboardingTargets(
  from: LatLng,
  playerDistrict: number | null,
  defeatedTrainers: readonly string[],
  dex: Dex = content,
): { restStop: NearestPoi | null; trainer: NearestPoi | null } {
  const pois = Object.values(dex.pois).filter((p) => p.district === 1);
  const restStop = nearestPoi(from, pois, (p) => p.kind === 'restStop');
  if (playerDistrict === 1) return { restStop, trainer: null };
  const trainer = nearestPoi(
    from,
    pois,
    (p) => p.kind === 'trainer' && !defeatedTrainers.includes(p.trainer),
  );
  return { restStop, trainer };
}

// ---------------------------------------------------------------------------
// Field guide

export type HintBiome = keyof SpawnEntry['biomes'];

export interface GuideHint {
  district: number;
  /** Biomes where the species is most likely (top 1–2 by weight). */
  biomes: string[];
  time: SpawnEntry['time'];
  requires: string | null;
  /** D171: the home destination(s) of a destination creature (empty for other entries). */
  zones: string[];
  /** D173: this entry's zone is the creature's main home (its highest-weight home). */
  mainHome: boolean;
}

/** Biome hints for the field guide ("found near water at night"), from the spawn tables. */
export function guideHints(speciesId: string, dex: Dex = content): GuideHint[] {
  const entries = dex.spawns.filter((e) => e.species === speciesId);
  const homeWeight = new Map<string, number>();
  for (const e of entries)
    if (!e.requires)
      for (const z of e.zones ?? []) homeWeight.set(z, (homeWeight.get(z) ?? 0) + e.weight);
  const main = [...homeWeight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return entries.map((e) => {
    const ranked = Object.entries(e.biomes)
      .filter(([, w]) => (w ?? 0) > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    const top = ranked[0]?.[1] ?? 0;
    return {
      district: e.district,
      biomes: ranked
        .filter(([, w]) => (w ?? 0) >= top * 0.75)
        .slice(0, 2)
        .map(([b]) => b),
      time: e.time,
      requires: e.requires ?? null,
      zones: e.zones ?? [],
      mainHome: main !== null && (e.zones ?? []).includes(main),
    };
  });
}
