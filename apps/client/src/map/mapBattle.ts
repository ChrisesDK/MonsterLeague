import { createBattle, createCreature, type BattleState } from '@oml/engine';
import { playerSide } from '../playtest/plan';
import type { ApiSpawn } from './spawnApi';

/**
 * A wild battle against a map spawn. Until M2b adds saves, the player uses a temporary dev
 * team: the arena-1 expected team with the fire starter, plus the playtest charms.
 */
export function battleForSpawn(
  spawn: ApiSpawn,
  seed = Math.floor(Math.random() * 2 ** 31),
): BattleState {
  return createBattle(
    {
      kind: 'wild',
      sides: [
        playerSide(1, 'fire'),
        { team: [createCreature(spawn.speciesId, spawn.level, 'w0')], ai: 'wild' },
      ],
    },
    seed,
  );
}

const KEY = 'oml.map.battle.v1';

export interface SavedMapBattle {
  spawnId: string;
  expiresAt: number;
  state: BattleState;
}

export function saveMapBattle(b: SavedMapBattle | null): void {
  try {
    if (b) localStorage.setItem(KEY, JSON.stringify(b));
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function loadMapBattle(): SavedMapBattle | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedMapBattle) : null;
  } catch {
    return null;
  }
}
