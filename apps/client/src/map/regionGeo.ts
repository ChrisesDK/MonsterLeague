/**
 * Each region's map geometry (P27): district and zone outlines, borders, the boundary and
 * the map frame, plus the routes, built once per region. Every region keeps its own files
 * (content/<region>/); nothing here mixes them.
 */
import { MAP_FRAMES, regions, type RegionId } from '@oml/data';
import odenseDistricts from '@oml/data/content/odense/districts.geojson?raw';
import odenseZones from '@oml/data/content/odense/zones.geojson?raw';
import odenseBorders from '@oml/data/content/odense/borders.geojson?raw';
import odenseBoundary from '@oml/data/content/odense/boundary.geojson?raw';
import svendborgDistricts from '@oml/data/content/svendborg/districts.geojson?raw';
import svendborgZones from '@oml/data/content/svendborg/zones.geojson?raw';
import svendborgBorders from '@oml/data/content/svendborg/borders.geojson?raw';
import svendborgBoundary from '@oml/data/content/svendborg/boundary.geojson?raw';

type Area = GeoJSON.Polygon | GeoJSON.MultiPolygon;

const RAW: Record<
  RegionId,
  { districts: string; zones: string; borders: string; boundary: string }
> = {
  odense: {
    districts: odenseDistricts,
    zones: odenseZones,
    borders: odenseBorders,
    boundary: odenseBoundary,
  },
  svendborg: {
    districts: svendborgDistricts,
    zones: svendborgZones,
    borders: svendborgBorders,
    boundary: svendborgBoundary,
  },
};

export interface RegionGeo {
  region: RegionId;
  districts: GeoJSON.FeatureCollection<Area, { id: number }>;
  zones: GeoJSON.FeatureCollection<Area, { id: string; district: number; kind: string }>;
  borders: GeoJSON.FeatureCollection<GeoJSON.LineString, { kind: string }>;
  boundary: GeoJSON.Feature<GeoJSON.MultiPolygon>;
  /** D172: the world with the map frame cut out (painted plain on the Town Map). */
  frameMask: GeoJSON.Feature;
  /** The world with the region cut out (the wash outside the region, D162). */
  outside: GeoJSON.Feature;
  routes: GeoJSON.FeatureCollection<
    GeoJSON.LineString,
    { id: string; number: number; kind: string }
  >;
  /** [west, south, east, north] */
  frame: [number, number, number, number];
}

const WORLD: GeoJSON.Position[] = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

const cache = new Map<RegionId, RegionGeo>();

export function regionGeo(region: RegionId): RegionGeo {
  const hit = cache.get(region);
  if (hit) return hit;
  const raw = RAW[region];
  const frame = MAP_FRAMES[region];
  if (!frame) throw new Error(`No map frame for ${region}`);
  const [w, s, e, n] = frame;
  const borders = JSON.parse(raw.borders) as RegionGeo['borders'];
  const geo: RegionGeo = {
    region,
    districts: JSON.parse(raw.districts) as RegionGeo['districts'],
    zones: JSON.parse(raw.zones) as RegionGeo['zones'],
    borders,
    boundary: (JSON.parse(raw.boundary) as GeoJSON.FeatureCollection<GeoJSON.MultiPolygon>)
      .features[0]!,
    frameMask: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          WORLD,
          [
            [w, s],
            [w, n],
            [e, n],
            [e, s],
            [w, s],
          ],
        ],
      },
    },
    outside: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          WORLD,
          ...borders.features
            .filter((f) => f.properties.kind === 'region')
            .map((f) => [...f.geometry.coordinates].reverse()),
        ],
      },
    },
    routes: {
      type: 'FeatureCollection',
      features: Object.values(regions[region].routes).map((r) => ({
        type: 'Feature',
        properties: { id: r.id, number: r.number, kind: r.kind },
        geometry: { type: 'LineString', coordinates: r.path },
      })),
    },
    frame,
  };
  cache.set(region, geo);
  return geo;
}

/** Even-odd ray test of one ring. */
function inRing(ring: GeoJSON.Position[], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > lat !== yj! > lat && lng < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!)
      inside = !inside;
  }
  return inside;
}

/** Whether a position lies inside a region's boundary (its land and islands). */
export function insideRegion(region: RegionId, p: { lat: number; lng: number }): boolean {
  const { boundary, frame } = regionGeo(region);
  const [w, s, e, n] = frame;
  if (p.lng < w || p.lng > e || p.lat < s || p.lat > n) return false;
  return boundary.geometry.coordinates.some(
    (poly) => inRing(poly[0]!, p.lng, p.lat) && !poly.slice(1).some((h) => inRing(h, p.lng, p.lat)),
  );
}

/**
 * How far outside its land a position still counts as in a region: the boundary follows the
 * coast, and quays, piers, beaches and the harbour basin are part of playing there.
 */
export const REGION_SLACK_M = 500;

/** Metres from a position to a region's land (0 inside it). */
export function distanceToRegionM(region: RegionId, p: { lat: number; lng: number }): number {
  if (insideRegion(region, p)) return 0;
  const { boundary, frame } = regionGeo(region);
  const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110_540;
  const [w, s, e, n] = frame;
  // far outside the frame (2 km around the land): no need to measure
  const out = Math.max(w - p.lng, p.lng - e, 0) * kx + Math.max(s - p.lat, p.lat - n, 0) * ky;
  if (out > 0) return out + 2000;
  let best = Infinity;
  for (const poly of boundary.geometry.coordinates)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) {
        const ax = (ring[i - 1]![0]! - p.lng) * kx;
        const ay = (ring[i - 1]![1]! - p.lat) * ky;
        const bx = (ring[i]![0]! - p.lng) * kx;
        const by = (ring[i]![1]! - p.lat) * ky;
        const dx = bx - ax;
        const dy = by - ay;
        const len = dx * dx + dy * dy;
        const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
        best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
      }
  return best;
}

/**
 * The region at a position, among `among` (the playable ones): inside its land or within
 * REGION_SLACK_M of it, the nearest one; null outside all of them (P27: the player's
 * campaign follows the region they walk in; out at sea or between regions nothing changes).
 */
export function regionAt(
  p: { lat: number; lng: number },
  among: readonly RegionId[],
): RegionId | null {
  let best: RegionId | null = null;
  let bestD = REGION_SLACK_M;
  for (const r of among) {
    const d = distanceToRegionM(r, p);
    if (d <= bestD) [best, bestD] = [r, d];
  }
  return best;
}
