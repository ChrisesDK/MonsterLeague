/**
 * The coast (owner request, GDD v1.26): the OSM municipality border hugs or even cuts
 * the coastline (Lundeborg's harbour and the shore at Lehnskov lay outside Svendborg). The
 * region's outline:
 *
 * 1. takes in unclaimed land next to the region: land within LAND_FILL_M that no other
 *    municipality claims and that isn't water (sampled on H3 res-11 cells, about 25 m);
 * 2. reaches SEA_M out to sea, never into a neighbouring municipality;
 *
 * so the coast plays like the lakes: creatures in the water by the shore. Positions out on
 * the water too far from land to reach are blocked for spawns (`farFromShore`).
 */
import {
  bbox,
  booleanIntersects,
  booleanPointInPolygon,
  buffer,
  difference,
  featureCollection,
  union,
} from '@turf/turf';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { cellToLatLng, cellsToMultiPolygon, polygonToCells } from 'h3-js';

export const LAND_FILL_M = 1000;
export const SEA_M = 200;
/** How far out on the water a spawn may stand: within a player's reach of the shore. */
export const SHORE_REACH_M = 40;

type Area = Feature<Polygon | MultiPolygon>;

const polys = (f: Area): Position[][][] =>
  f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;

function unionAll(features: Area[]): Area | null {
  if (features.length === 0) return null;
  if (features.length === 1) return features[0]!;
  return union(featureCollection(features)) as Area | null;
}

/** Whether a point lies in any of the areas (bounding boxes checked first). */
function inAny(areas: { box: number[]; f: Area }[], p: Position): boolean {
  return areas.some(
    ({ box: [w, s, e, n], f }) =>
      p[0]! >= w! && p[0]! <= e! && p[1]! >= s! && p[1]! <= n! && booleanPointInPolygon(p, f),
  );
}

/**
 * The region's outline with the coast taken in. `others` are the neighbouring
 * municipalities; `isWater` tells water from land at a point ([lng, lat]).
 */
export function coastOutline(
  border: Area,
  others: Area[],
  isWater: (p: Position) => boolean,
  log: (s: string) => void = () => undefined,
): Area {
  const claimed = others.map((f) => ({ box: bbox(f), f }));
  // 1. unclaimed land next to the region
  const ring = difference(
    featureCollection([buffer(border, LAND_FILL_M, { units: 'meters' })!, border]),
  ) as Area | null;
  const land: string[] = [];
  if (ring)
    for (const poly of polys(ring))
      for (const cell of polygonToCells(poly, 11, true)) {
        const [lat, lng] = cellToLatLng(cell);
        const p = [lng, lat];
        if (!isWater(p) && !inAny(claimed, p)) land.push(cell);
      }
  const landArea: Area[] = cellsToMultiPolygon(land, true).map((coordinates) => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates },
  }));
  // only land that reaches the region (no far islets)
  const near = buffer(border, 30, { units: 'meters' })!;
  const touching = landArea.filter((a) => booleanIntersects(a, near));
  log(`Coast: ${land.length} unclaimed land cells, ${touching.length} pieces joined`);
  const withLand = unionAll([border, ...touching])!;
  // 2. out to sea, not into a neighbour
  const grown = buffer(withLand, SEA_M, { units: 'meters' })!;
  const neighbours = unionAll(others);
  const out = neighbours
    ? (difference(featureCollection([grown, neighbours])) as Area | null)
    : grown;
  return out ?? withLand;
}

/**
 * Whether a spawn position on the water lies beyond a player's reach of the shore: water
 * there and at eight points SHORE_REACH_M around it.
 */
export function farFromShore(p: Position, isWater: (q: Position) => boolean): boolean {
  if (!isWater(p)) return false;
  const lat = p[1]!;
  const dy = SHORE_REACH_M / 110_540;
  const dx = SHORE_REACH_M / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    if (!isWater([p[0]! + Math.cos(a) * dx, lat + Math.sin(a) * dy])) return false;
  }
  return true;
}
