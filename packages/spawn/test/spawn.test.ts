import { readFileSync } from 'node:fs';
import { content, RegionFileSchema, type RegionFile, type Spawn as SpawnEntry } from '@oml/data';
import { cellToChildren, cellToLatLng, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import {
  WINDOW_SECONDS,
  cellDensity,
  DESTINATION_FACTOR,
  DESTINATION_RARE_BOOST,
  ROUTE_FACTOR,
  STREET_FACTOR,
  WILD_FACTOR,
  computeSpawns,
  decodeRegion,
  entryWeight,
  isBlocked,
  isNight,
  positionsInside,
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

  it('never spawns in noSpawn cells; every district has its own table (GDD v1.7)', () => {
    const noSpawn = [...region.cells.values()].filter((c) => c.noSpawn).map((c) => c.id);
    expect(noSpawn.length).toBeGreaterThan(100);
    expect(run(SEED, NOON, noSpawn)).toEqual([]);
    const d8 = [...region.cells.values()].filter((c) => c.district === 8).map((c) => c.id);
    const harbour = run(SEED, NOON, d8);
    expect(harbour.length).toBeGreaterThan(0);
    const d8species = new Set(content.spawns.filter((e) => e.district === 8).map((e) => e.species));
    for (const s of harbour) {
      expect(s.district).toBe(8);
      expect(d8species.has(s.speciesId)).toBe(true);
    }
    expect(run(SEED, NOON, ['8a1f00000000fff', 'not-a-cell'])).toEqual([]);
  });

  it('places spawns inside their cell with rarity, a level roll and the district, expiring at window end', () => {
    for (const s of run()) {
      expect(latLngToCell(s.lat, s.lng, 10)).toBe(s.cellId);
      expect(s.district).toBe(region.cells.get(s.cellId)!.district);
      expect(['common', 'rare']).toContain(s.rarity);
      expect(s.levelRoll).toBeGreaterThanOrEqual(0);
      expect(s.levelRoll).toBeLessThan(1);
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
    for (const s of req) expect(['runereader', 'angler', 'forager']).toContain(s.requires);
  });
});

describe('blocked positions (GDD P10, P11)', () => {
  const rounded = (c: string) =>
    cellToLatLng(c)
      .map((v) => Math.round(v * 1e6) / 1e6)
      .join(',');

  it('never places a spawn on a blocked position', () => {
    const partly = [...region.cells.values()].filter(
      (c) => c.blockedMask > 0 && !c.noSpawn && c.district <= 2,
    );
    expect(partly.length).toBeGreaterThan(5);
    let checked = 0;
    for (let w = 0; w < 60; w++) {
      const spawns = computeSpawns({
        region,
        spawnTables: tables,
        seed: SEED,
        window: NOON + w,
        cellIds: partly.map((c) => c.id),
      });
      for (const s of spawns) {
        const cell = region.cells.get(s.cellId)!;
        const index = cellToChildren(s.cellId, 12).findIndex(
          (c) => rounded(c) === `${s.lat},${s.lng}`,
        );
        expect(index).toBeGreaterThanOrEqual(0);
        expect(isBlocked(cell.blockedMask, index)).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('skips a cell whose every position is blocked', () => {
    const water = latLngToCell(55.3908, 10.3833, 10);
    const all = 2 ** 49 - 1;
    const r = decodeRegion({
      ...file,
      cells: { [water]: [2, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, all] },
    });
    expect(positionsInside(water, all)).toEqual([]);
    for (let w = 0; w < 50; w++) {
      expect(
        computeSpawns({
          region: r,
          spawnTables: tables,
          seed: SEED,
          window: NOON + w,
          cellIds: [water],
        }),
      ).toEqual([]);
    }
  });

  it('reads mask bits exactly up to bit 48', () => {
    expect(isBlocked(2 ** 48, 48)).toBe(true);
    expect(isBlocked(2 ** 48, 47)).toBe(false);
    expect(isBlocked(5, 0)).toBe(true);
    expect(isBlocked(5, 1)).toBe(false);
    expect(isBlocked(5, 2)).toBe(true);
  });
});

describe('species mix follows biome weights', () => {
  // A synthetic two-cell region in district 2: one pure water cell, one pure urban cell.
  const water = latLngToCell(55.3908, 10.3833, 10);
  const urban = latLngToCell(55.3915, 10.3895, 10);
  const synthetic: RegionFile = {
    ...file,
    cells: {
      [water]: [2, 0, 2 | 4, 100, 0, 0, 0, 0, 0, 0, 0], // wild water edge
      [urban]: [2, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0],
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
      expect(n).toBeGreaterThan(1500);
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

  it('decodes the region flags (v3 bit field)', () => {
    const w = r.cells.get(water)!;
    expect([w.noSpawn, w.wild, w.waterEdge, w.route]).toEqual([false, true, true, false]);
    const u = r.cells.get(urban)!;
    expect([u.noSpawn, u.wild, u.waterEdge, u.route]).toEqual([false, false, false, false]);
  });

  it('D167: destinations > wild areas > route corridors > streets with the same mix', () => {
    const street = r.cells.get(urban)!;
    const base = cellDensity(street) / STREET_FACTOR;
    expect(cellDensity({ ...street, route: true })).toBeCloseTo(base * ROUTE_FACTOR);
    expect(cellDensity({ ...street, wild: true })).toBeCloseTo(base * WILD_FACTOR);
    expect(cellDensity({ ...street, wild: true, route: true })).toBeCloseTo(base * WILD_FACTOR);
    expect(cellDensity({ ...street, wild: true, destination: true })).toBeCloseTo(
      base * DESTINATION_FACTOR,
    );
    expect(DESTINATION_FACTOR / STREET_FACTOR).toBeGreaterThan(2.5);
    expect(DESTINATION_FACTOR).toBeGreaterThan(WILD_FACTOR);
    expect(WILD_FACTOR).toBeGreaterThan(ROUTE_FACTOR);
    expect(ROUTE_FACTOR).toBeGreaterThan(STREET_FACTOR);
  });

  it('D167: destination-only entries need a destination; rare entries weigh more there', () => {
    const street = r.cells.get(urban)!;
    const shares = { ...street.shares, water: 0.5, urban: 0.5 };
    const town = { ...street, shares, destination: false };
    const lake = { ...street, shares, wild: true, destination: true };
    const entry = (over: Partial<SpawnEntry>): SpawnEntry => ({
      species: 'noekkeling',
      district: 1,
      weight: 2,
      rarity: 'common',
      biomes: { water: 2 },
      time: 'any',
      ...over,
    });
    expect(entryWeight(entry({ destinationOnly: true }), town)).toBe(0);
    expect(entryWeight(entry({ destinationOnly: true }), lake)).toBeCloseTo(2);
    expect(entryWeight(entry({ rarity: 'rare' }), lake)).toBeCloseTo(2 * DESTINATION_RARE_BOOST);
    expect(entryWeight(entry({ rarity: 'rare' }), town)).toBeCloseTo(2);
    expect(entryWeight(entry({}), lake)).toBeCloseTo(2);
  });

  it('D171: an entry with zones spawns only in those zones', () => {
    const street = r.cells.get(urban)!;
    const shares = { ...street.shares, water: 0.5, urban: 0.5 };
    const home = { ...street, shares, wild: true, destination: true, zone: 'tarupdavinde' };
    const other = { ...home, zone: 'sanderum' };
    const e: SpawnEntry = {
      species: 'noekkeling',
      district: 5,
      weight: 2,
      rarity: 'rare',
      biomes: { water: 2 },
      time: 'any',
      destinationOnly: true,
      zones: ['tarupdavinde'],
    };
    expect(entryWeight(e, home)).toBeGreaterThan(0);
    expect(entryWeight(e, other)).toBe(0);
  });

  it('D167: the region marks destinations in forest, field and lake zones only', () => {
    const kinds = new Map(Object.values(content.zones).map((z) => [z.id, z.kind]));
    let n = 0;
    for (const c of decodeRegion(file).cells.values())
      if (c.destination) {
        n++;
        expect(['wild', 'water']).toContain(kinds.get(c.zone));
      }
    expect(n).toBeGreaterThan(1000);
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
