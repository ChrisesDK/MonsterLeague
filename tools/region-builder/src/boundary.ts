/**
 * Municipality boundary (P27, recipe step 1): fetches the region's administrative boundary
 * (OSM boundary=administrative, admin_level=7, its `osmName`) from Overpass and writes it,
 * simplified to about 20 m, to packages/data/content/<region>/boundary.geojson. Islands
 * that belong to the municipality become separate polygons. The region builder closes
 * harbours and inlets later (D162).
 *
 *   pnpm --filter @oml/region-builder boundary --region svendborg
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { area, simplify, truncate } from '@turf/turf';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import osmtogeojson from 'osmtogeojson';
import { REGION, regionPaths } from './config';
import { fetchOverpass } from './overpass';

const cacheDir = fileURLToPath(new URL('../cache', import.meta.url));
const query = `[out:json][timeout:240];
relation["boundary"="administrative"]["admin_level"="7"]["name"="${REGION.osmName}"];
out body;
>;
out skel qt;`;
const osm = await fetchOverpass(query, cacheDir, process.argv.includes('--refresh'));
const geo = osmtogeojson(osm as never) as FeatureCollection;
const shape = geo.features.find(
  (f): f is Feature<Polygon | MultiPolygon> =>
    f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon',
);
if (!shape) throw new Error(`No boundary polygon for "${REGION.osmName}"`);

// ~20 m tolerance; 5 decimals (~1 m)
const simple = truncate(simplify(shape, { tolerance: 0.0002, highQuality: true }), {
  precision: 5,
});
const polys =
  simple.geometry.type === 'Polygon' ? [simple.geometry.coordinates] : simple.geometry.coordinates;
// Drop slivers below 0.01 km² (rocks and survey artefacts) and pieces whose centre lies
// outside the region's box (Svendborg: Vresen, an uninhabited reserve island in the Great
// Belt with no access); keep real islands.
const [bw, bs, be, bn] = REGION.bbox;
const kept = polys.filter((p) => {
  const ring = p[0]!;
  const cx = ring.reduce((a, c) => a + c[0]!, 0) / ring.length;
  const cy = ring.reduce((a, c) => a + c[1]!, 0) / ring.length;
  const inBox = cx >= bw && cx <= be && cy >= bs && cy <= bn;
  return inBox && area({ type: 'Polygon', coordinates: p } as Polygon) > 10_000;
});
const out = {
  type: 'FeatureCollection',
  note: 'Municipality borders from OpenStreetMap (© OpenStreetMap contributors, ODbL), simplified.',
  features: [
    {
      type: 'Feature',
      properties: { id: REGION.id },
      geometry: { type: 'MultiPolygon', coordinates: kept },
    },
  ],
};
const file = regionPaths(REGION.id).content('boundary.geojson');
writeFileSync(file, JSON.stringify(out));
const km2 = kept.map((p) => area({ type: 'Polygon', coordinates: p } as Polygon) / 1e6);
console.log(
  `Wrote ${file}: ${kept.length} polygon(s), ${km2.reduce((a, b) => a + b, 0).toFixed(1)} km² (${km2
    .sort((a, b) => b - a)
    .map((k) => k.toFixed(1))
    .join(', ')})`,
);
