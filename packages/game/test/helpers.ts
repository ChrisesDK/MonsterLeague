import { createCreature } from '@oml/engine';
import type { SaveGame } from '../src/index';

export * from '../src/index';

/** Adds a creature to the team (tests only). */
export function addCreatureForTest(s: SaveGame, speciesId: string, level: number): SaveGame {
  return {
    ...s,
    nextUid: s.nextUid + 1,
    team: [...s.team, createCreature(speciesId, level, `p${s.nextUid}`)],
  };
}
