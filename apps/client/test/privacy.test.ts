import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getResolution, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { coarseCellsAround } from '../src/map/geo';
import { fetchSpawnList, serviceUrl, spawnRequestUrl } from '../src/map/spawnApi';

/**
 * GDD privacy rule: the only thing sent to a server is a coarse H3 resolution-7 cell.
 * These tests fail if the client ever sends more than that.
 */
const PLAYER = { lat: 55.399812, lng: 10.385234 }; // a precise position near Kongens Have

describe('spawn requests carry only a res-7 cell', () => {
  it('builds requests from the player position without any coordinates', async () => {
    const sent: string[] = [];
    const fakeFetch = (async (url: string) => {
      sent.push(url);
      return new Response(
        JSON.stringify({ region: 'odense', cell: '', window: 1, expiresAt: 9, spawns: [] }),
      );
    }) as unknown as typeof fetch;
    for (const cell of coarseCellsAround(PLAYER)) {
      for (const w of ['current', 'next'] as const)
        await fetchSpawnList('https://svc.test', cell, w, fakeFetch);
    }
    expect(sent.length).toBeGreaterThanOrEqual(2);
    for (const url of sent) {
      const u = new URL(url);
      expect([...u.searchParams.keys()].sort()).toEqual(['cell', 'region', 'window']);
      expect(getResolution(u.searchParams.get('cell')!)).toBe(7);
      expect(url).not.toMatch(/55\.39|10\.38|lat|lng|lon/);
      expect(u.pathname).toBe('/v1/spawns');
    }
  });

  it('refuses to send a finer cell', () => {
    const fine = latLngToCell(PLAYER.lat, PLAYER.lng, 10);
    expect(() => spawnRequestUrl('https://svc.test', fine, 'current')).toThrow(/res-7/);
    expect(() => spawnRequestUrl('https://svc.test', 'nonsense', 'current')).toThrow();
  });

  it('no client module except src/map/spawnApi.ts makes network calls', () => {
    const root = fileURLToPath(new URL('../src', import.meta.url));
    const NETWORK = /\bfetch\s*\(|sendBeacon|XMLHttpRequest|new\s+WebSocket|new\s+EventSource/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && NETWORK.test(readFileSync(p, 'utf8')))
          offenders.push(p);
      }
    };
    walk(root);
    const rel = offenders.map((p) => p.split(/[\\/]src[\\/]/)[1]!.replace(/\\/g, '/'));
    expect(rel.filter((p) => p !== 'map/spawnApi.ts')).toEqual([]);
  });

  it('uses the build-time service URL, or localhost in dev, else none', () => {
    expect(serviceUrl({ VITE_SPAWN_SERVICE_URL: 'https://x.workers.dev/', DEV: false })).toBe(
      'https://x.workers.dev',
    );
    expect(serviceUrl({ DEV: true })).toBe('http://localhost:8787');
    expect(serviceUrl({ DEV: false })).toBe(null);
  });
});
