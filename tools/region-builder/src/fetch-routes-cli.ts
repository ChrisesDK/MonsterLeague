import { fileURLToPath } from 'node:url';
import { REGION } from './config';
import { buildFootQuery, buildLandmarkQuery, fetchOverpass } from './overpass';

const cacheDir = fileURLToPath(new URL('../cache', import.meta.url));
const refresh = process.argv.includes('--refresh');
await fetchOverpass(buildFootQuery(REGION.bbox), cacheDir, refresh);
const lm = (await fetchOverpass(buildLandmarkQuery(REGION.bbox), cacheDir, refresh)) as {
  elements: {
    type: string;
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags: Record<string, string>;
  }[];
};
for (const e of lm.elements)
  console.log(
    e.type,
    e.id,
    e.tags.name,
    e.tags.tourism ?? e.tags.leisure ?? e.tags.landuse ?? e.tags.natural ?? '',
    e.lat ?? e.center?.lat,
    e.lon ?? e.center?.lon,
  );
