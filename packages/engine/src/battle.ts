import { content, FALLBACK_MOVE_ID, type Dex, type Move, type Species } from '@oml/data';
import { chooseReplacement } from './ai';
import { catchChance } from './catch';
import { CRIT_CHANCE, RANDOM_MIN, computeDamage, typeEffectiveness } from './damage';
import { Rng, seedRng } from './rng';
import { calcStats, clampStage, stageMultiplier } from './stats';
import type {
  Action,
  BattleConfig,
  BattleEvent,
  BattleResult,
  BattleState,
  CreatureInstance,
  Side,
  SideIndex,
  StageStat,
  Stats,
  Status,
  TurnResult,
} from './types';
import { clone } from './util';
import { autoMoveset } from './moves';
import { gainXp, xpForLevel, xpYield } from './xp';

/** Safety valve: a battle still running after this many turns is decided on remaining HP. */
export const MAX_TURNS = 150;
/** Party size; a creature caught with a full party goes to storage. */
export const MAX_TEAM_SIZE = 6;
export const RUN_BASE_CHANCE = 50;
export const RUN_CHANCE_PER_FAILURE = 25;
export const PARALYSIS_SKIP_CHANCE = 25;
export const BURN_DAMAGE_FRACTION = 1 / 16;
export const POISON_DAMAGE_FRACTION = 1 / 8;

const other = (side: SideIndex): SideIndex => (side === 0 ? 1 : 0);

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function getSpecies(speciesId: string, dex: Dex = content): Species {
  const s = dex.species[speciesId];
  if (!s) throw new Error(`Unknown species "${speciesId}"`);
  return s;
}

export function getMove(moveId: string, dex: Dex = content): Move {
  const m = dex.moves[moveId];
  if (!m) throw new Error(`Unknown move "${moveId}"`);
  return m;
}

export function getStats(creature: CreatureInstance, dex: Dex = content): Stats {
  return calcStats(getSpecies(creature.speciesId, dex).baseStats, creature.level);
}

export function getMaxHp(creature: CreatureInstance, dex: Dex = content): number {
  return getStats(creature, dex).hp;
}

export function getActive(state: BattleState, side: SideIndex): CreatureInstance {
  const s = state.sides[side];
  return s.team[s.active]!;
}

/** Stat with stage multiplier applied (and paralysis halving speed). Burn is applied in damage. */
export function effectiveStat(
  state: BattleState,
  side: SideIndex,
  stat: StageStat,
  dex: Dex = content,
): number {
  const creature = getActive(state, side);
  let value = getStats(creature, dex)[stat] * stageMultiplier(state.sides[side].stages[stat]);
  if (stat === 'spd' && creature.status === 'paralysis') value /= 2;
  return value;
}

export function isFainted(creature: CreatureInstance): boolean {
  return creature.hp <= 0;
}

function hasUsable(side: Side): boolean {
  return side.team.some((c) => c.hp > 0);
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface CreateCreatureOptions {
  moves?: string[];
  nickname?: string;
}

/** Creates a fresh creature at full HP knowing the last 4 learnset moves up to its level. */
export function createCreature(
  speciesId: string,
  level: number,
  uid: string,
  dex: Dex = content,
  options: CreateCreatureOptions = {},
): CreatureInstance {
  const species = getSpecies(speciesId, dex);
  let moveIds = options.moves;
  if (!moveIds) {
    const known: string[] = [];
    for (const entry of species.learnset) {
      if (entry.level > level || known.includes(entry.moveId)) continue;
      known.push(entry.moveId);
    }
    moveIds = autoMoveset(known, dex);
  }
  const creature: CreatureInstance = {
    uid,
    speciesId,
    level,
    xp: xpForLevel(level),
    hp: calcStats(species.baseStats, level).hp,
    status: null,
    statusTurns: 0,
    moves: moveIds.map((id) => ({ moveId: id, pp: getMove(id, dex).pp })),
  };
  if (options.nickname) creature.nickname = options.nickname;
  return creature;
}

function freshStages(): Side['stages'] {
  return { atk: 0, def: 0, spd: 0 };
}

export function createBattle(config: BattleConfig, seed: number, dex: Dex = content): BattleState {
  const sides = config.sides.map((sc, i): Side => {
    const team = clone(sc.team);
    if (team.length === 0) throw new Error(`Side ${i} has an empty team`);
    for (const c of team) {
      getSpecies(c.speciesId, dex);
      for (const m of c.moves) getMove(m.moveId, dex);
    }
    const active = team.findIndex((c) => c.hp > 0);
    if (active < 0) throw new Error(`Side ${i} has no usable creature`);
    return {
      ...(sc.name !== undefined ? { name: sc.name } : {}),
      team,
      active,
      stages: freshStages(),
      items: { ...(sc.items ?? {}) },
      ai: sc.ai ?? null,
      gainsXp: sc.gainsXp ?? i === 0,
      needsReplacement: false,
      itemsUsed: 0,
      runAttempts: 0,
    };
  }) as [Side, Side];
  if (config.kind === 'wild' && sides[1].team.length !== 1)
    throw new Error('A wild battle has exactly one wild creature on side 1');
  const uids = sides.flatMap((s) => s.team.map((c) => c.uid));
  if (new Set(uids).size !== uids.length) throw new Error('Creature uids must be unique');

  const state: BattleState = {
    turn: 0,
    rngState: seedRng(seed),
    sides,
    kind: config.kind,
    result: 'ongoing',
    participation: {},
  };
  markParticipation(state);
  return state;
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

export function inReplacementPhase(state: BattleState): boolean {
  return state.sides.some((s) => s.needsReplacement);
}

function switchActions(side: Side): Action[] {
  const out: Action[] = [];
  side.team.forEach((c, index) => {
    if (index !== side.active && c.hp > 0) out.push({ type: 'switch', index });
  });
  return out;
}

export function getLegalActions(
  state: BattleState,
  sideIndex: SideIndex,
  dex: Dex = content,
): Action[] {
  if (state.result !== 'ongoing') return [];
  const side = state.sides[sideIndex];

  if (inReplacementPhase(state)) {
    return side.needsReplacement ? switchActions(side) : [{ type: 'pass' }];
  }

  const actions: Action[] = [];
  const active = side.team[side.active]!;
  active.moves.forEach((m, index) => {
    if (m.pp > 0) actions.push({ type: 'move', index });
  });
  // Out of PP: the move action resolves to the fallback move.
  if (actions.length === 0) actions.push({ type: 'move', index: 0 });

  actions.push(...switchActions(side));

  for (const [itemId, count] of Object.entries(side.items)) {
    const item = dex.items[itemId];
    if (!item || count <= 0) continue;
    if (item.kind === 'heal' || item.kind === 'cure') {
      side.team.forEach((c, target) => {
        if (c.hp <= 0) return;
        if (item.kind === 'heal' && c.hp >= getMaxHp(c, dex)) return;
        if (item.kind === 'cure' && c.status === null) return;
        actions.push({ type: 'item', itemId, target });
      });
    } else if (item.kind === 'charm' && state.kind === 'wild' && sideIndex === 0) {
      actions.push({ type: 'catch', itemId });
    }
  }

  if (state.kind === 'wild' && sideIndex === 0) actions.push({ type: 'run' });
  return actions;
}

function actionKey(a: Action): string {
  switch (a.type) {
    case 'move':
    case 'switch':
      return `${a.type}:${a.index}`;
    case 'item':
      return `item:${a.itemId}:${a.target}`;
    case 'catch':
      return `catch:${a.itemId}`;
    default:
      return a.type;
  }
}

export function isLegalAction(
  state: BattleState,
  side: SideIndex,
  action: Action,
  dex: Dex = content,
): boolean {
  const key = actionKey(action);
  return getLegalActions(state, side, dex).some((a) => actionKey(a) === key);
}

// ---------------------------------------------------------------------------
// Turn resolution
// ---------------------------------------------------------------------------

interface Ctx {
  s: BattleState;
  dex: Dex;
  rng: Rng;
  events: BattleEvent[];
  /** uids of sleeping creatures that were prevented from acting this turn. */
  slept: Set<string>;
}

/**
 * Resolves one turn (or, while a side needs a replacement, one replacement step).
 * Never mutates `state`; returns a new state and the events that happened, in order.
 */
export function resolveTurn(
  state: BattleState,
  actions: [Action, Action],
  dex: Dex = content,
): TurnResult {
  if (state.result !== 'ongoing') throw new Error('The battle is already over');
  for (const side of [0, 1] as const) {
    if (!isLegalAction(state, side, actions[side], dex)) {
      throw new Error(`Illegal action for side ${side}: ${JSON.stringify(actions[side])}`);
    }
  }
  const s = clone(state);
  const ctx: Ctx = { s, dex, rng: new Rng(s.rngState), events: [], slept: new Set() };

  if (inReplacementPhase(s)) {
    for (const side of [0, 1] as const) {
      const action = actions[side];
      if (s.sides[side].needsReplacement && action.type === 'switch') {
        s.sides[side].needsReplacement = false;
        doSwitch(ctx, side, action.index);
      }
    }
  } else {
    runTurn(ctx, actions);
  }

  s.rngState = ctx.rng.getState();
  return { state: s, events: ctx.events };
}

interface Queued {
  side: SideIndex;
  action: Action;
  uid: string;
  bracket: number;
  priority: number;
  speed: number;
}

function runTurn(ctx: Ctx, actions: [Action, Action]): void {
  const { s } = ctx;
  s.turn += 1;
  ctx.events.push({ type: 'turn_start', turn: s.turn });

  const queue: Queued[] = ([0, 1] as const).map((side) => {
    const action = actions[side];
    const isMove = action.type === 'move';
    return {
      side,
      action,
      uid: getActive(s, side).uid,
      bracket: isMove ? 0 : 1,
      priority: isMove ? movePriority(ctx, side, action.index) : 0,
      speed: effectiveStat(s, side, 'spd', ctx.dex),
    };
  });
  const [a, b] = queue as [Queued, Queued];
  let aFirst: boolean;
  if (a.bracket !== b.bracket) aFirst = a.bracket > b.bracket;
  else if (a.priority !== b.priority) aFirst = a.priority > b.priority;
  else if (a.speed !== b.speed) aFirst = a.speed > b.speed;
  else aFirst = ctx.rng.next() < 0.5;
  const order = aFirst ? [a, b] : [b, a];

  for (const q of order) {
    if (s.result !== 'ongoing') return;
    const actor = getActive(s, q.side);
    // A fainted (or replaced) creature's pending action is cancelled.
    if (actor.uid !== q.uid || isFainted(actor)) continue;
    executeAction(ctx, q.side, q.action);
  }
  if (s.result !== 'ongoing') return;

  endOfTurn(ctx);
}

function movePriority(ctx: Ctx, side: SideIndex, index: number): number {
  const creature = getActive(ctx.s, side);
  const slot = creature.moves[index];
  const outOfPp = creature.moves.every((m) => m.pp <= 0);
  const moveId = outOfPp || !slot ? FALLBACK_MOVE_ID : slot.moveId;
  return getMove(moveId, ctx.dex).priority;
}

function executeAction(ctx: Ctx, side: SideIndex, action: Action): void {
  const { s, dex } = ctx;
  const sideState = s.sides[side];
  switch (action.type) {
    case 'move':
      executeMove(ctx, side, action.index);
      return;
    case 'switch':
      doSwitch(ctx, side, action.index);
      return;
    case 'item': {
      const item = dex.items[action.itemId]!;
      const target = sideState.team[action.target]!;
      sideState.items[action.itemId] = (sideState.items[action.itemId] ?? 0) - 1;
      sideState.itemsUsed += 1;
      ctx.events.push({ type: 'item_used', side, uid: target.uid, itemId: item.id });
      if (item.kind === 'heal') heal(ctx, side, target, item.amount);
      else if (item.kind === 'cure' && target.status) {
        ctx.events.push({ type: 'status_cured', side, uid: target.uid, status: target.status });
        target.status = null;
        target.statusTurns = 0;
      }
      return;
    }
    case 'run': {
      // Always escapes when faster; otherwise 50% + 25% per earlier failed attempt.
      const faster = effectiveStat(s, side, 'spd', dex) > effectiveStat(s, other(side), 'spd', dex);
      const chance = RUN_BASE_CHANCE + RUN_CHANCE_PER_FAILURE * sideState.runAttempts;
      if (faster || ctx.rng.chance(chance)) {
        ctx.events.push({ type: 'ran', side });
        endBattle(ctx, 'ran');
      } else {
        sideState.runAttempts += 1;
        ctx.events.push({ type: 'run_failed', side, attempts: sideState.runAttempts });
      }
      return;
    }
    case 'catch': {
      const item = dex.items[action.itemId]!;
      const bonus = item.kind === 'charm' ? item.catchBonus : 1;
      sideState.items[action.itemId] = (sideState.items[action.itemId] ?? 0) - 1;
      sideState.itemsUsed += 1;
      const wildSide = other(side);
      const wild = getActive(s, wildSide);
      const chance = catchChance(
        getSpecies(wild.speciesId, dex).catchRate,
        wild.hp,
        getMaxHp(wild, dex),
        bonus,
        wild.status,
      );
      const success = ctx.rng.next() < chance;
      ctx.events.push({
        type: 'catch_attempt',
        side,
        uid: wild.uid,
        itemId: item.id,
        chance,
        success,
      });
      if (success) {
        const destination = sideState.team.length >= MAX_TEAM_SIZE ? 'storage' : 'team';
        ctx.events.push({ type: 'caught', side: wildSide, uid: wild.uid });
        if (destination === 'storage')
          ctx.events.push({ type: 'sent_to_storage', side, uid: wild.uid });
        s.caught = { creature: clone(wild), destination };
        endBattle(ctx, 'caught');
      }
      return;
    }
    case 'pass':
      return;
  }
}

function executeMove(ctx: Ctx, side: SideIndex, index: number): void {
  const { s, dex, rng } = ctx;
  const attacker = getActive(s, side);
  const defSide = other(side);
  const defender = getActive(s, defSide);

  if (attacker.status === 'sleep') {
    ctx.events.push({ type: 'cant_act', side, uid: attacker.uid, reason: 'sleep' });
    ctx.slept.add(attacker.uid);
    return;
  }
  if (attacker.status === 'paralysis' && rng.chance(PARALYSIS_SKIP_CHANCE)) {
    ctx.events.push({ type: 'cant_act', side, uid: attacker.uid, reason: 'paralysis' });
    return;
  }
  // The target fainted earlier this turn: nothing to aim at.
  if (isFainted(defender)) return;

  const outOfPp = attacker.moves.every((m) => m.pp <= 0);
  let move: Move;
  if (outOfPp) {
    move = getMove(FALLBACK_MOVE_ID, dex);
  } else {
    const slot = attacker.moves[index]!;
    slot.pp -= 1;
    move = getMove(slot.moveId, dex);
  }
  ctx.events.push({ type: 'move_used', side, uid: attacker.uid, moveId: move.id });

  if (move.accuracy !== null && !rng.chance(move.accuracy)) {
    ctx.events.push({ type: 'miss', side, uid: attacker.uid });
    return;
  }

  let dealt = 0;
  if (move.power > 0) {
    const attackerSpecies = getSpecies(attacker.speciesId, dex);
    const defenderSpecies = getSpecies(defender.speciesId, dex);
    const typeMul = move.typeless ? 1 : typeEffectiveness(move.type, defenderSpecies.types, dex);
    if (typeMul === 0) {
      ctx.events.push({ type: 'effectiveness', side: defSide, uid: defender.uid, multiplier: 0 });
      return;
    }
    const crit = rng.next() < CRIT_CHANCE;
    const random = RANDOM_MIN + rng.next() * (1 - RANDOM_MIN);
    const damage = computeDamage({
      level: attacker.level,
      power: move.power,
      atk: effectiveStat(s, side, 'atk', dex),
      def: effectiveStat(s, defSide, 'def', dex),
      stab: !move.typeless && attackerSpecies.types.includes(move.type),
      typeMul,
      crit,
      random,
      burned: attacker.status === 'burn',
    });
    if (crit) ctx.events.push({ type: 'crit', side: defSide, uid: defender.uid });
    if (typeMul !== 1)
      ctx.events.push({
        type: 'effectiveness',
        side: defSide,
        uid: defender.uid,
        multiplier: typeMul,
      });
    dealt = applyDamage(ctx, defSide, defender, damage, 'move');
  }

  const isStatusMove = move.power === 0;
  for (const effect of move.effects) {
    switch (effect.kind) {
      case 'status':
        if (isFainted(defender)) break;
        if (!rng.chance(effect.chance)) break;
        if (!applyStatus(ctx, defSide, defender, effect.status) && isStatusMove) {
          ctx.events.push({ type: 'no_effect', side: defSide, uid: defender.uid });
        }
        break;
      case 'stat': {
        const targetSide = effect.target === 'self' ? side : defSide;
        const target = getActive(s, targetSide);
        if (isFainted(target)) break;
        if (!rng.chance(effect.chance)) break;
        applyStage(ctx, targetSide, effect.stat, effect.stages);
        break;
      }
      case 'heal':
        if (isFainted(attacker)) break;
        heal(ctx, side, attacker, Math.floor((getMaxHp(attacker, dex) * effect.percent) / 100));
        break;
      case 'recoil':
        if (dealt <= 0 || isFainted(attacker)) break;
        applyDamage(
          ctx,
          side,
          attacker,
          Math.max(1, Math.floor((dealt * effect.percent) / 100)),
          'recoil',
        );
        break;
    }
  }

  checkFaint(ctx, defSide);
  checkFaint(ctx, side);
}

function applyDamage(
  ctx: Ctx,
  side: SideIndex,
  creature: CreatureInstance,
  amount: number,
  source: 'move' | 'recoil',
): number {
  const dealt = Math.min(creature.hp, Math.max(0, amount));
  creature.hp -= dealt;
  ctx.events.push({
    type: 'damage',
    side,
    uid: creature.uid,
    amount: dealt,
    hp: creature.hp,
    maxHp: getMaxHp(creature, ctx.dex),
    source,
  });
  return dealt;
}

function heal(ctx: Ctx, side: SideIndex, creature: CreatureInstance, amount: number): void {
  const maxHp = getMaxHp(creature, ctx.dex);
  const healed = Math.max(0, Math.min(maxHp - creature.hp, amount));
  if (healed === 0) {
    ctx.events.push({ type: 'no_effect', side, uid: creature.uid });
    return;
  }
  creature.hp += healed;
  ctx.events.push({
    type: 'heal',
    side,
    uid: creature.uid,
    amount: healed,
    hp: creature.hp,
    maxHp,
  });
}

/** Returns false if the creature already has a status. */
function applyStatus(
  ctx: Ctx,
  side: SideIndex,
  creature: CreatureInstance,
  status: Status,
): boolean {
  if (creature.status !== null) return false;
  creature.status = status;
  creature.statusTurns = status === 'sleep' ? ctx.rng.int(1, 3) : 0;
  ctx.events.push({ type: 'status_applied', side, uid: creature.uid, status });
  return true;
}

function applyStage(ctx: Ctx, side: SideIndex, stat: StageStat, delta: number): void {
  const stages = ctx.s.sides[side].stages;
  const before = stages[stat];
  const after = clampStage(before + delta);
  stages[stat] = after;
  ctx.events.push({
    type: 'stat_change',
    side,
    uid: getActive(ctx.s, side).uid,
    stat,
    stages: after - before,
    stage: after,
  });
}

function markParticipation(s: BattleState): void {
  const a = getActive(s, 0);
  const b = getActive(s, 1);
  if (isFainted(a) || isFainted(b)) return;
  const add = (key: string, uid: string): void => {
    const list = (s.participation[key] ??= []);
    if (!list.includes(uid)) list.push(uid);
  };
  add(a.uid, b.uid);
  add(b.uid, a.uid);
}

function doSwitch(ctx: Ctx, side: SideIndex, index: number): void {
  const sideState = ctx.s.sides[side];
  const from = sideState.team[sideState.active]!;
  sideState.active = index;
  sideState.stages = freshStages();
  const to = sideState.team[index]!;
  ctx.events.push({ type: 'switch', side, fromUid: from.uid, uid: to.uid, index });
  markParticipation(ctx.s);
}

/** Handles a faint of `side`'s active creature: event, XP for the other side, battle end. */
function checkFaint(ctx: Ctx, side: SideIndex): void {
  const { s, dex } = ctx;
  if (s.result !== 'ongoing') return;
  const fainted = getActive(s, side);
  if (!isFainted(fainted)) return;
  // Each creature faints only once per active stint; the faint event marks it.
  if (ctx.events.some((e) => e.type === 'faint' && e.uid === fainted.uid)) return;
  ctx.events.push({ type: 'faint', side, uid: fainted.uid });

  const winnerSide = other(side);
  const winners = s.sides[winnerSide];
  if (winners.gainsXp) {
    const participants = winners.team.filter(
      (c) => c.hp > 0 && (s.participation[fainted.uid] ?? []).includes(c.uid),
    );
    const amount = xpYield(
      getSpecies(fainted.speciesId, dex).baseXp,
      fainted.level,
      participants.length,
      s.kind !== 'wild',
    );
    for (const c of participants)
      ctx.events.push(...gainXp(c, amount, winnerSide, dex, winners.ai !== null));
  }

  if (!hasUsable(s.sides[side])) endBattle(ctx, side === 0 ? 'p2' : 'p1');
}

function endBattle(ctx: Ctx, result: Exclude<BattleResult, 'ongoing'>): void {
  if (ctx.s.result !== 'ongoing') return;
  ctx.s.result = result;
  ctx.events.push({ type: 'battle_end', result });
}

function endOfTurn(ctx: Ctx): void {
  const { s, dex } = ctx;
  for (const side of [0, 1] as const) {
    if (s.result !== 'ongoing') return;
    const c = getActive(s, side);
    if (isFainted(c)) continue;
    if (c.status === 'burn' || c.status === 'poison') {
      const maxHp = getMaxHp(c, dex);
      const fraction = c.status === 'burn' ? BURN_DAMAGE_FRACTION : POISON_DAMAGE_FRACTION;
      const amount = Math.min(c.hp, Math.max(1, Math.floor(maxHp * fraction)));
      c.hp -= amount;
      ctx.events.push({
        type: 'status_damage',
        side,
        uid: c.uid,
        status: c.status,
        amount,
        hp: c.hp,
        maxHp,
      });
      checkFaint(ctx, side);
    } else if (c.status === 'sleep' && ctx.slept.has(c.uid)) {
      c.statusTurns -= 1;
      if (c.statusTurns <= 0) {
        c.status = null;
        c.statusTurns = 0;
        ctx.events.push({ type: 'status_cured', side, uid: c.uid, status: 'sleep' });
      }
    }
  }
  if (s.result !== 'ongoing') return;

  // Replace fainted creatures: AI sides immediately, human sides get a replacement step.
  for (const side of [0, 1] as const) {
    const sideState = s.sides[side];
    if (!isFainted(getActive(s, side))) continue;
    if (sideState.ai) {
      doSwitch(ctx, side, chooseReplacement(s, side, dex));
    } else {
      sideState.needsReplacement = true;
      ctx.events.push({ type: 'needs_replacement', side });
    }
  }

  if (s.turn >= MAX_TURNS) endBattle(ctx, decideByHp(s, dex));
}

function decideByHp(s: BattleState, dex: Dex): 'p1' | 'p2' {
  const frac = (side: Side): number => {
    let hp = 0;
    let max = 0;
    for (const c of side.team) {
      hp += c.hp;
      max += getMaxHp(c, dex);
    }
    return hp / max;
  };
  return frac(s.sides[0]) > frac(s.sides[1]) ? 'p1' : 'p2';
}
