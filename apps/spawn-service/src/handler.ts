import { REGION_IDS, regions, type RegionFile, type RegionId } from '@oml/data';
import odenseJson from '@oml/data/region/odense/region.json';
import svendborgJson from '@oml/data/region/svendborg/region.json';
import {
  computeAliveSpawns,
  SPAWN_LIFE_WINDOWS,
  decodeRegion,
  spawnRulesVersion,
  windowEnd,
  windowOf,
  type Region,
  type ServiceVersions,
} from '@oml/spawn';
import { getResolution, isValidCell } from 'h3-js';

export interface Env {
  /** HMAC key for window seeds. Set with `wrangler secret put SPAWN_SECRET`; never in the repo. */
  SPAWN_SECRET?: string;
  /** Optional Workers rate-limiting binding (see wrangler.toml). */
  RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

/** Origins allowed to read responses (the live site and local development). */
const ALLOWED_ORIGINS = [
  /^https:\/\/www\.christianrasmussen\.dk$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];
/** The only query parameters accepted: nothing that could carry a precise position. */
const ALLOWED_PARAMS = new Set(['region', 'cell', 'window']);

/** Each region's file and spawn tables (P27); a request names its region, never mixed. */
const FILES: Record<RegionId, RegionFile> = {
  odense: odenseJson as unknown as RegionFile,
  svendborg: svendborgJson as unknown as RegionFile,
};
const decoded = new Map<RegionId, Region>();
/** Decoded on the first request for the region (keeps the Worker's start-up short). */
function regionFor(id: string): Region | null {
  if (!(REGION_IDS as readonly string[]).includes(id)) return null;
  const rid = id as RegionId;
  let r = decoded.get(rid);
  if (!r) decoded.set(rid, (r = decodeRegion(FILES[rid])));
  return r;
}

/**
 * What this deployment runs for a region: the region-data hash and the spawn-rules version.
 * Returned in every response so the client can detect a Worker deployed from a different commit.
 */
export function versionsFor(region: RegionId): ServiceVersions {
  return {
    regionData: FILES[region].dataVersion,
    spawnRules: spawnRulesVersion(regions[region].spawns),
  };
}
/** Odense's (the first region). */
export const VERSIONS: ServiceVersions = versionsFor('odense');

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (origin && ALLOWED_ORIGINS.some((re) => re.test(origin))) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

/** Seed = HMAC-SHA256(secret, "region|window") as hex. */
export async function windowSeed(secret: string, region: string, window: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${region}|${window}`),
  );
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * GET /v1/spawns?region=odense&cell=<H3 res-7>&window=current|next
 * Returns the spawns for every res-10 cell inside the res-7 cell. Nothing about the request
 * is logged or stored. `nowSeconds` is passed in so tests can pin the clock.
 */
export async function handle(request: Request, env: Env, nowSeconds: number): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json(405, { error: 'method not allowed' }, cors);

  const url = new URL(request.url);
  if (url.pathname !== '/v1/spawns') return json(404, { error: 'not found' }, cors);
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_PARAMS.has(key))
      return json(400, { error: `unexpected parameter "${key}"` }, cors);
  }

  const regionId = url.searchParams.get('region') ?? '';
  const region = regionFor(regionId);
  if (!region) return json(400, { error: 'unknown region' }, cors);

  const cell = url.searchParams.get('cell') ?? '';
  if (!isValidCell(cell) || getResolution(cell) !== region.coarseRes) {
    return json(400, { error: `cell must be an H3 resolution-${region.coarseRes} cell` }, cors);
  }
  const cellIds = region.byCoarse.get(cell);
  if (!cellIds) return json(400, { error: 'cell is outside the region' }, cors);

  const current = windowOf(nowSeconds);
  const w = url.searchParams.get('window') ?? 'current';
  const window = w === 'current' ? current : w === 'next' ? current + 1 : Number(w);
  if (!Number.isInteger(window) || (window !== current && window !== current + 1)) {
    return json(400, { error: 'only the current and the next window are served' }, cors);
  }

  if (env.RATE_LIMITER) {
    // The client IP is only used as an in-memory rate-limit key; it is never logged or stored.
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success)
      return json(429, { error: 'too many requests' }, { ...cors, 'Retry-After': '60' });
  }

  if (!env.SPAWN_SECRET) return json(500, { error: 'spawn service not configured' }, cors);
  // the spawns alive in this window were made in the last SPAWN_LIFE_WINDOWS windows
  const seeds = new Map<number, string>();
  for (let k = 0; k < SPAWN_LIFE_WINDOWS; k++)
    seeds.set(window - k, await windowSeed(env.SPAWN_SECRET, region.id, window - k));
  const spawns = computeAliveSpawns({
    region,
    spawnTables: regions[region.id as RegionId].spawns,
    seedFor: (w) => seeds.get(w)!,
    window,
    cellIds,
  });
  const expiresAt = windowEnd(window);
  return json(
    200,
    {
      region: region.id,
      cell,
      window,
      expiresAt,
      versions: versionsFor(region.id as RegionId),
      spawns,
    },
    {
      ...cors,
      'Cache-Control': `public, max-age=${Math.max(1, expiresAt - nowSeconds)}`,
    },
  );
}
