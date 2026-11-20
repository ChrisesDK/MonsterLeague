import { fileURLToPath } from 'node:url';
import { REGION } from './config';
import { buildQuery, fetchOverpass } from './overpass';

const cacheDir = fileURLToPath(new URL('../cache', import.meta.url));
await fetchOverpass(buildQuery(REGION.bbox), cacheDir, process.argv.includes('--refresh'));
