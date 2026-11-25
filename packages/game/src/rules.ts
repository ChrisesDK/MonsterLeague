import { content, type Dex, type Poi } from '@oml/data';
import {
  canEvolve,
  createBattle,
  createCreature,
  evolveCreature,
  getMaxHp,
  learnMove,
  MAX_TEAM_SIZE,
  type BattleEvent,
  type BattleState,
  type CreatureInstance,
  type SideConfig,
} from '@oml/engine';
import { payoutFor, type ActiveBattle, type PostBattleChoice, type SaveGame } from './save';
import { noteRestStop } from './journal';

// ---------------------------------------------------------------------------
// Badges, obedience, zones and districts

export const BASE_OBEDIENCE = 15;
export const OBEDIENCE_PER_BADGE = 5;
/** GDD: starters begin at a level the junior and route trainers of district 1 suit. */
export const STARTER_LEVEL = 5;
export const RESTOCK_SECONDS = 3600;

/** GDD: badge 0 → 15, then +5 per badge. */
export function obedienceLevel(badges: readonly number[]): number {
  return BASE_OBEDIENCE + OBEDIENCE_PER_BADGE * badges.length;
}

/**
 * GDD P22: a zone is open when the player has finished a route that ends in it (the start
 * zone is open from the beginning). An unknown or empty zone id (outside the region) counts
 * as open, so nothing outside the map is ever locked by mistake.
 */
export function isZoneOpen(
  save: Pick<SaveGame, 'zones'>,
  zone: string,
  dex: Dex = content,
): boolean {
  if (!zone || !dex.zones[zone]) return true;
  return dex.zones[zone]!.start === true || save.zones.includes(zone);
}

/** A district counts as open (Journal, Town Map) once any of its zones is open. */
export function isDistrictOpen(
  save: Pick<SaveGame, 'zones'>,
  district: number,
  dex: Dex = content,
): boolean {
  return Object.values(dex.zones).some(
    (z) => z.district === district && isZoneOpen(save, z.id, dex),
  );
}

/** The badge arena `n` needs before its leader takes a challenge (GDD: badge n − 1). */
export function badgeNeededFor(arena: number): number {
  return Math.max(1, arena - 1);
}

/** Whether arena `n` takes a challenge: its zone is open and the player has badge n − 1. */
export function arenaReady(
  save: Pick<SaveGame, 'zones' | 'badges'>,
  arena: number,
  dex: Dex = content,
): boolean {
  const zone = Object.values(dex.zones).find((z) => z.arena === arena);
  return (
    (!zone || isZoneOpen(save, zone.id, dex)) && (arena <= 1 || save.badges.includes(arena - 1))
  );
}

export function fieldAbilitiesUnlocked(save: SaveGame, dex: Dex = content): string[] {
  return Object.values(dex.fieldAbilities)
    .filter((f) => save.badges.includes(f.badge) || save.devAbilities.includes(f.id))
    .map((f) => f.id);
}

// ---------------------------------------------------------------------------
// Team helpers

export const isFainted = (c: CreatureInstance) => c.hp <= 0;
export const teamFainted = (team: readonly CreatureInstance[]) =>
  team.length > 0 && team.every(isFainted);

function freshUid(save: SaveGame): [string, SaveGame] {
  return [`p${save.nextUid}`, { ...save, nextUid: save.nextUid + 1 }];
}

/** Full heal: HP, status and PP (rest stops). */
export function healCreature(c: CreatureInstance, dex: Dex = content): CreatureInstance {
  return {
    ...c,
    hp: getMaxHp(c, dex),
    status: null,
    statusTurns: 0,
    moves: c.moves.map((m) => ({ ...m, pp: dex.moves[m.moveId]?.pp ?? m.pp })),
  };
}

/** Fainted creatures recover on their own after this long (owner request after M2d). */
export const RECOVERY_SECONDS = 8 * 3600;

/**
 * Keeps the recovery clock in step with the team: starts it for newly fainted creatures and
 * drops creatures that are no longer fainted (healed, revived) or gone. Same object when
 * nothing changes.
 */
export function noteFainted(save: SaveGame, nowSeconds: number): SaveGame {
  const all = [...save.team, ...save.storage];
  const next: Record<string, number> = {};
  for (const c of all) if (isFainted(c)) next[c.uid] = save.faintedSince[c.uid] ?? nowSeconds;
  const same =
    Object.keys(next).length === Object.keys(save.faintedSince).length &&
    Object.entries(next).every(([k, v]) => save.faintedSince[k] === v);
  return same ? save : { ...save, faintedSince: next };
}

/** When a fainted creature recovers by itself (unix seconds), or null if it isn't fainted. */
export function recoversAt(save: SaveGame, uid: string): number | null {
  const since = save.faintedSince[uid];
  return since === undefined ? null : since + RECOVERY_SECONDS;
}

/** Heals every creature that has been fainted for 8 hours. Same object when none is due. */
export function naturalRecovery(
  save: SaveGame,
  nowSeconds: number,
  dex: Dex = content,
): { save: SaveGame; recovered: string[] } {
  const due = Object.entries(save.faintedSince)
    .filter(([, since]) => nowSeconds - since >= RECOVERY_SECONDS)
    .map(([uid]) => uid);
  if (due.length === 0 || save.battle) return { save, recovered: [] };
  const heal = (c: CreatureInstance) => (due.includes(c.uid) ? healCreature(c, dex) : c);
  const faintedSince = { ...save.faintedSince };
  for (const uid of due) delete faintedSince[uid];
  return {
    save: { ...save, team: save.team.map(heal), storage: save.storage.map(heal), faintedSince },
    recovered: due,
  };
}

export function healTeam(save: SaveGame, dex: Dex = content): SaveGame {
  return { ...save, team: save.team.map((c) => healCreature(c, dex)) };
}

function addItems(bag: Record<string, number>, items: Record<string, number>) {
  const out = { ...bag };
  for (const [id, n] of Object.entries(items)) out[id] = (out[id] ?? 0) + n;
  return out;
}

function markDistrict(map: Record<string, number[]>, speciesId: string, district: number) {
  const list = map[speciesId] ?? [];
  if (list.includes(district)) return map;
  return { ...map, [speciesId]: [...list, district].sort((a, b) => a - b) };
}

// ---------------------------------------------------------------------------
// Onboarding

export function chooseStarter(save: SaveGame, speciesId: string, dex: Dex = content): SaveGame {
  if (save.starter) throw new Error('A starter was already chosen');
  const [uid, next] = freshUid(save);
  const creature = createCreature(speciesId, STARTER_LEVEL, uid, dex);
  return {
    ...next,
    starter: speciesId,
    team: [creature],
    bag: addItems(next.bag, { basic_charm: 5, small_tonic: 2 }),
    caught: markDistrict(next.caught, speciesId, 1),
    seen: markDistrict(next.seen, speciesId, 1),
    onboarding: 'tutorial',
  };
}

/**
 * The tutorial creature: a common folk creature at level 3, caught with an easy rate
 * (the dex passed to the battle gets a raised catch rate for this one species, see
 * `tutorialDex`).
 */
export const TUTORIAL_SPECIES = 'torvdue';
export const TUTORIAL_LEVEL = 3;
/** GDD catch formula with this rate and a basic charm: at full HP ≈ 33%, at 1 HP ≈ 100%. */
export const TUTORIAL_CATCH_RATE = 255;

export function tutorialDex(dex: Dex = content): Dex {
  const s = dex.species[TUTORIAL_SPECIES];
  if (!s) throw new Error(`Missing tutorial species ${TUTORIAL_SPECIES}`);
  return {
    ...dex,
    species: { ...dex.species, [s.id]: { ...s, catchRate: TUTORIAL_CATCH_RATE } },
  };
}

// ---------------------------------------------------------------------------
// Battles from the map

function playerSideConfig(save: SaveGame): SideConfig {
  return {
    team: save.team,
    items: { ...save.bag },
    ai: null,
    obedienceLevel: obedienceLevel(save.badges),
  };
}

export type SpawnStatus = 'ok' | 'used' | 'tooWild' | 'needsAbility' | 'teamFainted' | 'noTeam';

/**
 * GDD v1.7 + P22: common creatures can be battled everywhere; rare creatures and
 * field-ability layers in a zone the player has not opened yet are "too wild"; a
 * field-ability requirement applies everywhere. `zone` is the spawn's zone (from the
 * region file); without one the spawn counts as open.
 */
export function spawnStatus(
  save: SaveGame,
  spawn: {
    id: string;
    zone?: string;
    district?: number;
    requires: string | null;
    rarity: 'common' | 'rare';
  },
  dex: Dex = content,
): SpawnStatus {
  if (save.team.length === 0) return 'noTeam';
  if (save.usedSpawns[spawn.id] !== undefined) return 'used';
  const locked = !isZoneOpen(save, spawn.zone ?? '', dex);
  if (locked && (spawn.rarity === 'rare' || spawn.requires)) return 'tooWild';
  if (spawn.requires && !save.team.some((c) => c.fieldAbility === spawn.requires))
    return 'needsAbility';
  if (teamFainted(save.team)) return 'teamFainted';
  return 'ok';
}

export type LevelBands = Record<number, readonly [number, number]>;

/** The district whose band a player's common creatures use: badges + 1, at most 8. */
export function playerBandDistrict(badges: readonly number[]): number {
  return Math.min(8, badges.length + 1);
}

/**
 * A spawn's level for this player (GDD v1.7): common creatures use the player's own band,
 * rare ones their district's band. `levelRoll` in [0, 1) picks the level inside the band.
 */
export function spawnLevel(
  spawn: { rarity: 'common' | 'rare'; levelRoll: number; district: number },
  badges: readonly number[],
  bands: LevelBands,
): number {
  const d = spawn.rarity === 'common' ? playerBandDistrict(badges) : spawn.district;
  const band = bands[d];
  if (!band) throw new Error(`No level band for district ${d}`);
  const [lo, hi] = band;
  const roll = Math.min(Math.max(spawn.levelRoll, 0), 0.999999);
  return lo + Math.floor(roll * (hi - lo + 1));
}

export function startWildBattle(
  save: SaveGame,
  spawn: { id: string; speciesId: string; level: number; expiresAt: number; district: number },
  seed: number,
  dex: Dex = content,
): SaveGame {
  const state = createBattle(
    {
      kind: 'wild',
      sides: [
        playerSideConfig(save),
        { team: [createCreature(spawn.speciesId, spawn.level, 'w0', dex)], ai: 'wild' },
      ],
    },
    seed,
    dex,
  );
  const battle: ActiveBattle = {
    kind: 'wild',
    spawnId: spawn.id,
    expiresAt: spawn.expiresAt,
    district: spawn.district,
    state,
  };
  return {
    ...save,
    battle,
    usedSpawns: { ...save.usedSpawns, [spawn.id]: spawn.expiresAt },
    seen: markDistrict(save.seen, spawn.speciesId, spawn.district),
  };
}

/** The tutorial never runs out of charms: the guide tops the bag up to this many. */
export const TUTORIAL_CHARMS = 3;

export function startTutorialBattle(save: SaveGame, seed: number, dex: Dex = content): SaveGame {
  const tdex = tutorialDex(dex);
  if ((save.bag.basic_charm ?? 0) < TUTORIAL_CHARMS)
    save = { ...save, bag: { ...save.bag, basic_charm: TUTORIAL_CHARMS } };
  const state = createBattle(
    {
      kind: 'wild',
      sides: [
        playerSideConfig(save),
        { team: [createCreature(TUTORIAL_SPECIES, TUTORIAL_LEVEL, 'w0', tdex)], ai: 'wild' },
      ],
    },
    seed,
    tdex,
  );
  return {
    ...save,
    battle: { kind: 'tutorial', state },
    seen: markDistrict(save.seen, TUTORIAL_SPECIES, 1),
  };
}

export type TrainerStatus =
  | { kind: 'ready'; trainerId: string }
  | { kind: 'locked'; badge: number }
  | { kind: 'zoneLocked'; zone: string }
  | { kind: 'beaten'; trainerId: string }
  | { kind: 'needsJunior'; trainerId: string }
  | { kind: 'teamFainted' }
  | { kind: 'noTeam' };

/**
 * What happens when the player is inside a trainer or arena POI's radius (P22): trainers and
 * arenas wait until their zone is open; an arena's leader also needs badge n − 1.
 */
export function trainerStatus(save: SaveGame, poi: Poi, dex: Dex = content): TrainerStatus | null {
  if (poi.kind === 'restStop' || poi.kind === 'market') return null;
  if (!isZoneOpen(save, poi.zone, dex)) return { kind: 'zoneLocked', zone: poi.zone };
  if (poi.kind === 'arena' && poi.arena > 1 && !save.badges.includes(poi.arena - 1))
    return { kind: 'locked', badge: badgeNeededFor(poi.arena) };
  const order = poi.kind === 'arena' ? poi.trainers : [poi.trainer];
  const next = order.find((id) => !save.defeatedTrainers.includes(id));
  if (!next) return { kind: 'beaten', trainerId: order[order.length - 1]! };
  if (save.team.length === 0) return { kind: 'noTeam' };
  if (teamFainted(save.team)) return { kind: 'teamFainted' };
  return { kind: 'ready', trainerId: next };
}

export function startTrainerBattle(
  save: SaveGame,
  poiId: string,
  trainerId: string,
  seed: number,
  dex: Dex = content,
): SaveGame {
  const trainer = dex.trainers[trainerId];
  if (!trainer) throw new Error(`Unknown trainer ${trainerId}`);
  const opponent: SideConfig = {
    name: trainer.id,
    team: trainer.team.map((m, i) =>
      createCreature(m.speciesId, m.level, `o${i}`, dex, m.moves ? { moves: m.moves } : {}),
    ),
    items: { ...trainer.items },
    ai: trainer.tier,
  };
  const state = createBattle(
    { kind: trainer.tier, sides: [playerSideConfig(save), opponent] },
    seed,
    dex,
  );
  return { ...save, battle: { kind: 'trainer', poiId, trainerId, state } };
}

/** The player's choices (learn move, evolve) found in battle events, without duplicates. */
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

/** Applies an answer: forget index (learn), true/false (evolve), or null to skip. */
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

/** Saves the player's answer to the first pending choice and removes it. */
export function answerPending(
  save: SaveGame,
  answer: number | boolean | null,
  dex: Dex = content,
): SaveGame {
  const [choice, ...rest] = save.pending;
  if (!choice) return save;
  const team = applyChoice(save.team, choice, answer, dex);
  const evolved = team.find((c) => c.uid === choice.uid);
  let caught = save.caught;
  let seen = save.seen;
  if (choice.kind === 'evolve' && evolved && evolved.speciesId === choice.into) {
    caught = markDistrict(caught, choice.into, 1);
    seen = markDistrict(seen, choice.into, 1);
  }
  // A declined or done evolution is not asked again until the next level-up.
  const pending = rest.filter(
    (c) => !(choice.kind === 'evolve' && c.kind === 'evolve' && c.uid === choice.uid),
  );
  return { ...save, team, pending, caught, seen };
}

export interface BattleOutcome {
  save: SaveGame;
  won: boolean;
  caught: CreatureInstance | null;
  caughtTo: 'team' | 'storage' | null;
  reward: { itemId: string; count: number } | null;
  /** Skilling won (D165); 0 when nothing was paid. */
  coins: number;
  badge: number | null;
}

/**
 * Applies a finished battle to the save: team HP/XP/levels/moves, the bag, the catch
 * (team, or storage when the team is full), defeated trainers, rewards and badges.
 * Losing costs nothing else: XP is kept and the team stays fainted (GDD).
 * `events` = all events of the battle, for learn/evolve choices.
 */
export function finishBattle(
  save: SaveGame,
  finalState: BattleState,
  events: readonly BattleEvent[],
  dex: Dex = content,
): BattleOutcome {
  const battle = save.battle;
  if (!battle) throw new Error('No active battle');
  const player = finalState.sides[0];
  let next: SaveGame = {
    ...save,
    battle: null,
    team: player.team.map((c) => ({ ...c, moves: c.moves.map((m) => ({ ...m })) })),
    bag: Object.fromEntries(Object.entries(player.items).filter(([, n]) => n > 0)),
    pending: collectChoices(events, save.pending),
  };
  const won = finalState.result === 'p1' || finalState.result === 'caught';
  let caught: CreatureInstance | null = null;
  let caughtTo: BattleOutcome['caughtTo'] = null;
  let reward: BattleOutcome['reward'] = null;
  let coins = 0;
  let badge: number | null = null;

  if (finalState.caught && battle.kind !== 'trainer') {
    const district = battle.kind === 'wild' ? battle.district : 1;
    const [uid, withUid] = freshUid(next);
    // The tutorial battle used a raised catch rate; the creature itself is ordinary.
    caught = { ...finalState.caught.creature, uid, status: null, statusTurns: 0 };
    caughtTo = next.team.length < MAX_TEAM_SIZE ? 'team' : 'storage';
    next = {
      ...withUid,
      team: caughtTo === 'team' ? [...withUid.team, caught] : withUid.team,
      storage: caughtTo === 'storage' ? [...withUid.storage, caught] : withUid.storage,
      caught: markDistrict(withUid.caught, caught.speciesId, district),
    };
  }

  if (battle.kind === 'trainer') {
    for (const c of finalState.sides[1].team)
      next = { ...next, seen: markDistrict(next.seen, c.speciesId, 1) };
    if (finalState.result === 'p1' && !next.defeatedTrainers.includes(battle.trainerId)) {
      const trainer = dex.trainers[battle.trainerId];
      next = { ...next, defeatedTrainers: [...next.defeatedTrainers, battle.trainerId] };
      if (trainer?.reward) {
        reward = trainer.reward;
        next = { ...next, bag: addItems(next.bag, { [reward.itemId]: reward.count }) };
      }
      if (trainer) {
        coins = payoutFor(trainer);
        next = { ...next, coins: next.coins + coins };
      }
      if (trainer?.tier === 'leader' && trainer.arena && !next.badges.includes(trainer.arena)) {
        badge = trainer.arena;
        next = { ...next, badges: [...next.badges, badge].sort((a, b) => a - b) };
      }
    }
  }
  // The tutorial ends with the first catch; otherwise another creature is placed.
  if (battle.kind === 'tutorial' && save.onboarding === 'tutorial' && caught) {
    next = { ...next, onboarding: 'done' };
  }
  return { save: next, won, caught, caughtTo, reward, coins, badge };
}

// ---------------------------------------------------------------------------
// Markets (D165)

/** What a market sells to this player: priced items, minus those behind a badge. */
export function marketStock(save: Pick<SaveGame, 'badges'>, dex: Dex = content): string[] {
  return Object.values(dex.items)
    .filter((i) => i.price !== undefined && (!i.marketBadge || save.badges.includes(i.marketBadge)))
    .map((i) => i.id);
}

/** What a market pays for one item: half its price (0 = it can't be sold). */
export function sellPrice(itemId: string, dex: Dex = content): number {
  const p = dex.items[itemId]?.price;
  return p ? Math.floor(p / 2) : 0;
}

/** Buys `count` of an item; null when it isn't for sale or the player can't afford it. */
export function buyItem(
  save: SaveGame,
  itemId: string,
  count = 1,
  dex: Dex = content,
): SaveGame | null {
  const item = dex.items[itemId];
  if (!item?.price || count < 1 || !marketStock(save, dex).includes(itemId)) return null;
  const cost = item.price * count;
  if (cost > save.coins) return null;
  return { ...save, coins: save.coins - cost, bag: addItems(save.bag, { [itemId]: count }) };
}

/** Sells `count` of an item for half price; null when the player doesn't have that many. */
export function sellItem(
  save: SaveGame,
  itemId: string,
  count = 1,
  dex: Dex = content,
): SaveGame | null {
  const price = sellPrice(itemId, dex);
  const have = save.bag[itemId] ?? 0;
  if (!price || count < 1 || count > have) return null;
  const bag = { ...save.bag, [itemId]: have - count };
  if (bag[itemId] === 0) delete bag[itemId];
  return { ...save, coins: save.coins + price * count, bag };
}

// ---------------------------------------------------------------------------
// Rest stops

/**
 * Restock is free once per hour per rest stop, by device time. Basic guard against clocks
 * set backwards: a restock time in the future (the clock went back after it) simply blocks
 * that stop until device time has passed it plus the hour again.
 */
export function restockReadyAt(save: SaveGame, poiId: string): number {
  const last = save.lastRestock[poiId];
  return last === undefined ? 0 : last + RESTOCK_SECONDS;
}

export function canRestock(save: SaveGame, poiId: string, nowSeconds: number): boolean {
  const last = save.lastRestock[poiId];
  if (last === undefined) return true;
  if (nowSeconds < last) return false; // clock set backwards
  return nowSeconds >= last + RESTOCK_SECONDS;
}

export interface RestResult {
  save: SaveGame;
  healed: boolean;
  restocked: Record<string, number> | null;
}

/** Visiting a rest stop: full heal, plus the hourly restock when it is due. */
export function visitRestStop(
  save: SaveGame,
  poi: Poi,
  nowSeconds: number,
  dex: Dex = content,
): RestResult {
  if (poi.kind !== 'restStop') throw new Error(`${poi.id} is not a rest stop`);
  const needsHeal = save.team.some(
    (c) =>
      c.hp < getMaxHp(c, dex) ||
      c.status !== null ||
      c.moves.some((m) => m.pp < (dex.moves[m.moveId]?.pp ?? m.pp)),
  );
  let next = noteRestStop(healTeam(save, dex), poi.id);
  let restocked: Record<string, number> | null = null;
  if (canRestock(save, poi.id, nowSeconds)) {
    restocked = { ...poi.restock };
    next = {
      ...next,
      bag: addItems(next.bag, poi.restock),
      lastRestock: { ...next.lastRestock, [poi.id]: nowSeconds },
    };
  }
  return { save: next, healed: needsHeal, restocked };
}

// ---------------------------------------------------------------------------
// Items outside battle

export function canUseItem(c: CreatureInstance, itemId: string, dex: Dex = content): boolean {
  const item = dex.items[itemId];
  if (!item) return false;
  switch (item.kind) {
    case 'heal':
      return c.hp > 0 && c.hp < getMaxHp(c, dex);
    case 'cure':
      return c.hp > 0 && c.status !== null;
    case 'revive':
      return c.hp <= 0;
    default:
      return false;
  }
}

/**
 * Adds items to the bag. For now only the Settings "Test items" button uses it (owner: a
 * way to test revive items before the game hands them out); content decides real sources.
 */
export function addToBag(save: SaveGame, itemId: string, n = 1, dex: Dex = content): SaveGame {
  if (!dex.items[itemId]) throw new Error(`Unknown item ${itemId}`);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Bad item count ${n}`);
  return { ...save, bag: { ...save.bag, [itemId]: (save.bag[itemId] ?? 0) + n } };
}

/** Uses a tonic, clear drops or revive item on a team or storage creature (by uid). */
export function applyItem(
  save: SaveGame,
  itemId: string,
  uid: string,
  dex: Dex = content,
): SaveGame {
  if ((save.bag[itemId] ?? 0) <= 0) throw new Error(`No ${itemId} in the bag`);
  const item = dex.items[itemId];
  if (!item) throw new Error(`Unknown item ${itemId}`);
  const apply = (c: CreatureInstance): CreatureInstance => {
    if (c.uid !== uid) return c;
    if (!canUseItem(c, itemId, dex)) throw new Error(`${itemId} has no effect`);
    const max = getMaxHp(c, dex);
    if (item.kind === 'heal') return { ...c, hp: Math.min(max, c.hp + item.amount) };
    if (item.kind === 'cure') return { ...c, status: null, statusTurns: 0 };
    if (item.kind === 'revive')
      return { ...c, hp: Math.max(1, Math.floor((max * item.percent) / 100)) };
    return c;
  };
  const inTeam = save.team.some((c) => c.uid === uid);
  if (!inTeam && !save.storage.some((c) => c.uid === uid)) throw new Error(`No creature ${uid}`);
  return {
    ...save,
    team: inTeam ? save.team.map(apply) : save.team,
    storage: inTeam ? save.storage : save.storage.map(apply),
    bag: { ...save.bag, [itemId]: save.bag[itemId]! - 1 },
  };
}

// ---------------------------------------------------------------------------
// Team and storage

export function moveToStorage(save: SaveGame, uid: string): SaveGame {
  const c = save.team.find((x) => x.uid === uid);
  if (!c) throw new Error(`No team creature ${uid}`);
  if (save.team.length <= 1) throw new Error('The team needs at least one creature');
  return { ...save, team: save.team.filter((x) => x.uid !== uid), storage: [...save.storage, c] };
}

export function moveToTeam(save: SaveGame, uid: string): SaveGame {
  const c = save.storage.find((x) => x.uid === uid);
  if (!c) throw new Error(`No stored creature ${uid}`);
  if (save.team.length >= MAX_TEAM_SIZE) throw new Error('The team is full');
  return { ...save, storage: save.storage.filter((x) => x.uid !== uid), team: [...save.team, c] };
}

/** Swaps a team creature with a stored one (team order is kept). */
export function swapWithStorage(save: SaveGame, teamUid: string, storageUid: string): SaveGame {
  const t = save.team.find((x) => x.uid === teamUid);
  const s = save.storage.find((x) => x.uid === storageUid);
  if (!t || !s) throw new Error('Unknown creature');
  return {
    ...save,
    team: save.team.map((x) => (x.uid === teamUid ? s : x)),
    storage: save.storage.map((x) => (x.uid === storageUid ? t : x)),
  };
}

/** Moves a team creature to the front (it leads the next battle). */
export function setLead(save: SaveGame, uid: string): SaveGame {
  const c = save.team.find((x) => x.uid === uid);
  if (!c) throw new Error(`No team creature ${uid}`);
  return { ...save, team: [c, ...save.team.filter((x) => x.uid !== uid)] };
}

// ---------------------------------------------------------------------------
// Field abilities

export type TeachCheck = 'ok' | 'locked' | 'wrongType' | 'hasAbility' | 'needsForget';

export function canTeach(
  save: SaveGame,
  c: CreatureInstance,
  abilityId: string,
  dex: Dex = content,
): TeachCheck {
  const ability = dex.fieldAbilities[abilityId];
  if (!ability || !fieldAbilitiesUnlocked(save, dex).includes(abilityId)) return 'locked';
  const types = dex.species[c.speciesId]?.types ?? [];
  if (!types.some((t) => ability.types.includes(t))) return 'wrongType';
  if (c.fieldAbility) return 'hasAbility';
  if (c.moves.length >= 4) return 'needsForget';
  return 'ok';
}

/**
 * Teaches a field ability. It takes one of the 4 move slots: with 4 moves known the player
 * picks one to forget (`forgetIndex`).
 */
export function teachFieldAbility(
  save: SaveGame,
  uid: string,
  abilityId: string,
  forgetIndex: number | null,
  dex: Dex = content,
): SaveGame {
  const update = (c: CreatureInstance): CreatureInstance => {
    if (c.uid !== uid) return c;
    const check = canTeach(save, c, abilityId, dex);
    if (check === 'needsForget') {
      if (forgetIndex === null || !c.moves[forgetIndex] || c.moves.length <= 1)
        throw new Error('Choose a move to forget');
      return { ...c, fieldAbility: abilityId, moves: c.moves.filter((_, i) => i !== forgetIndex) };
    }
    if (check !== 'ok') throw new Error(`Cannot teach ${abilityId}: ${check}`);
    return { ...c, fieldAbility: abilityId, moves: c.moves.map((m) => ({ ...m })) };
  };
  const inTeam = save.team.some((c) => c.uid === uid);
  return {
    ...save,
    team: inTeam ? save.team.map(update) : save.team,
    storage: inTeam ? save.storage : save.storage.map(update),
  };
}

/** Removes a field ability, freeing its slot. */
export function forgetFieldAbility(save: SaveGame, uid: string): SaveGame {
  const strip = (c: CreatureInstance): CreatureInstance => {
    if (c.uid !== uid || !c.fieldAbility) return c;
    const { fieldAbility: _drop, ...rest } = c;
    return rest;
  };
  return { ...save, team: save.team.map(strip), storage: save.storage.map(strip) };
}
