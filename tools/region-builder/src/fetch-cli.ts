import { fileURLToPath } from 'node:url';
import { REGION } from './config';
import { buildFootQuery, buildQuery, fetchOverpassTiled } from './overpass';

/** Fetches (or refreshes) the cached Overpass tiles for the region and the route builder. */
const cacheDir = fileURLToPath(new URL('../cache', import.meta.url));
const refresh = process.argv.includes('--refresh');
const [nx, ny] = REGION.tiles;
await fetchOverpassTiled(buildQuery, REGION.bbox, nx, ny, cacheDir, refresh);
await fetchOverpassTiled(buildFootQuery, REGION.bbox, nx, ny, cacheDir, refresh);
