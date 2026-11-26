import { content, type Dex, type Move } from '@oml/data';
import { AVERAGE_IVS, calcHp } from './stats';
import type { CreatureInstance } from './types';

export const MAX_MOVES = 4;

/** Strength used to rank damaging moves: power × accuracy (never-miss counts as 100%). */
export function moveStrength(move: Move): number {
  return (move.power * (move.accuracy ?? 100)) / 100;
}

/**
 * Picks which (at most 4) moves a creature keeps when nobody chooses for it (AI, wild,
 * sim, newly created creatures). `moveIds` is in learn order, oldest first.
 *
 * 1. For each type, the strongest damaging move (ties: the later-learned one).
 * 2. Those, strongest first, fill up to 4 slots.
 * 3. Free slots go to non-damaging moves, newest first.
 * 4. Any slots still free go to the remaining damaging moves, strongest first.
 *
 * The result is returned in learn order so the move list stays stable.
 */
export function autoMoveset(moveIds: readonly string[], dex: Dex = content): string[] {
  const unique = moveIds.filter((id, i) => moveIds.indexOf(id) === i && dex.moves[id]);
  const order = new Map(unique.map((id, i) => [id, i]));
  const bestPerType = new Map<string, string>();
  for (const id of unique) {
    const move = dex.moves[id]!;
    if (move.power === 0) continue;
    const current = bestPerType.get(move.type);
    if (!current || moveStrength(move) >= moveStrength(dex.moves[current]!)) {
      bestPerType.set(move.type, id);
    }
  }
  const damaging = [...bestPerType.values()]
    .sort(
      (a, b) =>
        moveStrength(dex.moves[b]!) - moveStrength(dex.moves[a]!) || order.get(b)! - order.get(a)!,
    )
    .slice(0, MAX_MOVES);
  const support = unique
    .filter((id) => dex.moves[id]!.power === 0)
    .reverse()
    .slice(0, MAX_MOVES - damaging.length);
  const keep = new Set([...damaging, ...support]);
  const rest = unique
    .filter((id) => !keep.has(id))
    .sort(
      (a, b) =>
        moveStrength(dex.moves[b]!) - moveStrength(dex.moves[a]!) || order.get(b)! - order.get(a)!,
    );
  for (const id of rest) {
    if (keep.size >= MAX_MOVES) break;
    keep.add(id);
  }
  return unique.filter((id) => keep.has(id));
}

/**
 * Outside battle: learn `moveId`, forgetting the move at `forgetIndex` (or appending when
 * fewer than 4 moves are known). Returns a new creature; the input is not changed.
 */
export function learnMove(
  creature: CreatureInstance,
  moveId: string,
  forgetIndex: number | null,
  dex: Dex = content,
): CreatureInstance {
  const move = dex.moves[moveId];
  if (!move) throw new Error(`Unknown move "${moveId}"`);
  if (creature.moves.some((m) => m.moveId === moveId)) return creature;
  const moves = creature.moves.map((m) => ({ ...m }));
  const slot = { moveId, pp: move.pp };
  if (forgetIndex === null) {
    const slots = MAX_MOVES - (creature.fieldAbility ? 1 : 0);
    if (moves.length >= slots)
      throw new Error(`Already knows ${slots} moves: choose one to forget`);
    moves.push(slot);
  } else {
    if (!moves[forgetIndex]) throw new Error(`No move at index ${forgetIndex}`);
    moves[forgetIndex] = slot;
  }
  return { ...creature, moves };
}

/** Whether the creature has reached its evolution level. */
export function canEvolve(creature: CreatureInstance, dex: Dex = content): boolean {
  const evolution = dex.species[creature.speciesId]?.evolution;
  return !!evolution && creature.level >= evolution.level && !!dex.species[evolution.into];
}

/**
 * Outside battle: evolves the creature into its next stage. Damage taken is kept (as with
 * level-ups), moves, level, XP and status are unchanged. Returns a new creature.
 */
export function evolveCreature(creature: CreatureInstance, dex: Dex = content): CreatureInstance {
  if (!canEvolve(creature, dex)) throw new Error(`${creature.speciesId} cannot evolve yet`);
  const from = dex.species[creature.speciesId]!;
  const to = dex.species[from.evolution!.into]!;
  const oldMax = calcHp(from.baseStats.hp, creature.level, (creature.ivs ?? AVERAGE_IVS).hp);
  const newMax = calcHp(to.baseStats.hp, creature.level, (creature.ivs ?? AVERAGE_IVS).hp);
  const hp = creature.hp > 0 ? Math.max(1, Math.min(newMax, creature.hp + newMax - oldMax)) : 0;
  return { ...creature, speciesId: to.id, hp, moves: creature.moves.map((m) => ({ ...m })) };
}
