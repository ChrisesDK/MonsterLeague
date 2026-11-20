import { content, type Dex } from '@oml/data';
import {
  canEvolve,
  evolveCreature,
  learnMove,
  type BattleEvent,
  type CreatureInstance,
} from '@oml/engine';

/** A decision the player makes after the battle. */
export type PostBattleChoice =
  { kind: 'learn'; uid: string; moveId: string } | { kind: 'evolve'; uid: string; into: string };

/**
 * Collects the player's (side 0) move-learn choices and evolution prompts from battle
 * events, in order. Duplicates are dropped (evolution_ready repeats on every level-up).
 */
export function collectChoices(
  events: readonly BattleEvent[],
  existing: readonly PostBattleChoice[] = [],
): PostBattleChoice[] {
  const out = [...existing];
  const has = (c: PostBattleChoice) =>
    out.some(
      (x) =>
        x.kind === c.kind &&
        x.uid === c.uid &&
        (c.kind === 'evolve' || (x.kind === 'learn' && x.moveId === c.moveId)),
    );
  for (const e of events) {
    if (!('side' in e) || e.side !== 0) continue;
    let choice: PostBattleChoice | null = null;
    if (e.type === 'move_learn_choice') choice = { kind: 'learn', uid: e.uid, moveId: e.moveId };
    if (e.type === 'evolution_ready') choice = { kind: 'evolve', uid: e.uid, into: e.into };
    if (choice && !has(choice)) out.push(choice);
  }
  return out;
}

/**
 * Applies the player's answer to the team (outside battle). `answer` is the index of the
 * move to forget (learn), true/false (evolve), or null to skip. Returns a new team.
 */
export function applyChoice(
  team: readonly CreatureInstance[],
  choice: PostBattleChoice,
  answer: number | boolean | null,
  dex: Dex = content,
): CreatureInstance[] {
  return team.map((c) => {
    if (c.uid !== choice.uid) return c;
    if (choice.kind === 'learn') {
      return typeof answer === 'number' ? learnMove(c, choice.moveId, answer, dex) : c;
    }
    return answer === true && canEvolve(c, dex) ? evolveCreature(c, dex) : c;
  });
}
