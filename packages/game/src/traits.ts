import { IV_MAX, mixSeed, Rng, seedRng, type Ivs } from '@oml/engine';

/**
 * Individual values and shiny creatures (owner request, GDD "Stats"). A wild creature's IVs
 * and colour are fixed per player and spawn: the same spawn always gives the same creature,
 * so leaving and coming back can't reroll it. Starters get IVs from the player seed too.
 */

/** One in this many wild creatures is shiny (about 400 creatures seen per campaign). */
export const SHINY_RATE = 256;

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function rngFor(playerSeed: string, key: string): Rng {
  return new Rng(seedRng(mixSeed(hashString(playerSeed), hashString(key), 0x1e5)));
}

function rollIvs(rng: Rng): Ivs {
  return { hp: rng.int(0, IV_MAX), atk: rng.int(0, IV_MAX), def: rng.int(0, IV_MAX) };
}

/** The IVs and colour of a wild spawn for this player. */
export function wildTraits(playerSeed: string, spawnId: string): { ivs: Ivs; shiny: boolean } {
  const rng = rngFor(playerSeed, `wild:${spawnId}`);
  const ivs = rollIvs(rng);
  return { ivs, shiny: rng.next() * SHINY_RATE < 1 };
}

/** The IVs of a creature the player is given (a starter, the tutorial creature). */
export function givenIvs(playerSeed: string, key: string): Ivs {
  return rollIvs(rngFor(playerSeed, `given:${key}`));
}

/** IV total as a share of the best possible (0–1), for a simple rating in the UI. */
export function ivShare(ivs: Ivs | undefined): number | null {
  return ivs ? (ivs.hp + ivs.atk + ivs.def) / (3 * IV_MAX) : null;
}
