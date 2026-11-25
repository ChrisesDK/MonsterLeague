import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { bboxPolygon, booleanPointInPolygon, simplify as simplifyGeo } from '@turf/turf';
import type { FeatureCollection, Geometry, MultiPolygon } from 'geojson';
import {
  cellToChildren,
  cellToLatLng,
  cellsToMultiPolygon,
  latLngToCell,
  polygonToCells,
} from 'h3-js';
import osmtogeojson from 'osmtogeojson';
import {
  content,
  RegionFileSchema,
  RoutesFileSchema,
  ZonesFileSchema,
  type RegionFile,
} from '@oml/data';
import { FeatureIndex, blockedMask, classifyCell } from './classify';
import {
  BIOMES,
  FLAG,
  REGION,
  ROUTE_CORRIDOR_M,
  ROUTE_CORRIDOR_MIN_POINTS,
  wildFlags,
} from './config';
import { segmentDistM, type LngLat } from './route-lib';
import { basemapWater } from './basemap-water';
import { buildQuery, fetchOverpassTiled } from './overpass';
import { closeBorder, zoneEdges } from './borders';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const cacheDir = fileURLToPath(new URL('../cache', import.meta.url));
const OUT = root('packages/data/region/region.odense.json');
const HAZARDS_OUT = root('packages/data/region/hazards.odense.json');
const VERSION_OUT = root('packages/data/region/region.odense.version.json');
const DISTRICTS = root('packages/data/content/districts.odense.geojson');
const ZONES_GEO = root('packages/data/content/zones.odense.geojson');
const BORDERS_GEO = root('packages/data/content/borders.odense.geojson');
const ZONES = root('packages/data/content/zones.odense.json');
const BOUNDARY = root('packages/data/content/boundary.odense.geojson');
const ROUTES = root('packages/data/content/routes.odense.json');
const BASEMAP = root('apps/client/public/tiles/odense.pmtiles');

const started = performance.now();
const osm = await fetchOverpassTiled(
  buildQuery,
  REGION.bbox,
  REGION.tiles[0],
  REGION.tiles[1],
  cacheDir,
  process.argv.includes('--refresh'),
);
const geo = osmtogeojson(osm as never) as FeatureCollection<Geometry | null>;

const index = new FeatureIndex();
for (const f of geo.features) index.addFeature(f);
// Hazard lines for POI validation (GDD: no POI within 15 m of trunk/motorway or railway).
const hazards: { kind: 'rail' | 'road'; coords: [number, number][] }[] = [];
for (const f of geo.features) {
  const tags = (f.properties ?? {}) as Record<string, string | undefined>;
  const kind =
    tags.railway === 'rail'
      ? 'rail'
      : /^(motorway|trunk)(_link)?$/.test(tags.highway ?? '')
        ? 'road'
        : null;
  if (!kind || f.geometry?.type !== 'LineString') continue;
  hazards.push({
    kind,
    coords: f.geometry.coordinates.map(([x, y]) => [
      Math.round(x! * 1e6) / 1e6,
      Math.round(y! * 1e6) / 1e6,
    ]),
  });
}
const water = await basemapWater(BASEMAP, REGION.bbox);
for (const f of water) index.addFeature(f);
console.log(`Basemap water polygons: ${water.length}`);

/**
 * Zones (P22): every cell inside the municipality belongs to the nearest zone centre (in
 * metres), and to that zone's district. Districts and zones are written back as outlines
 * for the maps (districts.odense.geojson, zones.odense.geojson; generated).
 */
const zonesFile = ZonesFileSchema.parse(JSON.parse(readFileSync(ZONES, 'utf8')));
const zoneList = zonesFile.zones;
/** The municipality border with the harbour, the canal and small inlets filled in (borders.ts). */
const boundary = closeBorder(
  (JSON.parse(readFileSync(BOUNDARY, 'utf8')) as FeatureCollection<MultiPolygon>).features[0]!,
);
const kLng = 111_320 * Math.cos((55.39 * Math.PI) / 180);
function nearestZone(lat: number, lng: number): number {
  let best = 0;
  let bestD = Infinity;
  zoneList.forEach((z, i) => {
    const d = Math.hypot((z.lat - lat) * 110_540, (z.lng - lng) * kLng);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * Route corridors (M2d): a cell counts as on a route when at least a few of its 49 sample
 * points lie within 30 m of a route path. Routes come from `pnpm routes:build`.
 */
const routeSegments: [LngLat, LngLat][] = RoutesFileSchema.parse(
  JSON.parse(readFileSync(ROUTES, 'utf8')),
).routes.flatMap((r) => r.path.slice(1).map((b, i) => [r.path[i]!, b] as [LngLat, LngLat]));
function onRoute(cell: string): boolean {
  const [lat, lng] = cellToLatLng(cell);
  const near = routeSegments.filter(
    ([a, b]) => segmentDistM([lng, lat], a, b) < ROUTE_CORRIDOR_M + 80,
  );
  if (near.length === 0) return false;
  let hits = 0;
  for (const kid of cellToChildren(cell, REGION.sampleRes)) {
    const [y, x] = cellToLatLng(kid);
    if (near.some(([a, b]) => segmentDistM([x, y], a, b) <= ROUTE_CORRIDOR_M)) hits++;
    if (hits >= ROUTE_CORRIDOR_MIN_POINTS) return true;
  }
  return false;
}

const cells = polygonToCells(bboxPolygon(REGION.bbox).geometry.coordinates, REGION.h3Res, true);
const out: RegionFile['cells'] = {};
const totals = Object.fromEntries(BIOMES.map((b) => [b, 0])) as Record<string, number>;
let dropped = 0;
let noSpawnCells = 0;
let partlyBlocked = 0;
let wildCells = 0;
let routeCells = 0;
/**
 * A POI's own map cell always counts as the POI's zone (M2c): otherwise a cell whose centre
 * lies just across a border would show, e.g., a rest stop's wildlife as "too wild".
 */
const poiCellZone = new Map(
  Object.values(content.pois).map((p) => [
    latLngToCell(p.lat, p.lng, REGION.h3Res),
    zoneList.findIndex((z) => z.id === p.zone),
  ]),
);
/**
 * Every cell inside the border gets a zone, also cells without map data (they have no row in
 * the region file): the zone outlines and edges then have no holes or gaps.
 */
const cellsByZone: string[][] = zoneList.map(() => []);
const zoneOf = new Map<string, number>();
for (const cell of cells.sort()) {
  const [lat, lng] = cellToLatLng(cell);
  if (!booleanPointInPolygon([lng, lat], boundary)) {
    dropped++;
    continue;
  }
  const zoneIdx = poiCellZone.get(cell) ?? nearestZone(lat, lng);
  const district = zoneList[zoneIdx]!.district;
  cellsByZone[zoneIdx]!.push(cell);
  zoneOf.set(cell, zoneIdx);
  const c = classifyCell(index, cell, REGION.sampleRes);
  if (Object.keys(c.shares).length === 0) {
    dropped++;
    continue;
  }
  if (c.noSpawn) noSpawnCells++;
  // Column 1 is a bit field (region file v3): noSpawn, wild, water edge, route corridor.
  let flags = c.noSpawn ? FLAG.noSpawn : 0;
  flags |= wildFlags(c.shares);
  if (onRoute(cell)) flags |= FLAG.route;
  if (flags & FLAG.wild) wildCells++;
  if (flags & FLAG.route) routeCells++;
  const row = [district, zoneIdx, flags, ...BIOMES.map((b) => c.shares[b] ?? 0)];
  // Blocked spawn positions (P10/P11) as an optional 11th column; omitted when none.
  if (!c.noSpawn && c.blocked.length > 0) {
    row.push(blockedMask(c.blocked));
    partlyBlocked++;
  }
  for (const b of BIOMES) totals[b]! += (c.shares[b] ?? 0) / 100;
  out[cell] = row;
}

const districtMeta = zonesFile.districts
  .map((d) => ({ id: d.id, wildLevels: d.wildLevels, draft: false }))
  .sort((a, b) => a.id - b.id);

/** Outline of a set of cells, simplified to about 25 m (hexagon steps smoothed away). */
function outline(cellIds: string[]): MultiPolygon {
  const geom: MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: cellsToMultiPolygon(cellIds, true),
  };
  const s = simplifyGeo(geom, { tolerance: 0.00025, highQuality: true }) as MultiPolygon;
  return {
    type: 'MultiPolygon',
    coordinates: s.coordinates
      .map((poly) =>
        poly
          .map((ring) =>
            ring.map(([x, y]) => [Math.round(x! * 1e5) / 1e5, Math.round(y! * 1e5) / 1e5]),
          )
          .filter((ring) => ring.length >= 4)
          // outer ring only: holes would show as rings inside the region
          .slice(0, 1),
      )
      .filter((poly) => poly.length > 0),
  };
}
const generated = 'Generated by pnpm region:build from zones.odense.json (P22); do not edit.';
// Lines for the maps: the region border once, and every zone / district edge once (D162).
const borderPolys =
  boundary.geometry.type === 'Polygon'
    ? [boundary.geometry.coordinates]
    : boundary.geometry.coordinates;
writeFileSync(
  BORDERS_GEO,
  `${JSON.stringify({
    type: 'FeatureCollection',
    note: generated,
    features: [
      ...borderPolys.map((p) => ({
        type: 'Feature',
        properties: { kind: 'region' },
        geometry: {
          type: 'LineString',
          coordinates: p[0]!.map(([x, y]) => [
            Math.round(x! * 1e5) / 1e5,
            Math.round(y! * 1e5) / 1e5,
          ]),
        },
      })),
      ...zoneEdges(zoneOf, (z) => zoneList[z]!.district),
    ],
  })}
`,
);
writeFileSync(
  ZONES_GEO,
  `${JSON.stringify({
    type: 'FeatureCollection',
    note: generated,
    features: zoneList.map((z, i) => ({
      type: 'Feature',
      properties: { id: z.id, district: z.district, kind: z.kind },
      geometry: outline(cellsByZone[i]!),
    })),
  })}
`,
);
writeFileSync(
  DISTRICTS,
  `${JSON.stringify({
    type: 'FeatureCollection',
    note: generated,
    features: districtMeta.map((d) => ({
      type: 'Feature',
      properties: { id: d.id, wildLevels: d.wildLevels, draft: false },
      geometry: outline(cellsByZone.flatMap((cs, i) => (zoneList[i]!.district === d.id ? cs : []))),
    })),
  })}
`,
);
/**
 * Content hash of what decides spawns (cells and district bands). The spawn service returns
 * it with every response, and the client compares it with region.odense.version.json.
 */
const dataVersion = createHash('sha256')
  .update(
    JSON.stringify({
      region: REGION.id,
      districts: districtMeta,
      zones: zoneList.map((z) => z.id),
      cells: out,
    }),
  )
  .digest('hex')
  .slice(0, 12);

const region: RegionFile = RegionFileSchema.parse({
  region: REGION.id,
  dataVersion,
  version: 4,
  h3Res: REGION.h3Res,
  coarseRes: REGION.coarseRes,
  bbox: REGION.bbox,
  biomes: [...BIOMES],
  osmTimestamp: osm.osm3s?.timestamp_osm_base ?? 'unknown',
  districts: districtMeta,
  zones: zoneList.map((z) => z.id),
  cells: out,
});
// One cell per line keeps diffs readable and the file small.
const lines = Object.entries(region.cells).map(([id, row]) => `"${id}":${JSON.stringify(row)}`);
const { cells: _omit, ...head } = region;
const json = `${JSON.stringify(head).slice(0, -1)},"cells":{\n${lines.join(',\n')}\n}}\n`;
writeFileSync(OUT, json);
writeFileSync(HAZARDS_OUT, `${JSON.stringify({ region: REGION.id, lines: hazards })}\n`);
// Tiny companion file so the client knows the expected version without bundling the region.
writeFileSync(
  VERSION_OUT,
  `${JSON.stringify({ region: REGION.id, dataVersion })}
`,
);

const CELL_KM2 = 0.015047; // average H3 res-10 cell area
const kept = Object.keys(out).length;
console.log(`\nRegion ${REGION.id}: bbox ${REGION.bbox.join(', ')}  (OSM ${region.osmTimestamp})`);
console.log(
  `OSM features: ${index.counts.areas} areas, ${index.counts.segments} buffered segments, ${index.counts.ignored} ignored`,
);
console.log(
  `Cells: ${cells.length} in bbox → ${kept} kept, ${dropped} dropped (no biome or district)`,
);
console.log(
  `noSpawn cells (≥25% in no-spawn areas): ${noSpawnCells} of ${kept} (${((100 * noSpawnCells) / kept).toFixed(1)}%); ` +
    `${partlyBlocked} more cells with some blocked spawn positions`,
);
console.log(`Wild-area cells: ${wildCells}; route-corridor cells: ${routeCells}`);
console.log('Biome totals (km², by area share):');
for (const b of BIOMES)
  console.log(`  ${b.padEnd(11)} ${(totals[b]! * CELL_KM2).toFixed(2).padStart(7)}`);
for (const d of region.districts) {
  const n = Object.values(out).filter((r) => r[0] === d.id).length;
  console.log(`  district ${d.id}: ${n} cells`);
}
console.log(
  `File: ${OUT}\n  ${(json.length / 1024).toFixed(0)} KB raw, ${(gzipSync(json).length / 1024).toFixed(0)} KB gzip`,
);
console.log(`Done in ${((performance.now() - started) / 1000).toFixed(1)} s`);
