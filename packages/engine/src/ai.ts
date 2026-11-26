import { content, FALLBACK_MOVE_ID, type Dex } from '@oml/data';
import {
  effectiveStat,
  getActive,
  getLegalActions,
  getMaxHp,
  getMove,
  getSpecies,
  getStats,
  inReplacementPhase,
  isFainted,
} from './battle';
import { expectedDamage, typeEffectiveness } from './damage';
import { mixSeed, Rng, seedRng } from './rng';
import type { Action, AiTier, BattleState, CreatureInstance, SideIndex, TypeId } from './types';

export const TRAINER_RANDOM_CHANCE = 0.2;
export const LEADER_HEAL_THRESHOLD = 0.3;
export const LEADER_MAX_HEALS = 2;
export const SETUP_HP_THRESHOLD = 0.7;
export const TRAINER_SETUP_CHANCE = 0.5;
/** Heal moves are used below this share of HP (trainers, leaders and wild creatures). */
export const HEAL_MOVE_THRESHOLD = 0.5;
/** Moves that lower the target's stats are used above this share of HP. */
export const LOWER_HP_THRESHOLD = 0.5;
/** A wild creature low on HP uses a heal move it knows this often. */
export const WILD_HEAL_CHANCE = 0.5;
export const WILD_HEAL_THRESHOLD = 0.35;

type MoveData = ReturnType<typeof getMove>;
/** A move that only heals (no damage, no stat change). */
const isHealMove = (m: MoveData) =>
  m.power === 0 &&
  m.effects.some((e) => e.kind === 'heal') &&
  !m.effects.some((e) => e.kind === 'stat');
/** The stats a no-damage move lowers on the target. */
const lowers = (m: MoveData) =>
  m.power !== 0
    ? []
    : m.effects.flatMap((e) =>
        e.kind === 'stat' && e.target === 'target' && e.stages < 0 ? [e] : [],
      );

/**
 * Set-up rule (leaders always, trainers 50% of the time):
 * 1. a heal move, if HP is below 50%;
 * 2. a stat-boost move, if HP > 70%, none of the stats it raises is boosted yet, and the
 *    opponent cannot KO us next turn (its best expected damage is below our HP);
 * 3. a move that lowers the target's stats, if HP > 50% and none of those stats is lowered
 *    yet;
 * 4. otherwise a status-inflicting move, if the target has no status.
 */
export function setupAction(
  state: BattleState,
  side: SideIndex,
  legal: Action[],
  dex: Dex = content,
): Action | null {
  const active = getActive(state, side);
  const oppSide: SideIndex = side === 0 ? 1 : 0;
  const opponent = getActive(state, oppSide);
  if (isFainted(opponent) || active.moves.every((m) => m.pp <= 0)) return null;
  const stages = state.sides[side].stages;
  const candidates = legal.flatMap((a) =>
    a.type === 'move' ? [{ action: a, move: getMove(active.moves[a.index]!.moveId, dex) }] : [],
  );

  const hpShare = active.hp / getMaxHp(active, dex);
  if (hpShare < HEAL_MOVE_THRESHOLD) {
    const heal = candidates.find(({ move }) => isHealMove(move));
    if (heal) return heal.action;
  }
  const healthy = hpShare > SETUP_HP_THRESHOLD;
  if (healthy) {
    const threat = Math.max(
      0,
      ...opponent.moves
        .filter((m) => m.pp > 0)
        .map((m) => expectedMoveDamage(state, oppSide, m.moveId, dex)),
    );
    if (threat < active.hp) {
      const boost = candidates.find(({ move }) => {
        if (move.power !== 0) return false;
        const raises = move.effects.flatMap((e) =>
          e.kind === 'stat' && e.target === 'self' && e.stages > 0 ? [e] : [],
        );
        return raises.length > 0 && raises.every((e) => stages[e.stat] <= 0);
      });
      if (boost) return boost.action;
    }
  }

  if (hpShare > LOWER_HP_THRESHOLD) {
    const oppStages = state.sides[oppSide].stages;
    const lower = candidates.find(({ move }) => {
      const l = lowers(move);
      return l.length > 0 && l.every((e) => oppStages[e.stat] >= 0);
    });
    if (lower) return lower.action;
  }

  if (opponent.status === null) {
    const status = candidates.find(
      ({ move }) => move.power === 0 && move.effects.some((e) => e.kind === 'status'),
    );
    if (status) return status.action;
  }
  return null;
}

/**
 * An RNG stream derived from (but not advancing) the battle RNG, so AI choices are
 * deterministic for a given state without consuming the battle's random numbers.
 */
function aiRng(state: BattleState, side: SideIndex): Rng {
  return new Rng(seedRng(mixSeed(...state.rngState, state.turn, side, 0xa1)));
}

/** Expected damage of a move by `side`'s active creature against the opposing active one. */
export function expectedMoveDamage(
  state: BattleState,
  side: SideIndex,
  moveId: string,
  dex: Dex = content,
  attacker: CreatureInstance = getActive(state, side),
): number {
  const defSide: SideIndex = side === 0 ? 1 : 0;
  const defender = getActive(state, defSide);
  if (isFainted(defender)) return 0;
  const move = getMove(moveId, dex);
  const attackerTypes = getSpecies(attacker.speciesId, dex).types;
  const isActive = attacker.uid === getActive(state, side).uid;
  return expectedDamage(
    {
      level: attacker.level,
      power: move.power,
      // A creature on the bench has neutral stages.
      atk: isActive ? effectiveStat(state, side, 'atk', dex) : getStats(attacker, dex).atk,
      def: effectiveStat(state, defSide, 'def', dex),
      stab: !move.typeless && attackerTypes.includes(move.type),
      typeMul: move.typeless
        ? 1
        : typeEffectiveness(move.type, getSpecies(defender.speciesId, dex).types, dex),
      burned: attacker.status === 'burn',
    },
    move.accuracy,
  );
}

function bestDamageMove(state: BattleState, side: SideIndex, moves: Action[], dex: Dex): Action {
  const active = getActive(state, side);
  const outOfPp = active.moves.every((m) => m.pp <= 0);
  let best = moves[0]!;
  let bestScore = -1;
  for (const action of moves) {
    if (action.type !== 'move') continue;
    const moveId = outOfPp ? FALLBACK_MOVE_ID : active.moves[action.index]!.moveId;
    const score = expectedMoveDamage(state, side, moveId, dex);
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }
  return best;
}

/** Highest multiplier any of the attacker's own types deals to the defender types. */
function worstCaseMultiplier(
  attackerTypes: readonly TypeId[],
  defenderTypes: readonly TypeId[],
  dex: Dex,
): number {
  return Math.max(...attackerTypes.map((t) => typeEffectiveness(t, defenderTypes, dex)));
}

/** Team index to send out when the active creature has fainted (AI sides). Deterministic. */
export function chooseReplacement(state: BattleState, side: SideIndex, dex: Dex = content): number {
  const team = state.sides[side].team;
  const candidates = team
    .map((c, index) => ({ c, index }))
    .filter(({ c, index }) => c.hp > 0 && index !== state.sides[side].active);
  if (candidates.length === 0) throw new Error(`Side ${side} has no creature to send out`);
  const tier = state.sides[side].ai;
  const defender = getActive(state, side === 0 ? 1 : 0);
  if (tier === 'wild' || isFainted(defender)) return candidates[0]!.index;

  let best = candidates[0]!.index;
  let bestScore = -Infinity;
  for (const { c, index } of candidates) {
    const dmg = Math.max(
      0,
      ...c.moves.map((m) => expectedMoveDamage(state, side, m.moveId, dex, c)),
    );
    const threat = worstCaseMultiplier(
      getSpecies(defender.speciesId, dex).types,
      getSpecies(c.speciesId, dex).types,
      dex,
    );
    const score = dmg / getMaxHp(defender, dex) - 0.25 * threat;
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Wild creatures pick a move at random, but not one that would do nothing (a heal at more
 * than half HP, lowering a stat that is already down by 2, raising one already up by 2), and
 * a wild creature low on HP heals with a move it knows half of the time.
 */
function wildAction(
  state: BattleState,
  side: SideIndex,
  moves: Action[],
  rng: Rng,
  dex: Dex,
): Action {
  const active = getActive(state, side);
  if (active.moves.every((m) => m.pp <= 0)) return rng.pick(moves);
  const hpShare = active.hp / getMaxHp(active, dex);
  const own = state.sides[side].stages;
  const opp = state.sides[side === 0 ? 1 : 0].stages;
  const withMove = moves.flatMap((a) =>
    a.type === 'move' ? [{ a, m: getMove(active.moves[a.index]!.moveId, dex) }] : [],
  );
  const heals = withMove.filter(({ m }) => isHealMove(m));
  if (hpShare < WILD_HEAL_THRESHOLD && heals.length > 0 && rng.next() < WILD_HEAL_CHANCE)
    return heals[0]!.a;
  const useful = withMove.filter(({ m }) => {
    if (isHealMove(m)) return hpShare <= HEAL_MOVE_THRESHOLD;
    if (m.power !== 0) return true;
    const l = lowers(m);
    if (l.length > 0) return l.some((e) => opp[e.stat] > -2);
    const raises = m.effects.flatMap((e) =>
      e.kind === 'stat' && e.target === 'self' && e.stages > 0 ? [e] : [],
    );
    if (raises.length > 0 && !m.effects.some((e) => e.kind !== 'stat'))
      return raises.some((e) => own[e.stat] < 2);
    return true;
  });
  return rng.pick(useful.length > 0 ? useful.map((x) => x.a) : moves);
}

export function chooseAiAction(
  state: BattleState,
  side: SideIndex,
  tier: AiTier,
  dex: Dex = content,
): Action {
  const legal = getLegalActions(state, side, dex);
  if (legal.length === 0) throw new Error('No legal actions: the battle is over');

  if (inReplacementPhase(state)) {
    if (!state.sides[side].needsReplacement) return { type: 'pass' };
    return { type: 'switch', index: chooseReplacement(state, side, dex) };
  }

  const rng = aiRng(state, side);
  const moves = legal.filter((a) => a.type === 'move');

  if (tier === 'wild') return wildAction(state, side, moves, rng, dex);

  if (tier === 'trainer') {
    if (rng.next() < TRAINER_RANDOM_CHANCE) return rng.pick(moves);
    if (rng.next() < TRAINER_SETUP_CHANCE) {
      const setup = setupAction(state, side, moves, dex);
      if (setup) return setup;
    }
    return bestDamageMove(state, side, moves, dex);
  }

  // Leader
  const sideState = state.sides[side];
  const active = getActive(state, side);
  const opponent = getActive(state, side === 0 ? 1 : 0);

  if (
    active.hp / getMaxHp(active, dex) < LEADER_HEAL_THRESHOLD &&
    sideState.itemsUsed < LEADER_MAX_HEALS
  ) {
    let bestHeal: Action | null = null;
    let bestAmount = 0;
    for (const a of legal) {
      if (a.type !== 'item' || a.target !== sideState.active) continue;
      const item = dex.items[a.itemId];
      if (item?.kind === 'heal' && item.amount > bestAmount) {
        bestHeal = a;
        bestAmount = item.amount;
      }
    }
    if (bestHeal) return bestHeal;
  }

  const opponentTypes = getSpecies(opponent.speciesId, dex).types;
  const disadvantaged =
    worstCaseMultiplier(opponentTypes, getSpecies(active.speciesId, dex).types, dex) >= 2;
  if (disadvantaged) {
    for (const a of legal) {
      if (a.type !== 'switch') continue;
      const mate = sideState.team[a.index]!;
      const resists =
        worstCaseMultiplier(opponentTypes, getSpecies(mate.speciesId, dex).types, dex) <= 0.5;
      if (resists) return a;
    }
  }

  return setupAction(state, side, moves, dex) ?? bestDamageMove(state, side, moves, dex);
}
