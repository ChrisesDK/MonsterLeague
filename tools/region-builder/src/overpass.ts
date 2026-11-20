import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
/** Generic client name: no personal details in requests (CLAUDE.md privacy rules). */
const USER_AGENT =
  'OdenseMonsterLeague-region-builder/0.1 (+https://github.com/chrisesdk/OdenseMonsterLeague)';

/** One Overpass QL query for everything the biome and noSpawn classification needs. */
export function buildQuery([west, south, east, north]: [number, number, number, number]): string {
  const b = `(${south},${west},${north},${east})`;
  const landuse =
    'forest|meadow|grass|village_green|farmland|orchard|allotments|residential|retail|commercial|' +
    'industrial|port|harbour|railway|reservoir|basin|cemetery|military|recreation_ground';
  return `[out:json][timeout:240][maxsize:536870912];
(
  wr["natural"~"^(water|wood|grassland|heath|scrub|bay)$"]${b};
  wr["water"]${b};
  way["waterway"~"^(river|stream|canal|riverbank|dock)$"]${b};
  relation["waterway"="riverbank"]${b};
  wr["landuse"~"^(${landuse})$"]${b};
  wr["leisure"~"^(park|garden)$"]${b};
  nwr["historic"]${b};
  nwr["amenity"~"^(school|kindergarten|childcare|hospital|grave_yard)$"]${b};
  nwr["healthcare"="hospital"]${b};
  nwr["military"]${b};
  nwr["aeroway"="aerodrome"]${b};
  way["railway"="rail"]${b};
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link)$"]${b};
);
out body;
>;
out skel qt;`;
}

/**
 * Runs the query, or returns the cached response if the same query ran before. The cache
 * lives in tools/region-builder/cache/ (gitignored), so re-runs work offline and don't
 * load the public Overpass servers again.
 */
export async function fetchOverpass(
  query: string,
  cacheDir: string,
  refresh = false,
): Promise<unknown> {
  const key = createHash('sha256').update(query).digest('hex').slice(0, 16);
  const file = join(cacheDir, `overpass-${key}.json`);
  if (!refresh && existsSync(file)) {
    console.log(`Overpass: using cache ${file}`);
    return JSON.parse(readFileSync(file, 'utf8'));
  }
  console.log('Overpass: fetching (one request; this can take a minute)…');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: new URLSearchParams({ data: query }),
  });
  if (res.status === 429 || res.status === 504) {
    throw new Error(`Overpass is busy (HTTP ${res.status}). Wait a few minutes and run again.`);
  }
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, text);
  console.log(`Overpass: cached ${(text.length / 1e6).toFixed(1)} MB to ${file}`);
  return JSON.parse(text);
}
