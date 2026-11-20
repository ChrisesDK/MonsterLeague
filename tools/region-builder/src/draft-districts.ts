/**
 * One-off generator for the FIRST DRAFT of content/districts.odense.geojson.
 * District 1 is drawn by hand along real streets; districts 2–8 are Voronoi placeholders
 * around their GDD arena landmarks (marked draft: true). After this, the GeoJSON file is
 * the source: edit it by hand (e.g. in geojson.io) and don't re-run this script.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { REGION } from './config';

// [lon, lat]. District 1 "Centrum / station": railway north of Odense station → Nørregade
// (east) → Overgade/Vestergade (south) → Kongensgade/Klostervej → Vestre Stationsvej (west).
// Excludes the H.C. Andersen quarter (east of Nørregade) and Skt. Knuds square (south).
const DISTRICT_1: [number, number][] = [
  [10.3791, 55.4032],
  [10.3893, 55.4032],
  [10.3893, 55.4009],
  [10.3886, 55.399],
  [10.3889, 55.3968],
  [10.3846, 55.3965],
  [10.3818, 55.3961],
  [10.3797, 55.3962],
  [10.3802, 55.3983],
  [10.3791, 55.399],
  [10.3791, 55.4032],
];

/** Arena landmarks (GDD "World" table) used as Voronoi seeds for the draft districts. */
const SEEDS: { id: number; at: [number, number] }[] = [
  { id: 1, at: [10.3852, 55.3998] }, // Kongens Have
  { id: 2, at: [10.3833, 55.3908] }, // Munke Mose
  { id: 3, at: [10.3907, 55.3984] }, // H.C. Andersens Hus
  { id: 4, at: [10.389, 55.3954] }, // Skt. Knuds Kirke
  { id: 5, at: [10.3825, 55.4069] }, // Odense Havnebad
  { id: 6, at: [10.3764, 55.3721] }, // Fruens Bøge
  { id: 7, at: [10.3736, 55.3771] }, // Odense Zoo
  { id: 8, at: [10.3835, 55.3654] }, // Den Fynske Landsby
];

/** Wild level bands from GDD "World: Odense districts and progression". */
const LEVELS: Record<number, [number, number]> = {
  1: [3, 8],
  2: [8, 14],
  3: [13, 20],
  4: [19, 26],
  5: [25, 32],
  6: [31, 38],
  7: [37, 44],
  8: [43, 50],
};

const bbox = REGION.bbox;
const d1 = turf.polygon([DISTRICT_1]);
const points = turf.featureCollection(SEEDS.map((s) => turf.point(s.at, { id: s.id })));
const cells = turf.voronoi(points, { bbox });
const features: Feature<Polygon | MultiPolygon>[] = [];
SEEDS.forEach((s, i) => {
  let geom: Feature<Polygon | MultiPolygon> | null;
  if (s.id === 1) geom = d1;
  else {
    const cell = cells.features[i]!;
    geom = turf.difference(turf.featureCollection([cell, d1]));
  }
  if (!geom) throw new Error(`district ${s.id} vanished`);
  geom.properties = { id: s.id, wildLevels: LEVELS[s.id], draft: s.id !== 1 };
  features.push(turf.truncate(geom, { precision: 5 }) as Feature<Polygon | MultiPolygon>);
});

const out = fileURLToPath(
  new URL('../../../packages/data/content/districts.odense.geojson', import.meta.url),
);
writeFileSync(out, JSON.stringify(turf.featureCollection(features), null, 1) + '\n');
console.log(`wrote ${features.length} districts to ${out}`);
