import { SELF } from 'cloudflare:test';
import { cellToChildren, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { content, regions } from '@oml/data';
import regionVersion from '@oml/data/region/odense/version.json';
import svendborgVersion from '@oml/data/region/svendborg/version.json';
import { spawnRulesVersion } from '@oml/spawn';
import { handle, windowSeed, type Env } from '../src/handler';

const KONGENS_HAVE = latLngToCell(55.3998, 10.3852, 7);
const URL0 = `https://spawns.test/v1/spawns?region=odense&cell=${KONGENS_HAVE}`;
const ORIGIN = 'https://www.christianrasmussen.dk';
const nowWindow = () => Math.floor(Date.now() / 1000 / 900);
const get = (url: string, origin = ORIGIN) => SELF.fetch(url, { headers: { Origin: origin } });

describe('GET /v1/spawns', () => {
  it('returns the same spawns for the same request', async () => {
    const a = await get(`${URL0}&window=current`);
    expect(a.status).toBe(200);
    const body = (await a.json()) as {
      spawns: { id: string; cellId: string }[];
      window: number;
      expiresAt: number;
    };
    const b = (await (await get(`${URL0}&window=current`)).json()) as typeof body;
    expect(b).toEqual(body);
    expect(body.spawns.length).toBeGreaterThan(0);
    // Every spawn lies in a res-10 cell inside the requested res-7 cell.
    const inside = new Set(cellToChildren(KONGENS_HAVE, 10));
    for (const s of body.spawns) expect(inside.has(s.cellId)).toBe(true);
    expect(body.expiresAt).toBe((body.window + 1) * 900);
    const maxAge = Number(/max-age=(\d+)/.exec(a.headers.get('Cache-Control') ?? '')?.[1]);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(900);
  });

  it('reports its region-data and spawn-rules versions (what the client expects)', async () => {
    const body = (await (await get(`${URL0}&window=current`)).json()) as {
      versions: { regionData: string; spawnRules: string };
    };
    expect(body.versions).toEqual({
      regionData: regionVersion.dataVersion,
      spawnRules: spawnRulesVersion(content.spawns),
    });
  });

  it('serves each region from its own data, never mixed (P27)', async () => {
    const harbour = latLngToCell(55.06, 10.615, 7); // Svendborg harbour
    const r = await get(
      `https://spawns.test/v1/spawns?region=svendborg&cell=${harbour}&window=current`,
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      region: string;
      spawns: { speciesId: string }[];
      versions: { regionData: string; spawnRules: string };
    };
    expect(body.region).toBe('svendborg');
    expect(body.versions).toEqual({
      regionData: svendborgVersion.dataVersion,
      spawnRules: spawnRulesVersion(regions.svendborg.spawns),
    });
    for (const s of body.spawns) expect(regions.svendborg.species[s.speciesId]).toBeDefined();
    // an Odense cell is outside Svendborg, and the other way round
    const wrong = `https://spawns.test/v1/spawns?region=svendborg&cell=${KONGENS_HAVE}&window=current`;
    expect((await get(wrong)).status).toBe(400);
    const wrong2 = `https://spawns.test/v1/spawns?region=odense&cell=${harbour}&window=current`;
    expect((await get(wrong2)).status).toBe(400);
  });

  it('serves the next window, and numeric current/next windows', async () => {
    const next = (await (await get(`${URL0}&window=next`)).json()) as { window: number };
    expect(next.window).toBe(nowWindow() + 1);
    expect((await get(`${URL0}&window=${nowWindow()}`)).status).toBe(200);
  });

  it('rejects past and far-future windows', async () => {
    expect((await get(`${URL0}&window=${nowWindow() - 1}`)).status).toBe(400);
    expect((await get(`${URL0}&window=${nowWindow() + 2}`)).status).toBe(400);
    expect((await get(`${URL0}&window=yesterday`)).status).toBe(400);
  });

  it('rejects bad cells, other regions and position-like parameters', async () => {
    const res10 = latLngToCell(55.3998, 10.3852, 10);
    const outside = latLngToCell(55.676, 12.568, 7); // Copenhagen
    for (const url of [
      `https://spawns.test/v1/spawns?region=odense&cell=${res10}&window=current`,
      `https://spawns.test/v1/spawns?region=odense&cell=nope&window=current`,
      `https://spawns.test/v1/spawns?region=odense&cell=${outside}&window=current`,
      `https://spawns.test/v1/spawns?region=aarhus&cell=${KONGENS_HAVE}&window=current`,
      `${URL0}&window=current&lat=55.39&lng=10.38`,
    ]) {
      expect((await get(url)).status, url).toBe(400);
    }
    expect((await get('https://spawns.test/v1/other')).status).toBe(404);
    expect((await SELF.fetch(URL0, { method: 'POST' })).status).toBe(405);
  });

  it('allows only the live site and localhost origins (CORS)', async () => {
    const ok = await get(`${URL0}&window=current`);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const local = await get(`${URL0}&window=current`, 'http://localhost:5173');
    expect(local.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    const evil = await get(`${URL0}&window=current`, 'https://evil.example');
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBe(null);
    const pre = await SELF.fetch(URL0, { method: 'OPTIONS', headers: { Origin: ORIGIN } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });
});

describe('handler (pinned clock)', () => {
  const T = 1_800_000_000; // a fixed time
  const req = (w: string) => new Request(`${URL0}&window=${w}`);
  const env: Env = { SPAWN_SECRET: 'secret-a' };

  it('derives the seed with HMAC-SHA256(secret, region|window)', async () => {
    const seed = await windowSeed('secret-a', 'odense', 2_000_000);
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    expect(await windowSeed('secret-a', 'odense', 2_000_000)).toBe(seed);
    expect(await windowSeed('secret-b', 'odense', 2_000_000)).not.toBe(seed);
    expect(await windowSeed('secret-a', 'odense', 2_000_001)).not.toBe(seed);
  });

  it('different secrets give different spawns; a missing secret is an error', async () => {
    const a = await (await handle(req('current'), env, T)).json();
    const b = await (await handle(req('current'), { SPAWN_SECRET: 'secret-b' }, T)).json();
    expect(a).not.toEqual(b);
    expect((await handle(req('current'), {}, T)).status).toBe(500);
  });

  it('expires cache at the end of the requested window', async () => {
    const res = await handle(req('next'), env, T);
    const body = (await res.json()) as { window: number; expiresAt: number };
    expect(body.window).toBe(Math.floor(T / 900) + 1);
    expect(res.headers.get('Cache-Control')).toBe(`public, max-age=${body.expiresAt - T}`);
  });

  it('applies the rate limiter when bound', async () => {
    const limited: Env = { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } };
    expect((await handle(req('current'), limited, T)).status).toBe(429);
  });
});
