import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Public Overpass servers, tried in turn when one is busy or times out (the main server was
 * often overloaded while the v4 region was fetched).
 */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
/** Generic client name: no personal details in requests (CLAUDE.md privacy rules). */
const USER_AGENT = 'MonsterLeague-region-builder/0.1 (+https://github.com/chrisesdk/MonsterLeague)';

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
  way["railway"~"^(rail|light_rail|tram)$"]${b};
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
  /** Full rounds over all servers before giving up. */
  rounds = 6,
): Promise<unknown> {
  const key = createHash('sha256').update(query).digest('hex').slice(0, 16);
  const file = join(cacheDir, `overpass-${key}.json`);
  if (!refresh && existsSync(file)) {
    console.log(`Overpass: using cache ${file}`);
    return JSON.parse(readFileSync(file, 'utf8'));
  }
  console.log('Overpass: fetching (one request; this can take a minute)…');
  // Overpass asks clients to back off when busy: on 429/502/503/504 or a time-out, try the
  // next server, and wait 20, 40, 80 … s after each full round.
  let text: string | null = null;
  let last = '';
  for (let attempt = 0; attempt < rounds * ENDPOINTS.length && text === null; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length]!;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(300_000),
      });
      const body = await res.text();
      if (res.ok && body.startsWith('{')) text = body;
      else if (!res.ok && ![429, 502, 503, 504].includes(res.status))
        throw new Error(`Overpass HTTP ${res.status}: ${body.slice(0, 300)}`);
      else last = `HTTP ${res.status}`;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Overpass HTTP')) throw e;
      last = e instanceof Error ? e.message : String(e);
    }
    if (text !== null) break;
    console.log(`Overpass: ${new URL(endpoint).host} busy (${last})`);
    if ((attempt + 1) % ENDPOINTS.length === 0) {
      const wait = 20 * 2 ** Math.floor(attempt / ENDPOINTS.length);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
  if (text === null) throw new Error(`Overpass: every server busy (${last})`);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, text);
  console.log(`Overpass: cached ${(text.length / 1e6).toFixed(1)} MB to ${file}`);
  return JSON.parse(text);
}

type Bbox = [number, number, number, number];
interface OsmElement {
  type: string;
  id: number;
}

/**
 * Runs `build(tile)` for an `nx × ny` grid of tiles over `bbox` and merges the answers
 * (elements de-duplicated by type and id). Each tile is cached on its own, so a large area
 * (Odense Kommune, v4 region) can be fetched from a busy public server in small steps and a
 * failed tile is the only one that needs a retry. A tile the servers keep refusing (the
 * dense city centre) is split into four, up to twice.
 */
export async function fetchOverpassTiled(
  build: (tile: Bbox) => string,
  [west, south, east, north]: Bbox,
  nx: number,
  ny: number,
  cacheDir: string,
  refresh = false,
): Promise<{ elements: OsmElement[]; osm3s?: { timestamp_osm_base?: string } }> {
  const seen = new Set<string>();
  const elements: OsmElement[] = [];
  let osm3s: { timestamp_osm_base?: string } | undefined;
  const w = (east - west) / nx;
  const h = (north - south) / ny;
  for (let iy = 0; iy < ny; iy++)
    for (let ix = 0; ix < nx; ix++) {
      const tile: Bbox = [
        +(west + ix * w).toFixed(5),
        +(south + iy * h).toFixed(5),
        +(west + (ix + 1) * w).toFixed(5),
        +(south + (iy + 1) * h).toFixed(5),
      ];
      console.log(`Overpass tile ${iy * nx + ix + 1}/${nx * ny}: ${tile.join(', ')}`);
      for (const part of await fetchTile(build, tile, cacheDir, refresh, 0)) {
        osm3s ??= part.osm3s;
        for (const e of part.elements) {
          const k = `${e.type}/${e.id}`;
          if (seen.has(k)) continue;
          seen.add(k);
          elements.push(e);
        }
      }
    }
  return { elements, osm3s };
}

type TilePart = { elements: OsmElement[]; osm3s?: { timestamp_osm_base?: string } };
async function fetchTile(
  build: (tile: Bbox) => string,
  tile: Bbox,
  cacheDir: string,
  refresh: boolean,
  depth: number,
): Promise<TilePart[]> {
  try {
    return [(await fetchOverpass(build(tile), cacheDir, refresh, depth < 2 ? 2 : 6)) as TilePart];
  } catch (e) {
    if (depth >= 2) throw e;
    const [w, s, east, n] = tile;
    const mx = +((w + east) / 2).toFixed(5);
    const my = +((s + n) / 2).toFixed(5);
    console.log(`Overpass: splitting ${tile.join(', ')} into four`);
    const parts: TilePart[] = [];
    for (const q of [
      [w, s, mx, my],
      [mx, s, east, my],
      [w, my, mx, n],
      [mx, my, east, n],
    ] as Bbox[])
      parts.push(...(await fetchTile(build, q, cacheDir, refresh, depth + 1)));
    return parts;
  }
}

/** Walkable ways for the route builder (M2d): footpaths, park paths, streets with pavements. */
export function buildFootQuery([west, south, east, north]: [
  number,
  number,
  number,
  number,
]): string {
  const b = `(${south},${west},${north},${east})`;
  const kinds =
    'footway|path|pedestrian|cycleway|track|bridleway|steps|living_street|residential|service|' +
    'unclassified|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link';
  return `[out:json][timeout:240][maxsize:536870912];
way["highway"~"^(${kinds})$"]${b};
out body;
>;
out skel qt;`;
}

/** Named landmarks used as arena sites for the routes (M2d). */
export function buildLandmarkQuery([west, south, east, north]: [
  number,
  number,
  number,
  number,
]): string {
  const b = `(${south},${west},${north},${east})`;
  return `[out:json][timeout:120];
nwr["name"~"^(H\\.? ?C\\.? Andersens Hus|Munke Mose|Odense Zoo|Fruens Bøge|Den Fynske Landsby|Havnebadet|Klosterhaven|Kongens Have)"]${b};
out center tags;`;
}
