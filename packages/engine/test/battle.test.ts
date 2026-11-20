import { describe, expect, it } from 'vitest';
import {
  computeDamage,
  createBattle,
  createCreature,
  getActive,
  getLegalActions,
  getMaxHp,
  getStats,
  MAX_TURNS,
  resolveTurn,
  type BattleEvent,
  type BattleState,
} from '../src/index';
import { Rng } from '../src/rng';
import { battle, dex, mk, move, pass, seeds, sw, turn } from './helpers';

const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) =>
  events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

describe('creation', () => {
  it('createCreature auto-learns the strongest move per type, full HP, xp = L³', () => {
    // L12 known: shoulder_shove, stern_glare, hearth_spark, stoke_up, squall_slap.
    // One damaging move per type (folk, fire, storm) + the newest support move.
    const c = createCreature('gnistkat', 12, 'x', dex);
    expect(c.moves.map((m) => m.moveId)).toEqual([
      'shoulder_shove',
      'hearth_spark',
      'stoke_up',
      'squall_slap',
    ]);
    expect(c.moves[0]!.pp).toBe(dex.moves.shoulder_shove!.pp);
    expect(c.hp).toBe(getMaxHp(c, dex));
    expect(c.xp).toBe(12 ** 3);
    // L30: kiln_blast beats hearth_spark, cobbler_kick beats shoulder_shove.
    expect(createCreature('gnistkat', 30, 'y', dex).moves.map((m) => m.moveId)).toEqual([
      'squall_slap',
      'cinder_brand',
      'cobbler_kick',
      'kiln_blast',
    ]);
    expect(createCreature('gnistkat', 5, 'z', dex, { nickname: 'Mis' }).nickname).toBe('Mis');
    expect(() => createCreature('nope', 5, 'q', dex)).toThrow();
  });

  it('createBattle validates its config', () => {
    const a = mk('torvdue', 5);
    expect(() => battle([], [mk('torvdue', 5)])).toThrow(/empty/);
    expect(() => battle([{ ...a, hp: 0 }], [mk('torvdue', 5)])).toThrow(/usable/);
    expect(() => battle([a], [a])).toThrow(/unique/);
    expect(() => battle([mk('torvdue', 5)], [mk('torvdue', 5), mk('torvdue', 5)], 'wild')).toThrow(
      /wild/,
    );
    expect(() =>
      battle([{ ...mk('torvdue', 5), moves: [{ moveId: 'nope', pp: 1 }] }], [mk('torvdue', 5)]),
    ).toThrow();
  });

  it('starts with the first healthy creature and records participation', () => {
    const fainted = { ...mk('torvdue', 5), hp: 0 };
    const s = battle([fainted, mk('mosbille', 5)], [mk('rendsnude', 5)]);
    expect(s.sides[0].active).toBe(1);
    expect(s.participation[getActive(s, 1).uid]).toEqual([getActive(s, 0).uid]);
    expect(s.sides[0].gainsXp).toBe(true);
    expect(s.sides[1].gainsXp).toBe(false);
  });
});

describe('legal actions', () => {
  it('lists moves with PP, switches, usable items; run/catch only for side 0 in wild battles', () => {
    const a = mk('torvdue', 10, ['t_strike', 't_one_pp'], {});
    a.moves[1]!.pp = 0;
    const hurt = { ...mk('mosbille', 10), hp: 5 };
    const s = battle(
      { team: [a, hurt], items: { small_tonic: 1, clear_drops: 1, basic_charm: 2, nope: 1 } },
      [mk('rendsnude', 10)],
      'wild',
    );
    const legal = getLegalActions(s, 0, dex);
    expect(legal).toContainEqual(move(0));
    expect(legal).not.toContainEqual(move(1));
    expect(legal).toContainEqual(sw(1));
    expect(legal).toContainEqual({ type: 'item', itemId: 'small_tonic', target: 1 });
    expect(legal).not.toContainEqual({ type: 'item', itemId: 'small_tonic', target: 0 }); // full HP
    expect(legal.some((x) => x.type === 'item' && x.itemId === 'clear_drops')).toBe(false); // nobody has a status
    expect(legal).toContainEqual({ type: 'catch', itemId: 'basic_charm' });
    expect(legal).toContainEqual({ type: 'run' });
    expect(getLegalActions(s, 1, dex)).toEqual([move(0)]);
  });

  it('has no run or catch in trainer battles', () => {
    const s = battle({ team: [mk('torvdue', 10)], items: { basic_charm: 1 } }, [
      mk('rendsnude', 10),
    ]);
    expect(getLegalActions(s, 0, dex).map((a) => a.type)).toEqual(['move']);
  });

  it('falls back to a single move action when out of PP', () => {
    const a = mk('torvdue', 10, ['t_one_pp']);
    a.moves[0]!.pp = 0;
    const s = battle([a], [mk('rendsnude', 10)]);
    expect(getLegalActions(s, 0, dex)).toEqual([move(0)]);
  });

  it('rejects illegal actions and finished battles', () => {
    const s = battle([mk('torvdue', 10)], [mk('rendsnude', 10)]);
    expect(() => turn(s, move(3), move(0))).toThrow(/Illegal/);
    expect(() => turn(s, { type: 'run' }, move(0))).toThrow(/Illegal/);
    expect(() => turn({ ...s, result: 'p1' }, move(0), move(0))).toThrow(/over/);
    expect(getLegalActions({ ...s, result: 'p1' }, 0, dex)).toEqual([]);
  });
});

describe('turn order', () => {
  const firstMover = (events: BattleEvent[]) => ofType(events, 'move_used')[0]!.side;

  it('faster creature moves first', () => {
    const s = battle([mk('torvdue', 20)], [mk('mosbille', 20)]); // spd 37 vs 23
    expect(firstMover(turn(s, move(), move()).events)).toBe(0);
    const s2 = battle([mk('mosbille', 20)], [mk('torvdue', 20)]);
    expect(firstMover(turn(s2, move(), move()).events)).toBe(1);
  });

  it('higher priority beats speed; negative priority goes last', () => {
    const s = battle([mk('mosbille', 20, ['t_quick'])], [mk('torvdue', 20)]);
    expect(firstMover(turn(s, move(), move()).events)).toBe(0);
    const s2 = battle([mk('torvdue', 20, ['t_slow'])], [mk('mosbille', 20)]);
    expect(firstMover(turn(s2, move(), move()).events)).toBe(1);
  });

  it('switches and items happen before moves', () => {
    const s = battle(
      { team: [mk('mosbille', 20), mk('rendsnude', 20)], items: { small_tonic: 1 } },
      [mk('torvdue', 20, ['t_quick'])],
    );
    const { events } = turn(s, sw(1), move());
    expect(events.findIndex((e) => e.type === 'switch')).toBeLessThan(
      events.findIndex((e) => e.type === 'move_used'),
    );
    const hurt = {
      ...s,
      sides: [
        { ...s.sides[0], team: [{ ...s.sides[0].team[0]!, hp: 3 }, s.sides[0].team[1]!] },
        s.sides[1],
      ],
    } as BattleState;
    const r = turn(hurt, { type: 'item', itemId: 'small_tonic', target: 0 }, move());
    expect(r.events.findIndex((e) => e.type === 'item_used')).toBeLessThan(
      r.events.findIndex((e) => e.type === 'move_used'),
    );
    expect(r.state.sides[0].items.small_tonic).toBe(0);
  });

  it('paralysis halves speed', () => {
    // torvdue (37) normally outspeeds rendsnude L20 (35); paralysed it is slower.
    const s = battle(
      [mk('torvdue', 20, ['t_strike'], { status: 'paralysis' })],
      [mk('rendsnude', 20)],
    );
    const orders = seeds(30, (seed) => {
      const r = turn(
        {
          ...s,
          rngState: battle([mk('torvdue', 1)], [mk('torvdue', 1)], 'trainer', seed).rngState,
        },
        move(),
        move(),
      );
      return ofType(r.events, 'move_used')[0]?.side ?? ofType(r.events, 'cant_act')[0]?.side;
    });
    expect(orders.every((side) => side === 1)).toBe(true);
  });

  it('breaks speed ties with the seeded RNG, deterministically', () => {
    const run = (seed: number) => {
      const s = createBattle(
        {
          kind: 'trainer',
          sides: [{ team: [mk('torvdue', 20)] }, { team: [mk('torvdue', 20)], ai: 'trainer' }],
        },
        seed,
        dex,
      );
      return firstMover(resolveTurn(s, [move(), move()], dex).events);
    };
    const firsts = seeds(40, run);
    expect(firsts).toContain(0);
    expect(firsts).toContain(1);
    expect(seeds(40, run)).toEqual(firsts);
  });
});

describe('moves', () => {
  it('matches the damage formula with a fixed seed', () => {
    const s = battle(
      [mk('torvdue', 20, ['t_strike'])],
      [mk('mosbille', 20, ['t_wait'])],
      'trainer',
      1234,
    );
    const { events } = turn(s, move(), move());
    // Draw order for side 0's move: no accuracy roll (null), crit roll, random factor.
    const rng = new Rng(s.rngState);
    const crit = rng.next() < 1 / 16;
    const random = 0.85 + rng.next() * 0.15;
    const atk = getStats(getActive(s, 0), dex).atk;
    const def = getStats(getActive(s, 1), dex).def;
    const expected = computeDamage({
      level: 20,
      power: 40,
      atk,
      def,
      stab: true,
      typeMul: 1,
      crit,
      random,
      burned: false,
    });
    const dmg = ofType(events, 'damage').find((e) => e.side === 1)!;
    expect(dmg.amount).toBe(expected);
    expect(dmg.hp).toBe(getActive(s, 1).hp - expected);
  });

  it('can miss', () => {
    const misses = seeds(20, (seed) => {
      const s = battle(
        [mk('torvdue', 20, ['t_miss'])],
        [mk('mosbille', 20, ['t_wait'])],
        'trainer',
        seed,
      );
      return ofType(turn(s, move(), move()).events, 'miss').length;
    });
    expect(misses.reduce((a, b) => a + b)).toBeGreaterThan(15);
  });

  it('reports effectiveness and immunity (folk cannot hit spirit)', () => {
    const s = battle([mk('torvdue', 20, ['t_strike', 't_fire'])], [mk('lygtling', 20, ['t_wait'])]);
    const r = turn(s, move(0), move());
    expect(ofType(r.events, 'effectiveness')[0]!.multiplier).toBe(0);
    expect(ofType(r.events, 'damage')).toHaveLength(0);
    const s2 = battle([mk('torvdue', 20, ['t_fire'])], [mk('mosbille', 20, ['t_wait'])]);
    expect(ofType(turn(s2, move(0), move()).events, 'effectiveness')[0]!.multiplier).toBe(2);
  });

  it('crits sometimes', () => {
    const crits = seeds(200, (seed) => {
      const s = battle([mk('torvdue', 20)], [mk('mosbille', 20, ['t_wait'])], 'trainer', seed);
      return ofType(turn(s, move(), move()).events, 'crit').length;
    }).reduce((a, b) => a + b);
    expect(crits).toBeGreaterThan(3);
    expect(crits).toBeLessThan(30);
  });

  it('uses PP and the fallback move when out of PP', () => {
    const s = battle([mk('torvdue', 20, ['t_one_pp'])], [mk('brokrabbe', 30, ['t_wait'])]);
    const r1 = turn(s, move(), move());
    expect(r1.state.sides[0].team[0]!.moves[0]!.pp).toBe(0);
    const r2 = turn(r1.state, move(), move());
    const used = ofType(r2.events, 'move_used').find((e) => e.side === 0)!;
    expect(used.moveId).toBe('desperate_swing');
    expect(ofType(r2.events, 'damage').some((e) => e.side === 0 && e.source === 'recoil')).toBe(
      true,
    );
  });

  it('applies recoil and heal effects', () => {
    const s = battle([mk('torvdue', 20, ['t_recoil'])], [mk('brokrabbe', 30, ['t_wait'])]);
    const r = turn(s, move(), move());
    const hit = ofType(r.events, 'damage').find((e) => e.side === 1)!;
    const recoil = ofType(r.events, 'damage').find((e) => e.side === 0)!;
    expect(recoil.source).toBe('recoil');
    expect(recoil.amount).toBe(Math.max(1, Math.floor(hit.amount / 2)));

    const healer = mk('mosbille', 20, ['t_heal']);
    const max = getMaxHp(healer, dex);
    const s2 = battle([{ ...healer, hp: 1 }], [mk('torvdue', 2, ['t_wait'])]);
    const h = ofType(turn(s2, move(), move()).events, 'heal')[0]!;
    expect(h.amount).toBe(Math.floor(max / 2));
    const s3 = battle([healer], [mk('torvdue', 2, ['t_wait'])]);
    expect(ofType(turn(s3, move(), move()).events, 'no_effect')).toHaveLength(1);
  });

  it('skips a move whose target already fainted this turn', () => {
    const s = battle([mk('torvdue', 50, ['t_big'])], [mk('rendsnude', 5), mk('mosbille', 5)]);
    const r = turn(s, move(), move());
    expect(ofType(r.events, 'move_used')).toHaveLength(1);
    expect(ofType(r.events, 'faint')).toHaveLength(1);
  });
});

describe('stat stages', () => {
  it('raises a stat, boosts damage, caps at +6 and resets on switch', () => {
    let s = battle(
      [mk('gnistkat', 20, ['t_atk_up', 't_strike']), mk('mosbille', 20)],
      [mk('brokrabbe', 40, ['t_wait'])],
    );
    const r = turn(s, move(0), move());
    expect(ofType(r.events, 'stat_change')[0]).toMatchObject({ stat: 'atk', stages: 2, stage: 2 });
    s = r.state;
    for (let i = 0; i < 3; i++) s = turn(s, move(0), move()).state;
    expect(s.sides[0].stages.atk).toBe(6);
    const capped = turn(s, move(0), move());
    expect(ofType(capped.events, 'stat_change')[0]).toMatchObject({ stages: 0, stage: 6 });
    const switched = turn(s, sw(1), move());
    expect(switched.state.sides[0].stages.atk).toBe(0);
  });

  it('lowers the target stat', () => {
    const s = battle([mk('mosbille', 20, ['t_spd_down'])], [mk('torvdue', 20)]);
    const r = turn(s, move(), move());
    expect(r.state.sides[1].stages.spd).toBe(-6);
  });
});

describe('statuses', () => {
  it('burn: deals 1/16 max HP at end of turn and halves damage', () => {
    const s = battle([mk('mosbille', 20, ['t_burn'])], [mk('torvdue', 20, ['t_wait'])]);
    const r = turn(s, move(), move());
    const target = getActive(r.state, 1);
    expect(target.status).toBe('burn');
    const sd = ofType(r.events, 'status_damage')[0]!;
    expect(sd.amount).toBe(Math.floor(getMaxHp(target, dex) / 16));

    const dmg = (status: 'burn' | null) => {
      const b = battle(
        [mk('torvdue', 30, ['t_strike'], { status })],
        [mk('brokrabbe', 30, ['t_wait'])],
        'trainer',
        99,
      );
      return ofType(turn(b, move(), move()).events, 'damage').find((e) => e.side === 1)!.amount;
    };
    expect(dmg('burn')).toBeLessThan(dmg(null));
  });

  it('poison: deals 1/8 max HP at end of turn (min 1)', () => {
    const s = battle([mk('mosbille', 20, ['t_poison'])], [mk('torvdue', 20, ['t_wait'])]);
    const r = turn(s, move(), move());
    const target = getActive(r.state, 1);
    expect(ofType(r.events, 'status_damage')[0]!.amount).toBe(
      Math.floor(getMaxHp(target, dex) / 8),
    );
    const tiny = battle(
      [mk('torvdue', 1, ['t_wait'], { status: 'poison' })],
      [mk('rendsnude', 1, ['t_wait'])],
    );
    expect(
      ofType(turn(tiny, move(), move()).events, 'status_damage')[0]!.amount,
    ).toBeGreaterThanOrEqual(1);
  });

  it('only one status per creature', () => {
    const s = battle(
      [mk('mosbille', 20, ['t_poison'])],
      [mk('torvdue', 20, ['t_wait'], { status: 'burn' })],
    );
    const r = turn(s, move(), move());
    expect(getActive(r.state, 1).status).toBe('burn');
    expect(ofType(r.events, 'no_effect')).toHaveLength(1);
  });

  it('sleep: cannot act for 1–3 turns, then wakes', () => {
    const counts = seeds(40, (seed) => {
      let s = battle(
        [mk('mosbille', 20, ['t_sleep', 't_wait'])],
        [mk('torvdue', 20, ['t_strike'])],
        'trainer',
        seed,
      );
      // t_sleep has +1 priority, so the target already skips its action this turn.
      const first = turn(s, move(0), move());
      expect(ofType(first.events, 'status_applied')[0]!.status).toBe('sleep');
      let skipped = ofType(first.events, 'cant_act').length;
      s = first.state;
      for (let i = 0; i < 6 && getActive(s, 1).status === 'sleep'; i++) {
        const r = turn(s, move(1), move());
        skipped += ofType(r.events, 'cant_act').filter((e) => e.reason === 'sleep').length;
        s = r.state;
      }
      expect(getActive(s, 1).status).toBe(null);
      return skipped;
    });
    expect(Math.min(...counts)).toBe(1);
    expect(Math.max(...counts)).toBe(3);
  });

  it('paralysis: about 25% of turns are skipped', () => {
    const skipped = seeds(400, (seed) => {
      const s = battle(
        [mk('torvdue', 20, ['t_strike'], { status: 'paralysis' })],
        [mk('brokrabbe', 40, ['t_wait'])],
        'trainer',
        seed,
      );
      return ofType(turn(s, move(), move()).events, 'cant_act').length;
    }).reduce((a, b) => a + b);
    expect(skipped / 400).toBeGreaterThan(0.17);
    expect(skipped / 400).toBeLessThan(0.33);
  });

  it('clear drops cures a status', () => {
    const s = battle(
      { team: [mk('torvdue', 20, ['t_wait'], { status: 'poison' })], items: { clear_drops: 1 } },
      [mk('rendsnude', 20, ['t_wait'])],
    );
    const r = turn(s, { type: 'item', itemId: 'clear_drops', target: 0 }, move());
    expect(ofType(r.events, 'status_cured')[0]!.status).toBe('poison');
    expect(getActive(r.state, 0).status).toBe(null);
    expect(ofType(r.events, 'status_damage')).toHaveLength(0);
  });

  it('tonics heal up to max HP', () => {
    const c = mk('torvdue', 20, ['t_wait']);
    const max = getMaxHp(c, dex);
    const s = battle({ team: [{ ...c, hp: max - 5 }], items: { large_tonic: 1 } }, [
      mk('rendsnude', 20, ['t_wait']),
    ]);
    const r = turn(s, { type: 'item', itemId: 'large_tonic', target: 0 }, move());
    expect(ofType(r.events, 'heal')[0]!.amount).toBe(5);
    expect(getActive(r.state, 0).hp).toBe(max);
  });
});

describe('catching and running', () => {
  const wild = (seed: number, hp?: number) => {
    const w = mk('torvdue', 5, ['t_wait']);
    return battle(
      { team: [mk('mosbille', 10, ['t_wait'])], items: { basic_charm: 5, great_charm: 1 } },
      [{ ...w, hp: hp ?? w.hp }],
      'wild',
      seed,
    );
  };

  it('can catch a weakened wild creature', () => {
    const results = seeds(30, (seed) => {
      const r = turn(wild(seed, 1), { type: 'catch', itemId: 'great_charm' }, move());
      const attempt = ofType(r.events, 'catch_attempt')[0]!;
      expect(attempt.chance).toBeCloseTo(1);
      expect(r.state.sides[0].items.great_charm).toBe(0);
      return r.state.result;
    });
    expect(results.every((x) => x === 'caught')).toBe(true);
  });

  it('a failed catch lets the battle continue', () => {
    const outcomes = seeds(40, (seed) => {
      const r = turn(wild(seed), { type: 'catch', itemId: 'basic_charm' }, move());
      const attempt = ofType(r.events, 'catch_attempt')[0]!;
      expect(attempt.chance).toBeCloseTo(1 / 3);
      if (!attempt.success) expect(ofType(r.events, 'move_used')).toHaveLength(1);
      return r.state.result;
    });
    expect(outcomes).toContain('caught');
    expect(outcomes).toContain('ongoing');
  });

  it('run always succeeds when faster', () => {
    const r = turn(wild(1), { type: 'run' }, move());
    expect(r.state.result).toBe('ran');
    expect(r.events.map((e) => e.type)).toEqual(['turn_start', 'ran', 'battle_end']);
  });
});

describe('faint, replacement and battle end', () => {
  it('AI sides replace immediately; pending actions of fainted creatures are cancelled', () => {
    const s = battle([mk('torvdue', 50, ['t_big'])], [mk('rendsnude', 5), mk('mosbille', 5)]);
    const r = turn(s, move(), move());
    expect(ofType(r.events, 'faint')).toHaveLength(1);
    expect(ofType(r.events, 'switch')[0]).toMatchObject({ side: 1, index: 1 });
    expect(r.state.sides[1].active).toBe(1);
    expect(r.state.result).toBe('ongoing');
  });

  it('a human side gets needs_replacement and then a replacement step', () => {
    const s = battle([mk('rendsnude', 5), mk('mosbille', 5)], [mk('torvdue', 50, ['t_big'])]);
    const r = turn(s, move(), move());
    expect(ofType(r.events, 'needs_replacement')).toEqual([{ type: 'needs_replacement', side: 0 }]);
    expect(r.state.sides[0].needsReplacement).toBe(true);
    expect(getLegalActions(r.state, 0, dex)).toEqual([sw(1)]);
    expect(getLegalActions(r.state, 1, dex)).toEqual([pass]);
    const turnBefore = r.state.turn;
    const r2 = turn(r.state, sw(1), pass);
    expect(r2.state.sides[0].active).toBe(1);
    expect(r2.state.sides[0].needsReplacement).toBe(false);
    expect(r2.state.turn).toBe(turnBefore);
    expect(r2.events.map((e) => e.type)).toEqual(['switch']);
  });

  it('the side with no usable creatures loses', () => {
    const win = turn(battle([mk('torvdue', 50, ['t_big'])], [mk('rendsnude', 5)]), move(), move());
    expect(win.state.result).toBe('p1');
    expect(win.events.at(-1)).toEqual({ type: 'battle_end', result: 'p1' });
    const lose = turn(battle([mk('rendsnude', 5)], [mk('torvdue', 50, ['t_big'])]), move(), move());
    expect(lose.state.result).toBe('p2');
  });

  it('a recoil or status faint can end the battle', () => {
    const s = battle(
      [mk('torvdue', 5, ['t_wait'], { status: 'poison', hp: 1 })],
      [mk('rendsnude', 5, ['t_wait'])],
    );
    const r = turn(s, move(), move());
    expect(r.state.result).toBe('p2');
    const s2 = battle(
      [mk('torvdue', 50, ['t_recoil'], { hp: 1 })],
      [mk('brokrabbe', 50, ['t_wait'])],
    );
    expect(turn(s2, move(), move()).state.result).toBe('p2');
  });

  it(`decides on remaining HP after ${MAX_TURNS} turns`, () => {
    const s = battle([mk('brokrabbe', 50, ['t_wait'])], [mk('brokrabbe', 50, ['t_wait'])]);
    const hurt: BattleState = { ...s, turn: MAX_TURNS - 1 };
    hurt.sides[1].team[0]!.hp -= 1;
    const r = turn(hurt, move(), move());
    expect(r.state.result).toBe('p1');
  });
});

describe('xp in battle', () => {
  it('awards xp to participants and levels up', () => {
    const s = battle(
      [mk('gnistkat', 15, ['t_big'])],
      [mk('soeormling', 20, ['t_wait'], { hp: 1 })],
    );
    const r = turn(s, move(), move());
    const gain = ofType(r.events, 'xp_gain')[0]!;
    expect(gain.amount).toBe(Math.floor((180 * 20 * 1.5) / 7)); // 771: 3375 → 4146 xp
    expect(ofType(r.events, 'level_up').map((e) => e.level)).toEqual([16]);
    expect(ofType(r.events, 'evolution_ready')[0]).toMatchObject({ into: 'baalkat' });
    expect(getActive(r.state, 0).level).toBe(16);
  });

  it('splits xp between participants and gives none to the AI side', () => {
    const s = battle(
      [mk('torvdue', 10, ['t_wait']), mk('torvdue', 10, ['t_big'])],
      [mk('mosbille', 10, ['t_wait'], { hp: 1 })],
      'wild',
    );
    const r1 = turn(s, sw(1), move());
    const r2 = turn(r1.state, move(), move());
    const gains = ofType(r2.events, 'xp_gain');
    expect(gains).toHaveLength(2);
    expect(gains[0]!.amount).toBe(Math.floor((50 * 10) / 7 / 2));

    const lose = turn(battle([mk('rendsnude', 5)], [mk('torvdue', 50, ['t_big'])]), move(), move());
    expect(ofType(lose.events, 'xp_gain')).toHaveLength(0);
  });
});

describe('immutability', () => {
  it('never mutates the input state', () => {
    const s = battle(
      { team: [mk('torvdue', 20, ['t_strike', 't_burn'])], items: { small_tonic: 1 } },
      [mk('mosbille', 20)],
    );
    const snapshot = JSON.stringify(s);
    turn(s, move(1), move());
    turn(s, move(0), move());
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
