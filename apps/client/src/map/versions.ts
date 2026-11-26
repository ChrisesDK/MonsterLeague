import { regions, type RegionId } from '@oml/data';
import odenseVersion from '@oml/data/region/odense/version.json';
import svendborgVersion from '@oml/data/region/svendborg/version.json';
import { spawnRulesVersion, versionMismatch, type ServiceVersions } from '@oml/spawn';

const REGION_VERSIONS: Record<RegionId, { dataVersion: string }> = {
  odense: odenseVersion,
  svendborg: svendborgVersion,
};

/**
 * What this client build expects the spawn service to run for a region (same code and data,
 * same commit).
 */
export function expectedVersions(region: RegionId = 'odense'): ServiceVersions {
  return {
    regionData: REGION_VERSIONS[region].dataVersion,
    spawnRules: spawnRulesVersion(regions[region].spawns),
  };
}
/** Odense's (kept for the dev map and tests). */
export const EXPECTED_VERSIONS: ServiceVersions = expectedVersions('odense');

const reported = new Set<string>();

/**
 * Compares the versions a spawn response reports with this build's. On a mismatch it logs
 * an error (once per distinct mismatch) and returns the differing fields; players never see
 * this, only the dev-tools map shows a small warning.
 */
export function checkServiceVersions(
  actual: Partial<ServiceVersions> | undefined,
  log: (msg: string, detail: unknown) => void = (m, d) => console.error(m, d),
  region: RegionId = 'odense',
): (keyof ServiceVersions)[] {
  const expected = expectedVersions(region);
  const fields = versionMismatch(expected, actual);
  if (fields.length) {
    const key = JSON.stringify(actual ?? null);
    if (!reported.has(key)) {
      reported.add(key);
      log(
        '[oml] spawn service version mismatch: client and Worker were built from different data or rules',
        {
          expected,
          actual: actual ?? null,
          fields,
        },
      );
    }
  }
  return fields;
}
