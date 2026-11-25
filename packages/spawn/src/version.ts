import type { Spawn as SpawnEntry } from '@oml/data';
import {
  DENSITY,
  DESTINATION_FACTOR,
  DESTINATION_RARE_BOOST,
  MAX_SPAWNS_PER_CELL,
  POSITION_RES,
  ROUTE_FACTOR,
  STREET_FACTOR,
  WILD_FACTOR,
  WINDOW_SECONDS,
  hash32,
} from './spawns';

/**
 * Bump when spawn *code* changes what spawns (counting, picking, positions, day/night…).
 * The golden test in test/version.test.ts fails until this is bumped and the golden
 * fingerprint is updated, so code changes can't slip through unversioned.
 */
export const SPAWN_ALGORITHM = 6;

/**
 * Version of the spawn rules: algorithm number + tunable numbers + spawn tables. The spawn
 * service returns it with every response; the client computes its own from the same code
 * and data, so a Worker deployed from a different commit is detected.
 */
export function spawnRulesVersion(spawnTables: readonly SpawnEntry[]): string {
  const fingerprint = JSON.stringify({
    algorithm: SPAWN_ALGORITHM,
    density: DENSITY,
    wildFactor: WILD_FACTOR,
    streetFactor: STREET_FACTOR,
    routeFactor: ROUTE_FACTOR,
    destinationFactor: DESTINATION_FACTOR,
    destinationRareBoost: DESTINATION_RARE_BOOST,
    maxPerCell: MAX_SPAWNS_PER_CELL,
    window: WINDOW_SECONDS,
    positionRes: POSITION_RES,
    tables: spawnTables,
  });
  const a = hash32(fingerprint).toString(16).padStart(8, '0');
  return `a${SPAWN_ALGORITHM}-${a}`;
}

/** Versions the spawn service reports, and the client expects. */
export interface ServiceVersions {
  regionData: string;
  spawnRules: string;
}

/** Fields that differ between what the service runs and what the client expects. */
export function versionMismatch(
  expected: ServiceVersions,
  actual: Partial<ServiceVersions> | undefined,
): (keyof ServiceVersions)[] {
  return (['regionData', 'spawnRules'] as const).filter((k) => actual?.[k] !== expected[k]);
}
