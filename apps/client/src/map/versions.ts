import { content } from '@oml/data';
import regionVersion from '@oml/data/region/odense.version.json';
import { spawnRulesVersion, versionMismatch, type ServiceVersions } from '@oml/spawn';

/** What this client build expects the spawn service to run (same code and data, same commit). */
export const EXPECTED_VERSIONS: ServiceVersions = {
  regionData: regionVersion.dataVersion,
  spawnRules: spawnRulesVersion(content.spawns),
};

const reported = new Set<string>();

/**
 * Compares the versions a spawn response reports with this build's. On a mismatch it logs
 * an error (once per distinct mismatch) and returns the differing fields; players never see
 * this, only the dev-tools map shows a small warning.
 */
export function checkServiceVersions(
  actual: Partial<ServiceVersions> | undefined,
  log: (msg: string, detail: unknown) => void = (m, d) => console.error(m, d),
): (keyof ServiceVersions)[] {
  const fields = versionMismatch(EXPECTED_VERSIONS, actual);
  if (fields.length) {
    const key = JSON.stringify(actual ?? null);
    if (!reported.has(key)) {
      reported.add(key);
      log(
        '[oml] spawn service version mismatch: client and Worker were built from different data or rules',
        {
          expected: EXPECTED_VERSIONS,
          actual: actual ?? null,
          fields,
        },
      );
    }
  }
  return fields;
}
