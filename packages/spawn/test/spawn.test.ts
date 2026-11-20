import { readFileSync } from 'node:fs';
import { content, RegionFileSchema, type RegionFile, type Spawn as SpawnEntry } from '@oml/data';
import { latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import {
  WINDOW_SECONDS,
  cellDensity,
  computeSpawns,
  decodeRegion,
  entryWeight,
  isNight,
  seedWords,
  spawnId,
  sunTimes,
  windowEnd,
  windowOf,
} from '../src/index';

const file = RegionFileSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../data/region/region.odense.json', import.meta.url), 'utf8'),
  ),
);
const region = decodeRegion(file);
const tables = content.spawns;
const SEED = 'a3f1c2d4e5b60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9';
// 2026-11-20 12:00 UTC (day) and 23:00 UTC (night) in Odense.
const NOON = windowOf(Date.UTC(2026, 10, 20, 12, 0) / 1000);
const NIGHT = windowOf(Date.UTC(2026, 10, 20, 23, 0) / 1000);
const d12 = [...region.cells.values()].filter((c) => c.district <= 2).map((c) => c.id);

describe('windows and ids', () => {
  it('cuts time into 15-minute windows', () => {
    expect(windowOf(0)).toBe(0);
    expect(windowOf(899)).toBe(0);
    expect(windowOf(900)).toBe(1);
    expect(windowEnd(5)).toBe(6 * WINDOW_SECONDS);
  });

  it('has stable, distinct spawn ids and seed words', () => {
    expect(spawnId('odense', 1, 'x', 0)).toBe(spawnId('odense', 1, 'x', 0));
    expect(spawnId('odense', 1, 'x', 0)).not.toBe(spawnId('odense', 2, 'x', 0));
    expect(spawnId('odense', 1, 'x', 0)).toMatch(/^[0-9a-f]{16}$/);
    expect(seedWords(SEED)).toEqual([0xa3f1c2d4, 0xe5b60718, 0x293a4b5c, 0x6d7e8f90]);
    expect(seedWords('short')).toHaveLength(4);
  });
});

describe('computeSpawns', () => {
  const run = (seed = SEED, window = NOON, cellIds = d12) =>
    computeSpawns({ region, spawnTables: tables, seed, window, cellIds });

  it('is deterministic for the same seed, window and cells', () => {
    const a = run();
    expect(a.length).toBeGreaterThan(50);
    expect(run()).toEqual(a);
    // Order of the requested cells doesn't change any spawn.
    const b = run(SEED, NOON, [...d12].reverse());
    expect(new Map(b.map((s) => [s.id, s]))).toEqual(new Map(a.map((s) => [s.id, s])));
    expect(run('0'.repeat(64))).not.toEqual(a);
    expect(run(SEED, NOON + 1)).not.toEqual(a);
  });

  it('never spawns in noSpawn cells or outside spawn-table districts', () => {
    const noSpawn = [...region.cells.values()].filter((c) => c.noSpawn).map((c) => c.id);
    expect(noSpawn.length).toBeGreaterThan(100);
    expect(run(SEED, NOON, noSpawn)).toEqual([]);
    const d8 = [...region.cells.values()].filter((c) => c.district === 8).map((c) => c.id);
    expect(run(SEED, NOON, d8)).toEqual([]);
    expect(run(SEED, NOON, ['8a1f00000000fff', 'not-a-cell'])).toEqual([]);
  });

  it('places spawns inside their cell, within the district level band, expiring at window end', () => {
    for (const s of run()) {
      expect(latLngToCell(s.lat, s.lng, 10)).toBe(s.cellId);
      const band = region.districts.get(region.cells.get(s.cellId)!.district)!.wildLevels;
      expect(s.level).toBeGreaterThanOrEqual(band[0]);
      expect(s.level).toBeLessThanOrEqual(band[1]);
      expect(s.expiresAt).toBe(windowEnd(NOON));
      expect(content.species[s.speciesId]).toBeDefined();
    }
  });

  it('switches species between day and night', () => {
    const day = new Set(run(SEED, NOON).map((s) => s.speciesId));
    const night = new Set(run(SEED, NIGHT).map((s) => s.speciesId));
    expect(day.has('lygtling')).toBe(false);
    expect(night.has('lygtling')).toBe(true);
  });

  it('marks spawns that need a field ability', () => {
    const many = Array.from({ length: 40 }, (_, w) => run(SEED, NOON + w)).flat();
    const req = many.filter((s) => s.requires);
    expect(req.length).toBeGreaterThan(0);
    for (const s of req) expect(['runereader', 'angler']).toContain(s.requires);
  });
});

describe('species mix follows biome weights', () => {
  // A synthetic two-cell region in district 2: one pure water cell, one pure urban cell.
  const water = latLngToCell(55.3908, 10.3833, 10);
  const urban = latLngToCell(55.3915, 10.3895, 10);
  const synthetic: RegionFile = {
    ...file,
    cells: {
      [water]: [2, 0, 100, 0, 0, 0, 0, 0, 0, 0],
      [urban]: [2, 0, 0, 0, 0, 0, 0, 100, 0, 0],
    },
  };
  const r = decodeRegion(synthetic);

  function observed(cell: string): Map<string, number> {
    const counts = new Map<string, number>();
    for (let w = 0; w < 4000; w++) {
      for (const s of computeSpawns({
        region: r,
        spawnTables: tables,
        seed: SEED,
        window: NOON + w * 96,
        cellIds: [cell],
      })) {
        counts.set(s.speciesId, (counts.get(s.speciesId) ?? 0) + 1);
      }
    }
    return counts;
  }

  for (const [name, cell] of [
    ['water', water],
    ['urban', urban],
  ] as const) {
    it(`${name} cell: frequencies match weight × biome preference (fixed seed)`, () => {
      const c = r.cells.get(cell)!;
      const counts = observed(cell);
      const n = [...counts.values()].reduce((a, b) => a + b, 0);
      expect(n).toBeGreaterThan(2000);
      // Day windows only (every 96th window = same time of day as NOON).
      const entries = tables.filter((e: SpawnEntry) => e.district === 2 && e.time !== 'night');
      const total = entries.reduce((a, e) => a + entryWeight(e, c), 0);
      for (const e of entries) {
        const expected = entryWeight(e, c) / total;
        const got = (counts.get(e.species) ?? 0) / n;
        if (expected === 0) expect(got).toBe(0);
        else
          expect(Math.abs(got - expected)).toBeLessThan(
            0.03 + 3 * Math.sqrt((expected * (1 - expected)) / n),
          );
      }
    });
  }

  it('density follows the biome mix and is 0 when noSpawn', () => {
    expect(cellDensity(r.cells.get(water)!)).toBeGreaterThan(cellDensity(r.cells.get(urban)!));
    expect(cellDensity({ ...r.cells.get(water)!, noSpawn: true })).toBe(0);
  });
});

describe('sun times for Odense', () => {
  const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12) / 1000;
  const hhmm = (s: number | null) => new Date(s! * 1000).toISOString().slice(11, 16);
  it('matches published times within 5 minutes (UTC)', () => {
    // References: published Copenhagen times shifted by Odense's longitude (+8.7 min).
    const close = (s: number | null, h: number, m: number) =>
      expect(Math.abs(s! - (Math.floor(s! / 86400) * 86400 + h * 3600 + m * 60))).toBeLessThan(
        5 * 60,
      );
    const june = sunTimes(at(2026, 6, 21), 55.39, 10.385);
    const march = sunTimes(at(2026, 3, 20), 55.39, 10.385);
    const dec = sunTimes(at(2026, 12, 21), 55.39, 10.385);
    close(june.sunrise, 2, 34);
    close(june.sunset, 20, 6);
    close(march.sunrise, 5, 22);
    close(march.sunset, 17, 29);
    close(dec.sunrise, 7, 46);
    close(dec.sunset, 14, 47);
    expect(hhmm(dec.sunrise) < hhmm(dec.sunset)).toBe(true);
  });

  it('isNight follows sunrise and sunset', () => {
    expect(isNight(Date.UTC(2026, 10, 20, 12) / 1000, 55.39, 10.385)).toBe(false);
    expect(isNight(Date.UTC(2026, 10, 20, 17) / 1000, 55.39, 10.385)).toBe(true);
    expect(isNight(Date.UTC(2026, 10, 20, 5) / 1000, 55.39, 10.385)).toBe(true);
    expect(sunTimes(Date.UTC(2026, 5, 21) / 1000, 89, 0).sunrise).toBe(null);
    expect(isNight(Date.UTC(2026, 5, 21) / 1000, 89, 0)).toBe(false);
  });
});
