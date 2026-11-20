import type { Dex } from '@oml/data';
import { calcHp, MAX_LEVEL } from './stats';
import type { BattleEvent, CreatureInstance, SideIndex } from './types';

import { autoMoveset, MAX_MOVES } from './moves';

export { MAX_MOVES };
export const TRAINER_XP_MULTIPLIER = 1.5;

/** Total XP needed to reach level n: n³. */
export function xpForLevel(level: number): number {
  return level ** 3;
}

/** Highest level whose XP threshold has been reached (capped at MAX_LEVEL). */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level++;
  return level;
}

/**
 * XP each participant gains when an opposing creature faints:
 * floor(baseXp × faintedLevel × (1.5 in trainer/leader battles) / 7 / participants)
 */
export function xpYield(
  baseXp: number,
  faintedLevel: number,
  participants: number,
  trainerBattle: boolean,
): number {
  if (participants <= 0) return 0;
  const mul = trainerBattle ? TRAINER_XP_MULTIPLIER : 1;
  return Math.floor((baseXp * faintedLevel * mul) / 7 / participants);
}

/**
 * Adds XP to a creature (mutates the given draft), handling level-ups, stat/HP recalculation
 * (damage taken is kept), learnset moves and evolution readiness. Returns the events.
 *
 * With 4 moves known, a human (`autoLearn` false) gets a `move_learn_choice` event; an AI
 * side (`autoLearn` true) keeps whatever `autoMoveset` prefers.
 */
export function gainXp(
  creature: CreatureInstance,
  amount: number,
  side: SideIndex,
  dex: Dex,
  autoLearn = false,
): BattleEvent[] {
  const events: BattleEvent[] = [];
  const species = dex.species[creature.speciesId];
  if (!species || amount <= 0) return events;
  const uid = creature.uid;
  creature.xp += amount;
  events.push({ type: 'xp_gain', side, uid, amount, xp: creature.xp });

  const target = levelForXp(creature.xp);
  while (creature.level < target) {
    const oldMax = calcHp(species.baseStats.hp, creature.level);
    creature.level += 1;
    const newMax = calcHp(species.baseStats.hp, creature.level);
    if (creature.hp > 0) creature.hp = Math.min(newMax, creature.hp + (newMax - oldMax));
    events.push({
      type: 'level_up',
      side,
      uid,
      level: creature.level,
      hp: creature.hp,
      maxHp: newMax,
    });

    for (const entry of species.learnset) {
      if (entry.level !== creature.level) continue;
      if (creature.moves.some((m) => m.moveId === entry.moveId)) continue;
      const move = dex.moves[entry.moveId];
      if (!move) continue;
      // A taught field ability occupies one of the 4 slots (GDD).
      const slots = MAX_MOVES - (creature.fieldAbility ? 1 : 0);
      if (creature.moves.length < slots) {
        creature.moves.push({ moveId: move.id, pp: move.pp });
        events.push({ type: 'move_learned', side, uid, moveId: move.id });
      } else if (autoLearn) {
        const keep = autoMoveset([...creature.moves.map((m) => m.moveId), move.id], dex);
        const dropIndex = creature.moves.findIndex((m) => !keep.includes(m.moveId));
        if (dropIndex >= 0 && keep.includes(move.id)) {
          const replaced = creature.moves[dropIndex]!.moveId;
          creature.moves[dropIndex] = { moveId: move.id, pp: move.pp };
          events.push({ type: 'move_learned', side, uid, moveId: move.id, replaced });
        }
      } else {
        events.push({ type: 'move_learn_choice', side, uid, moveId: move.id });
      }
    }

    if (species.evolution && creature.level >= species.evolution.level) {
      events.push({
        type: 'evolution_ready',
        side,
        uid,
        speciesId: species.id,
        into: species.evolution.into,
      });
    }
  }
  return events;
}
