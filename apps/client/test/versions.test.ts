import { content } from '@oml/data';
import regionVersion from '@oml/data/region/odense.version.json';
import { spawnRulesVersion } from '@oml/spawn';
import { describe, expect, it } from 'vitest';
import { EXPECTED_VERSIONS, checkServiceVersions } from '../src/map/versions';

describe('spawn service version check', () => {
  it('expects the region-data hash and spawn-rules version of this build', () => {
    expect(EXPECTED_VERSIONS).toEqual({
      regionData: regionVersion.dataVersion,
      spawnRules: spawnRulesVersion(content.spawns),
    });
  });

  it('is silent when versions match', () => {
    const logs: unknown[] = [];
    expect(checkServiceVersions({ ...EXPECTED_VERSIONS }, (...a) => logs.push(a))).toEqual([]);
    expect(logs).toEqual([]);
  });

  it('logs an error once per distinct mismatch and returns the fields', () => {
    const logs: unknown[] = [];
    const log = (...a: unknown[]) => logs.push(a);
    const old = { regionData: '000000000000', spawnRules: EXPECTED_VERSIONS.spawnRules };
    expect(checkServiceVersions(old, log)).toEqual(['regionData']);
    expect(checkServiceVersions(old, log)).toEqual(['regionData']);
    expect(logs).toHaveLength(1);
    expect(checkServiceVersions(undefined, log)).toEqual(['regionData', 'spawnRules']);
    expect(logs).toHaveLength(2);
  });
});
