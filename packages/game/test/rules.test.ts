import { regions } from '@oml/data';
import { content } from '@oml/data';
import {
  chooseAiAction,
  createCreature,
  getMaxHp,
  resolveTurn,
  type Action,
  type BattleEvent,
  type BattleState,
} from '@oml/engine';
import { describe, expect, it } from 'vitest';
import {
  addToBag,
  canUseItem,
  answerPending,
  canRestock,
  canTeach,
  chooseStarter,
  finishBattle,
  arenaReady,
  isDistrictOpen,
  isZoneOpen,
  moveInTeam,
  moveToStorage,
  moveToTeam,
  newSave,
  obedienceLevel,
  RESTOCK_SECONDS,
  spawnStatus,
  spawnLevel,
  playerBandDistrict,
  startTrainerBattle,
  startTutorialBattle,
  startWildBattle,
  swapWithStorage,
  teachFieldAbility,
  trainerStatus,
  tutorialDex,
  applyItem,
  visitRestStop,
  type SaveGame,
} from '../src/index';

// These tests cover the locked rules (regions that are not open, P28), on Odense's content.
Object.assign(regions.odense, { open: false });

const SEED = 'feedfacefeedfacefeedfacefeedface';
const poi = (id: string) => content.pois[id]!;

/** Plays a battle to the end: the player uses the engine AI's choice, or `player` if given. */
function play(
  save: SaveGame,
  player?: (s: BattleState) => Action | null,
  dex = content,
): { state: BattleState; events: BattleEvent[] } {
  let state = save.battle!.state;
  const events: BattleEvent[] = [];
  const tier = state.kind === 'wild' ? 'wild' : (state.sides[1].ai ?? 'trainer');
  while (state.result === 'ongoing') {
    const mine = (!state.sides[0].needsReplacement && player?.(state)) || null;
    const a0 = mine ?? chooseAiAction(state, 0, 'leader', dex);
    const r = resolveTurn(state, [a0, chooseAiAction(state, 1, tier, dex)], dex);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** Dev-style boost: the whole team at `level` (fresh creatures of the same species). */
function boost(save: SaveGame, level: number): SaveGame {
  return {
    ...save,
    team: save.team.map((c) => ({
      ...createCreature(c.speciesId, level, c.uid),
      fieldAbility: c.fieldAbility,
    })),
  };
}

function weaken(save: SaveGame): SaveGame {
  return { ...save, team: save.team.map((c) => ({ ...c, hp: 1 })) };
}

describe('badges, obedience, zones and districts (P22)', () => {
  it('obedience is 15 + 5 per badge; the start zone is open, others open with routes', () => {
    expect(obedienceLevel([])).toBe(15);
    expect(obedienceLevel([1])).toBe(20);
    expect(obedienceLevel([1, 2, 3])).toBe(30);
    const save = newSave(SEED);
    expect(isZoneOpen(save, 'centrum')).toBe(true);
    expect(isZoneOpen(save, 'naesbyhoved')).toBe(false);
    expect(isZoneOpen({ ...save, zones: ['naesbyhoved'] }, 'naesbyhoved')).toBe(true);
    // outside the region (no zone) nothing is locked
    expect(isZoneOpen(save, '')).toBe(true);
    expect(isDistrictOpen(save, 1)).toBe(true);
    expect(isDistrictOpen(save, 2)).toBe(false);
    expect(isDistrictOpen({ ...save, zones: ['havnen'] }, 2)).toBe(true);
  });

  it('an arena needs its zone open and badge n − 1', () => {
    const save = newSave(SEED);
    expect(arenaReady(save, 1)).toBe(true);
    expect(arenaReady(save, 2)).toBe(false);
    expect(arenaReady({ ...save, zones: ['naesbyhoved'] }, 2)).toBe(false);
    expect(arenaReady({ ...save, badges: [1] }, 2)).toBe(false);
    expect(arenaReady({ ...save, zones: ['naesbyhoved'], badges: [1] }, 2)).toBe(true);
  });

  it('battles carry the obedience level; trainers in unopened zones refuse', () => {
    const save = chooseStarter(newSave(SEED), 'gnistkat');
    const battle = startTrainerBattle(save, 'trainer_lise', 'route1_lise', 1).battle!;
    expect(battle.state.sides[0].obedienceLevel).toBe(15);
    expect(battle.state.sides[1].obedienceLevel).toBeNull();
    const locked = { ...poi('trainer_lise'), zone: 'stavis', district: 2 };
    expect(trainerStatus(save, locked)).toEqual({ kind: 'zoneLocked', zone: 'stavis' });
    expect(trainerStatus({ ...save, zones: ['stavis'] }, locked)?.kind).toBe('ready');
    const arena2 = poi('arena2');
    expect(trainerStatus(save, arena2)).toEqual({ kind: 'zoneLocked', zone: 'naesbyhoved' });
    expect(trainerStatus({ ...save, zones: ['naesbyhoved'] }, arena2)).toEqual({
      kind: 'locked',
      badge: 1,
    });
  });
});

describe('spawn status', () => {
  const save = chooseStarter(newSave(SEED), 'boegling');
  const spawn = { id: 's1', zone: 'centrum', requires: null, rarity: 'common' as const };
  it('ok, used, too wild, needs an ability, fainted team', () => {
    expect(spawnStatus(newSave(SEED), spawn)).toBe('noTeam');
    expect(spawnStatus(save, spawn)).toBe('ok');
    expect(spawnStatus({ ...save, usedSpawns: { s1: 9 } }, spawn)).toBe('used');
    expect(spawnStatus(save, { ...spawn, requires: 'forager' })).toBe('needsAbility');
    expect(spawnStatus(weaken(save), spawn)).toBe('ok');
    expect(spawnStatus({ ...save, team: save.team.map((c) => ({ ...c, hp: 0 })) }, spawn)).toBe(
      'teamFainted',
    );
  });
});

describe('GDD v1.7: open wildlife, locked rares, per-player levels', () => {
  const save = chooseStarter(newSave(SEED), 'boegling');
  const bands = {
    1: [3, 8],
    2: [8, 14],
    3: [13, 20],
    4: [19, 26],
    5: [25, 32],
    6: [31, 38],
    7: [37, 44],
    8: [43, 50],
  } as const;
  it('commons battle anywhere; rares and ability layers lock with their zone (P22)', () => {
    const far = { id: 'f', zone: 'hesbjerg', requires: null, rarity: 'common' as const };
    expect(spawnStatus(save, far)).toBe('ok');
    expect(spawnStatus(save, { ...far, rarity: 'rare' })).toBe('tooWild');
    expect(spawnStatus(save, { ...far, requires: 'forager' })).toBe('tooWild');
    // open zone: the ability still applies
    expect(spawnStatus(save, { ...far, zone: 'centrum', requires: 'forager' })).toBe(
      'needsAbility',
    );
    const opened = { ...save, zones: ['stavis'] };
    expect(spawnStatus(opened, { ...far, zone: 'stavis', rarity: 'rare' })).toBe('ok');
    expect(spawnStatus(opened, { ...far, zone: 'odins', rarity: 'rare' })).toBe('tooWild');
    // badges don't open zones
    expect(
      spawnStatus({ ...save, badges: [1] }, { ...far, zone: 'naesbyhoved', rarity: 'rare' }),
    ).toBe('tooWild');
  });

  it('common levels follow the player, rare levels the district', () => {
    const common = { rarity: 'common' as const, levelRoll: 0, district: 8 };
    expect(spawnLevel(common, [], bands)).toBe(3);
    expect(spawnLevel({ ...common, levelRoll: 0.9999 }, [], bands)).toBe(8);
    expect(spawnLevel(common, [1], bands)).toBe(8);
    expect(spawnLevel(common, [1, 2, 3, 4, 5, 6, 7, 8], bands)).toBe(43);
    expect(spawnLevel({ ...common, rarity: 'rare' }, [], bands)).toBe(43);
    expect(spawnLevel({ ...common, rarity: 'rare', district: 2, levelRoll: 0.5 }, [], bands)).toBe(
      11,
    );
    expect(playerBandDistrict([1, 2, 3, 4, 5, 6, 7, 8])).toBe(8);
    for (let r = 0; r < 1; r += 0.01) {
      const l = spawnLevel({ ...common, levelRoll: r }, [1], bands);
      expect(l).toBeGreaterThanOrEqual(8);
      expect(l).toBeLessThanOrEqual(14);
    }
  });
});

describe('onboarding and the tutorial catch', () => {
  it('starter at level 5 with charms; the tutorial creature has an easy catch rate', () => {
    const save = chooseStarter({ ...newSave(SEED), onboarding: 'starter' }, 'aaodder');
    expect(save.team).toHaveLength(1);
    expect(save.team[0]!.level).toBe(5);
    expect(save.bag.basic_charm).toBe(5);
    expect(save.onboarding).toBe('tutorial');
    expect(() => chooseStarter(save, 'gnistkat')).toThrow();
    expect(tutorialDex().species.torvdue!.catchRate).toBe(255);
    expect(content.species.torvdue!.catchRate).toBe(255);
  });

  it('a guided tutorial battle ends in a catch that joins the team', () => {
    let save = chooseStarter(newSave(SEED), 'gnistkat');
    save = startTutorialBattle(save, 3);
    const dex = tutorialDex();
    const { state, events } = play(save, () => ({ type: 'catch', itemId: 'basic_charm' }), dex);
    expect(state.result).toBe('caught');
    const out = finishBattle(save, state, events);
    expect(out.caughtTo).toBe('team');
    expect(out.save.team.map((c) => c.speciesId)).toEqual(['gnistkat', 'torvdue']);
    expect(out.save.onboarding).toBe('done');
    expect(out.save.caught.torvdue).toEqual([1]);
    expect(out.save.battle).toBeNull();
    expect(out.save.bag.basic_charm).toBeLessThan(5);
  });
});

describe('tutorial without a catch', () => {
  it('stays in the tutorial step when the creature faints or the player runs', () => {
    let save = chooseStarter(newSave(SEED), 'gnistkat');
    save = boost(startTutorialBattle(save, 3), 20);
    save = startTutorialBattle({ ...save, battle: null }, 3);
    const { state, events } = play(save, undefined, tutorialDex());
    expect(state.result).toBe('p1');
    const out = finishBattle(save, state, events);
    expect(out.save.onboarding).toBe('tutorial');
    expect(out.caught).toBeNull();
    expect(out.save.team).toHaveLength(1);
    // out of charms: the next tutorial battle tops them up
    const again = startTutorialBattle({ ...out.save, bag: {} }, 4);
    expect(again.battle!.state.sides[0].items.basic_charm).toBe(3);
  });
});

describe('district 1 run: trainers, losing, rest stops, arena 1, badge', () => {
  it('plays through to badge 1 and district 2', () => {
    // Odense as it plays (open, P28): the leader at the strength for 0 badges.
    Object.assign(regions.odense, { open: true });
    try {
      playDistrict1();
    } finally {
      Object.assign(regions.odense, { open: false });
    }
  });
  function playDistrict1() {
    let save: SaveGame = { ...chooseStarter(newSave(SEED), 'boegling'), onboarding: 'done' };

    // Route trainer at the expected level: a win, a reward, marked beaten.
    save = boost(save, 12);
    expect(trainerStatus(save, poi('trainer_ole'))).toEqual({
      kind: 'ready',
      trainerId: 'route1_ole',
    });
    save = startTrainerBattle(save, 'trainer_ole', 'route1_ole', 11);
    let r = play(save);
    let out = finishBattle(save, r.state, r.events);
    expect(out.won).toBe(true);
    expect(out.reward).toEqual({ itemId: 'clear_drops', count: 1 });
    save = out.save;
    expect(save.defeatedTrainers).toContain('route1_ole');
    expect(save.bag.clear_drops).toBe(1);
    expect(trainerStatus(save, poi('trainer_ole'))!.kind).toBe('beaten');

    // A loss: the team stays fainted, XP is kept, the trainer can be fought again.
    save = weaken(save);
    const xpBefore = save.team[0]!.xp;
    save = startTrainerBattle(save, 'trainer_niels', 'route1_niels', 5);
    r = play(save);
    out = finishBattle(save, r.state, r.events);
    expect(out.won).toBe(false);
    save = out.save;
    expect(save.team.every((c) => c.hp === 0)).toBe(true);
    expect(save.team[0]!.xp).toBeGreaterThanOrEqual(xpBefore);
    expect(save.defeatedTrainers).not.toContain('route1_niels');
    expect(trainerStatus(save, poi('trainer_niels'))).toEqual({ kind: 'teamFainted' });

    // Rest stop: full heal and restock.
    const rest = visitRestStop(save, poi('rest_library'), 1_000_000);
    save = rest.save;
    expect(rest.healed).toBe(true);
    expect(rest.restocked).toEqual({ basic_charm: 5, small_tonic: 2 });
    for (const c of save.team) expect(c.hp).toBe(getMaxHp(c));

    // Arena: never with the starter alone (P28), then junior before leader, then the badge.
    expect(trainerStatus(save, poi('arena1'))).toEqual({ kind: 'smallTeam', need: 3 });
    save = {
      ...save,
      team: [...save.team, createCreature('torvdue', 9, 'pt'), createCreature('mosbille', 9, 'pm')],
    };
    expect(trainerStatus(save, poi('arena1'))).toEqual({
      kind: 'ready',
      trainerId: 'arena1_junior',
    });
    save = startTrainerBattle(save, 'arena1', 'arena1_junior', 21);
    r = play(save);
    out = finishBattle(save, r.state, r.events);
    expect(out.won).toBe(true);
    expect(out.badge).toBeNull();
    save = visitRestStop(out.save, poi('rest_library'), 1_000_100).save;
    // Obedience is 15 before badge 1: a bigger team at 15, not an over-levelled one.
    save = {
      ...save,
      team: [
        ...save.team,
        createCreature('gnistkat', 15, 'pa'),
        createCreature('aaodder', 15, 'pb'),
      ],
    };
    save = boost(save, 15);
    expect(trainerStatus(save, poi('arena1'))).toEqual({ kind: 'ready', trainerId: 'leader_folk' });
    save = startTrainerBattle(save, 'arena1', 'leader_folk', 31);
    r = play(save);
    out = finishBattle(save, r.state, r.events);
    expect(out.won).toBe(true);
    expect(out.badge).toBe(1);
    expect(out.reward).toEqual({ itemId: 'revive_leaf', count: 1 });
    save = out.save;
    expect(save.badges).toEqual([1]);
    expect(obedienceLevel(save.badges)).toBe(20);
    expect(arenaReady({ ...save, zones: ['naesbyhoved'] }, 2)).toBe(true);
    expect(trainerStatus(save, poi('arena1'))!.kind).toBe('beaten');
  }
});

describe('rest stop restock timer', () => {
  it('once per hour per stop; a clock set backwards does not restock', () => {
    let save = chooseStarter(newSave(SEED), 'gnistkat');
    const t = 5_000_000;
    save = visitRestStop(save, poi('rest_library'), t).save;
    expect(canRestock(save, 'rest_library', t + 10)).toBe(false);
    expect(canRestock(save, 'rest_jernbanegade', t + 10)).toBe(true);
    expect(canRestock(save, 'rest_library', t + RESTOCK_SECONDS)).toBe(true);
    expect(canRestock(save, 'rest_library', t - 10 * RESTOCK_SECONDS)).toBe(false);
    const again = visitRestStop(save, poi('rest_library'), t + 60);
    expect(again.restocked).toBeNull();
    expect(again.save.bag.basic_charm).toBe(save.bag.basic_charm);
  });
});

describe('items outside battle', () => {
  it('tonic heals, clear drops cure, revive leaf revives at 50%', () => {
    let save = chooseStarter(newSave(SEED), 'gnistkat');
    const uid = save.team[0]!.uid;
    const max = getMaxHp(save.team[0]!);
    save = { ...save, bag: { small_tonic: 1, clear_drops: 1, revive_leaf: 1 } };
    save = { ...save, team: [{ ...save.team[0]!, hp: 1, status: 'poison' }] };
    save = applyItem(save, 'small_tonic', uid);
    expect(save.team[0]!.hp).toBe(Math.min(max, 21));
    save = applyItem(save, 'clear_drops', uid);
    expect(save.team[0]!.status).toBeNull();
    expect(() => applyItem(save, 'small_tonic', uid)).toThrow(); // none left
    save = { ...save, team: [{ ...save.team[0]!, hp: 0 }] };
    save = applyItem(save, 'revive_leaf', uid);
    expect(save.team[0]!.hp).toBe(Math.floor(max / 2));
    expect(save.bag).toEqual({ small_tonic: 0, clear_drops: 0, revive_leaf: 0 });
  });

  it('Revive Blossom (test item from Settings) revives with full HP, only when fainted', () => {
    let save = chooseStarter(newSave(SEED), 'gnistkat');
    const uid = save.team[0]!.uid;
    const max = getMaxHp(save.team[0]!);
    save = addToBag(save, 'revive_blossom');
    save = addToBag(save, 'revive_blossom');
    expect(save.bag.revive_blossom).toBe(2);
    // a healthy creature can't use it
    expect(canUseItem(save.team[0]!, 'revive_blossom')).toBe(false);
    expect(() => applyItem(save, 'revive_blossom', uid)).toThrow();
    save = { ...save, team: [{ ...save.team[0]!, hp: 0 }] };
    expect(canUseItem(save.team[0]!, 'revive_blossom')).toBe(true);
    save = applyItem(save, 'revive_blossom', uid);
    expect(save.team[0]!.hp).toBe(max);
    expect(save.bag.revive_blossom).toBe(1);
  });

  it('addToBag only takes known items and whole counts', () => {
    const save = chooseStarter(newSave(SEED), 'gnistkat');
    expect(() => addToBag(save, 'no_such_item')).toThrow();
    expect(() => addToBag(save, 'revive_blossom', 0)).toThrow();
    // adds to what the bag already holds
    expect(addToBag(save, 'small_tonic', 3).bag.small_tonic).toBe((save.bag.small_tonic ?? 0) + 3);
  });
});

describe('catching with a full team, storage and post-battle choices', () => {
  it('the 7th creature goes to storage; storage swaps keep the team at 6', () => {
    let save = chooseStarter(newSave(SEED), 'gnistkat');
    save = {
      ...save,
      team: [...save.team, ...[1, 2, 3, 4, 5].map((i) => createCreature('torvdue', 3, `px${i}`))],
    };
    save = boost(save, 20);
    const spawn = { id: 'sp', speciesId: 'rendsnude', level: 3, expiresAt: 9e9, district: 1 };
    save = startWildBattle(save, spawn, 4);
    expect(spawnStatus(save, { id: 'sp', zone: 'centrum', requires: null, rarity: 'common' })).toBe(
      'used',
    );
    // A worn-down wild creature (1 HP, asleep) is a sure catch with a charm.
    const wild = save.battle!.state.sides[1].team[0]!;
    wild.hp = 1;
    wild.status = 'sleep';
    wild.statusTurns = 5;
    save = { ...save, bag: { ...save.bag, great_charm: 3 } };
    save.battle!.state.sides[0].items.great_charm = 3;
    const r = play(save, () => ({ type: 'catch', itemId: 'great_charm' }));
    expect(r.state.result).toBe('caught');
    const out = finishBattle(save, r.state, r.events);
    expect(out.caughtTo).toBe('storage');
    save = out.save;
    expect(save.team).toHaveLength(6);
    expect(save.storage).toHaveLength(1);
    const stored = save.storage[0]!.uid;
    save = swapWithStorage(save, save.team[1]!.uid, stored);
    expect(save.team[1]!.uid).toBe(stored);
    save = moveToStorage(save, stored);
    expect(save.team).toHaveLength(5);
    save = moveToTeam(save, stored);
    expect(save.team).toHaveLength(6);
  });

  it('learn and evolve choices are saved and answered', () => {
    let save = chooseStarter(newSave(SEED), 'gnistkat');
    const uid = save.team[0]!.uid;
    save = {
      ...save,
      team: [createCreature('gnistkat', 16, uid)],
      pending: [{ kind: 'evolve', uid, into: 'baalkat' }],
    };
    save = answerPending(save, true);
    expect(save.team[0]!.speciesId).toBe('baalkat');
    expect(save.caught.baalkat).toEqual([1]);
    expect(save.pending).toEqual([]);
  });
});

describe('field abilities', () => {
  it('Forager: dev unlock, grove/folk only, takes a move slot, opens forager spawns', () => {
    let save = chooseStarter(newSave(SEED), 'boegling');
    const c = save.team[0]!;
    expect(canTeach(save, c, 'forager')).toBe('locked');
    save = { ...save, devAbilities: ['forager'] };
    expect(canTeach(save, c, 'forager')).toBe(c.moves.length >= 4 ? 'needsForget' : 'ok');
    expect(canTeach(save, createCreature('gnistkat', 5, 'x'), 'forager')).toBe('wrongType');
    save = teachFieldAbility(save, c.uid, 'forager', c.moves.length >= 4 ? 0 : null);
    expect(save.team[0]!.fieldAbility).toBe('forager');
    expect(save.team[0]!.moves.length).toBeLessThanOrEqual(3);
    expect(
      spawnStatus(save, { id: 'f', zone: 'centrum', requires: 'forager', rarity: 'rare' }),
    ).toBe('ok');

    // with 4 moves the player must forget one
    const full = {
      ...save,
      team: [{ ...createCreature('boegling', 30, 'q'), fieldAbility: undefined }],
    };
    delete full.team[0]!.fieldAbility;
    if (full.team[0]!.moves.length === 4) {
      expect(() => teachFieldAbility(full, 'q', 'forager', null)).toThrow();
      const taught = teachFieldAbility(full, 'q', 'forager', 1);
      expect(taught.team[0]!.moves).toHaveLength(3);
    }
    // a badge also unlocks it
    expect(
      canTeach({ ...newSave(SEED), badges: [2] }, createCreature('torvdue', 5, 'z'), 'forager'),
    ).not.toBe('locked');
  });
});

describe('team order (owner: drag to reorder)', () => {
  it('moves a creature from one place to another, keeping the rest in order', () => {
    let save: SaveGame = { ...chooseStarter(newSave(SEED), 'gnistkat'), onboarding: 'done' };
    save = {
      ...save,
      team: [...save.team, createCreature('torvdue', 5, 'a'), createCreature('mosbille', 5, 'b')],
    };
    const ids = (s: SaveGame) => s.team.map((c) => c.uid);
    const first = ids(save)[0]!;
    expect(ids(moveInTeam(save, 0, 2))).toEqual(['a', 'b', first]);
    expect(ids(moveInTeam(save, 2, 0))).toEqual(['b', first, 'a']);
    expect(moveInTeam(save, 1, 1)).toBe(save);
    expect(moveInTeam(save, 0, 9)).toBe(save);
  });
});
