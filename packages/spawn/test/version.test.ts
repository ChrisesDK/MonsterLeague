import { readFileSync } from 'node:fs';
import { content, RegionFileSchema, type Spawn as SpawnEntry } from '@oml/data';
import { latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import {
  SPAWN_ALGORITHM,
  computeSpawns,
  decodeRegion,
  hash32,
  spawnRulesVersion,
  versionMismatch,
} from '../src/index';

const file = RegionFileSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../data/region/region.odense.json', import.meta.url), 'utf8'),
  ),
);

/**
 * Golden output of the spawn code for a fixed synthetic region and fixed tables (so data
 * edits don't affect it). If spawn code changes behaviour, this fails: bump SPAWN_ALGORITHM
 * in src/version.ts and add the new fingerprint here.
 */
const GOLDEN: Record<number, string> = { 2: 'e07e871f' };

describe('spawn rules version', () => {
  const tables: SpawnEntry[] = [
    { species: 'torvdue', district: 1, weight: 10, biomes: { urban: 1, park: 1 }, time: 'any' },
    { species: 'mosbille', district: 1, weight: 5, biomes: { park: 2 }, time: 'day' },
    { species: 'lygtling', district: 1, weight: 5, biomes: { park: 1 }, time: 'night' },
  ];
  const a = latLngToCell(55.3998, 10.3852, 10);
  const b = latLngToCell(55.3962, 10.3805, 10);
  const region = decodeRegion({
    ...file,
    cells: { [a]: [1, 0, 0, 0, 80, 0, 0, 20, 0, 0], [b]: [1, 0, 0, 0, 0, 0, 0, 100, 0, 0, 7] },
  });

  it('golden spawn output matches the current SPAWN_ALGORITHM', () => {
    const out = [];
    for (let w = 0; w < 200; w += 7) {
      out.push(
        computeSpawns({
          region,
          spawnTables: tables,
          seed: 'golden',
          window: 1_994_600 + w,
          cellIds: [a, b],
        }),
      );
    }
    const fingerprint = hash32(JSON.stringify(out)).toString(16).padStart(8, '0');
    expect(
      fingerprint,
      `spawn output changed: bump SPAWN_ALGORITHM and set GOLDEN[${SPAWN_ALGORITHM + 1}]`,
    ).toBe(GOLDEN[SPAWN_ALGORITHM]);
  });

  it('changes when tables change and is stable otherwise', () => {
    const v = spawnRulesVersion(content.spawns);
    expect(v).toMatch(/^a\d+-[0-9a-f]{8}$/);
    expect(spawnRulesVersion(content.spawns)).toBe(v);
    expect(spawnRulesVersion([...content.spawns.slice(1)])).not.toBe(v);
  });

  it('reports mismatched fields (missing versions count as mismatched)', () => {
    const want = { regionData: 'abc', spawnRules: 'a2-1' };
    expect(versionMismatch(want, { ...want })).toEqual([]);
    expect(versionMismatch(want, { regionData: 'abc', spawnRules: 'a1-0' })).toEqual([
      'spawnRules',
    ]);
    expect(versionMismatch(want, undefined)).toEqual(['regionData', 'spawnRules']);
  });
});
