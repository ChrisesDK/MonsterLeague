import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { booleanPointInPolygon, bboxPolygon } from '@turf/turf';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import { cellToLatLng, polygonToCells } from 'h3-js';
import osmtogeojson from 'osmtogeojson';
import { RegionFileSchema, type RegionFile } from '@oml/data';
import { FeatureIndex, classifyCell } from './classify';
import { BIOMES, REGION } from './config';
import { basemapWater } from './basemap-water';
import { buildQuery, fetchOverpass } from './overpass';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const cacheDir = fileURLToPath(new URL('../cache', import.meta.url));
const OUT = root('packages/data/region/region.odense.json');
const DISTRICTS = root('packages/data/content/districts.odense.geojson');
const BASEMAP = root('apps/client/public/tiles/odense.pmtiles');

const started = performance.now();
const osm = (await fetchOverpass(
  buildQuery(REGION.bbox),
  cacheDir,
  process.argv.includes('--refresh'),
)) as {
  osm3s?: { timestamp_osm_base?: string };
};
const geo = osmtogeojson(osm as never) as FeatureCollection<Geometry | null>;

const index = new FeatureIndex();
for (const f of geo.features) index.addFeature(f);
const water = await basemapWater(BASEMAP, REGION.bbox);
for (const f of water) index.addFeature(f);
console.log(`Basemap water polygons: ${water.length}`);

type DistrictFeature = Feature<
  Polygon | MultiPolygon,
  { id: number; wildLevels: [number, number]; draft: boolean }
>;
const districts = (JSON.parse(readFileSync(DISTRICTS, 'utf8')) as FeatureCollection)
  .features as DistrictFeature[];

const cells = polygonToCells(bboxPolygon(REGION.bbox).geometry.coordinates, REGION.h3Res, true);
const out: RegionFile['cells'] = {};
const totals = Object.fromEntries(BIOMES.map((b) => [b, 0])) as Record<string, number>;
let dropped = 0;
let noSpawnCells = 0;
for (const cell of cells.sort()) {
  const [lat, lng] = cellToLatLng(cell);
  const district = districts.find((d) => booleanPointInPolygon([lng, lat], d));
  const c = classifyCell(index, cell, REGION.sampleRes);
  if (!district || Object.keys(c.shares).length === 0) {
    dropped++;
    continue;
  }
  if (c.noSpawn) noSpawnCells++;
  const row = [district.properties.id, c.noSpawn ? 1 : 0, ...BIOMES.map((b) => c.shares[b] ?? 0)];
  for (const b of BIOMES) totals[b]! += (c.shares[b] ?? 0) / 100;
  out[cell] = row;
}

const region: RegionFile = RegionFileSchema.parse({
  region: REGION.id,
  version: 1,
  h3Res: REGION.h3Res,
  coarseRes: REGION.coarseRes,
  bbox: REGION.bbox,
  biomes: [...BIOMES],
  osmTimestamp: osm.osm3s?.timestamp_osm_base ?? 'unknown',
  districts: districts
    .map((d) => ({
      id: d.properties.id,
      wildLevels: d.properties.wildLevels,
      draft: d.properties.draft,
    }))
    .sort((a, b) => a.id - b.id),
  cells: out,
});
// One cell per line keeps diffs readable and the file small.
const lines = Object.entries(region.cells).map(([id, row]) => `"${id}":${JSON.stringify(row)}`);
const { cells: _omit, ...head } = region;
const json = `${JSON.stringify(head).slice(0, -1)},"cells":{\n${lines.join(',\n')}\n}}\n`;
writeFileSync(OUT, json);

const CELL_KM2 = 0.015047; // average H3 res-10 cell area
const kept = Object.keys(out).length;
console.log(`\nRegion ${REGION.id}: bbox ${REGION.bbox.join(', ')}  (OSM ${region.osmTimestamp})`);
console.log(
  `OSM features: ${index.counts.areas} areas, ${index.counts.segments} buffered segments, ${index.counts.ignored} ignored`,
);
console.log(
  `Cells: ${cells.length} in bbox → ${kept} kept, ${dropped} dropped (no biome or district), ${noSpawnCells} noSpawn`,
);
console.log('Biome totals (km², by area share):');
for (const b of BIOMES)
  console.log(`  ${b.padEnd(11)} ${(totals[b]! * CELL_KM2).toFixed(2).padStart(7)}`);
for (const d of region.districts) {
  const n = Object.values(out).filter((r) => r[0] === d.id).length;
  console.log(`  district ${d.id}${d.draft ? ' (draft)' : ''}: ${n} cells`);
}
console.log(
  `File: ${OUT}\n  ${(json.length / 1024).toFixed(0)} KB raw, ${(gzipSync(json).length / 1024).toFixed(0)} KB gzip`,
);
console.log(`Done in ${((performance.now() - started) / 1000).toFixed(1)} s`);
