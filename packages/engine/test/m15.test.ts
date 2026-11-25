import { describe, expect, it } from 'vitest';
import {
  autoMoveset,
  canEvolve,
  chooseAiAction,
  createCreature,
  evolveCreature,
  gainXp,
  getActive,
  getLegalActions,
  getMaxHp,
  learnMove,
  MAX_TEAM_SIZE,
  MAX_TURNS,
  setupAction,
  xpForLevel,
  type BattleEvent,
  type BattleState,
} from '../src/index';
import { battle, dex, mk, move, seeds, turn } from './helpers';

const types = (events: BattleEvent[]) => events.map((e) => e.type);

describe('turn cap', () => {
  it('is 150 turns', () => expect(MAX_TURNS).toBe(150));
});

describe('running', () => {
  // mosbille L10 spd 14 is slower than torvdue L10 spd 21.
  const slow = (seed: number) =>
    battle([mk('mosbille', 10, ['t_wait'])], [mk('torvdue', 10, ['t_wait'])], 'wild', seed);

  it('succeeds about 50% of the time when slower, then +25% per failed attempt', () => {
    const first = seeds(400, (seed) => turn(slow(seed), { type: 'run' }, move()).state.result);
    const rate = first.filter((r) => r === 'ran').length / 400;
    expect(rate).toBeGreaterThan(0.42);
    expect(rate).toBeLessThan(0.58);

    const second = seeds(400, (seed) => {
      let s = slow(seed);
      let attempts = 0;
      for (let i = 0; i < 3 && s.result === 'ongoing'; i++) {
        const r = turn(s, { type: 'run' }, move());
        if (r.state.result === 'ongoing') {
          const failed = r.events.find((e) => e.type === 'run_failed');
          expect(failed).toEqual({ type: 'run_failed', side: 0, attempts: i + 1 });
          expect(r.state.sides[0].runAttempts).toBe(i + 1);
        }
        s = r.state;
        attempts = i + 1;
      }
      expect(s.result).toBe('ran'); // 50% → 75% → 100%
      return attempts;
    });
    expect(Math.max(...second)).toBeLessThanOrEqual(3);
  });

  it('a failed run lets the wild creature act', () => {
    const failed = seeds(40, (seed) => turn(slow(seed), { type: 'run' }, move())).find(
      (r) => r.state.result === 'ongoing',
    )!;
    expect(types(failed.events)).toEqual(['turn_start', 'run_failed', 'move_used', 'stat_change']);
  });
});

describe('catching with a full team', () => {
  const catchWith = (teamSize: number) => {
    const team = Array.from({ length: teamSize }, () => mk('mosbille', 10, ['t_wait']));
    const s = battle(
      { team, items: { great_charm: 1 } },
      [mk('torvdue', 5, ['t_wait'], { hp: 1 })],
      'wild',
    );
    return turn(s, { type: 'catch', itemId: 'great_charm' }, move());
  };

  it('sends the creature to storage when the team is full', () => {
    const r = catchWith(MAX_TEAM_SIZE);
    expect(r.state.result).toBe('caught');
    expect(types(r.events)).toContain('sent_to_storage');
    expect(r.state.caught?.destination).toBe('storage');
    expect(r.state.caught?.creature.speciesId).toBe('torvdue');
  });

  it('otherwise the creature joins the team', () => {
    const r = catchWith(1);
    expect(types(r.events)).not.toContain('sent_to_storage');
    expect(r.state.caught?.destination).toBe('team');
  });
});

describe('autoMoveset', () => {
  it('keeps the strongest damaging move per type, then the newest support moves', () => {
    expect(
      autoMoveset(
        ['shoulder_shove', 'stern_glare', 'cobbler_kick', 'hearth_spark', 'stoke_up', 'kiln_blast'],
        dex,
      ),
    ).toEqual(['stern_glare', 'cobbler_kick', 'stoke_up', 'kiln_blast']);
  });

  it('fills free slots with leftover moves and ignores duplicates or unknown ids', () => {
    expect(autoMoveset(['shoulder_shove', 'nimble_jab', 'shoulder_shove', 'nope'], dex)).toEqual([
      'shoulder_shove',
      'nimble_jab',
    ]);
  });

  it('prefers damaging coverage over support when there are more than 4 types', () => {
    const ids = [
      'beech_lash',
      'brook_spout',
      'hearth_spark',
      'cobble_toss',
      'squall_slap',
      'stoke_up',
    ];
    const kept = autoMoveset(ids, dex);
    expect(kept).toHaveLength(4);
    expect(kept).not.toContain('stoke_up');
    expect(kept).toContain('cobble_toss'); // strongest (50)
  });

  it('auto-learns in battle for AI sides, replacing what autoMoveset drops', () => {
    const c = createCreature('gnistkat', 27, 'a', dex);
    expect(c.moves.map((m) => m.moveId)).toContain('hearth_spark');
    const events = gainXp(c, xpForLevel(28) - c.xp, 1, dex, true);
    expect(events).toContainEqual({
      type: 'move_learned',
      side: 1,
      uid: 'a',
      moveId: 'kiln_blast',
      replaced: 'hearth_spark',
    });
    expect(c.moves.map((m) => m.moveId)).toContain('kiln_blast');
    // A weaker move is not learned at all.
    const d = createCreature('baalkat', 35, 'b', dex);
    const before = d.moves.map((m) => m.moveId);
    gainXp(d, xpForLevel(36) - d.xp, 1, dex, true);
    expect(d.moves.map((m) => m.moveId)).toEqual(before); // nimble_jab (40) < cobbler_kick (65)
  });
});

describe('outside-battle helpers', () => {
  it('learnMove appends, replaces, and never mutates', () => {
    const c = createCreature('torvdue', 3, 'a', dex);
    const appended = learnMove(c, 'squall_slap', null, dex);
    expect(appended.moves.map((m) => m.moveId)).toEqual([
      'shoulder_shove',
      'nimble_jab',
      'squall_slap',
    ]);
    expect(c.moves).toHaveLength(2);
    const full = createCreature('gnistkat', 12, 'b', dex);
    const replaced = learnMove(full, 'kiln_blast', 1, dex);
    expect(replaced.moves[1]).toEqual({ moveId: 'kiln_blast', pp: dex.moves.kiln_blast!.pp });
    expect(full.moves[1]!.moveId).toBe('hearth_spark');
    expect(learnMove(full, 'hearth_spark', 0, dex)).toBe(full);
    expect(() => learnMove(full, 'kiln_blast', null, dex)).toThrow(/forget/);
    expect(() => learnMove(full, 'kiln_blast', 7, dex)).toThrow();
    expect(() => learnMove(full, 'nope', 0, dex)).toThrow();
  });

  it('evolveCreature keeps damage taken and level', () => {
    const c = createCreature('aaodder', 16, 'a', dex);
    expect(canEvolve(c, dex)).toBe(true);
    const hurt = { ...c, hp: c.hp - 10 };
    const evolved = evolveCreature(hurt, dex);
    expect(evolved.speciesId).toBe('stroemodder');
    expect(evolved.level).toBe(16);
    expect(evolved.hp).toBe(getMaxHp(evolved, dex) - 10);
    expect(hurt.speciesId).toBe('aaodder');
    expect(evolveCreature({ ...c, hp: 0 }, dex).hp).toBe(0);
    expect(canEvolve(createCreature('aaodder', 15, 'b', dex), dex)).toBe(false);
    expect(canEvolve(createCreature('vinddue', 50, 'c', dex), dex)).toBe(false); // last stage
    expect(() => evolveCreature(createCreature('aaodder', 15, 'd', dex), dex)).toThrow();
  });
});

describe('set-up AI', () => {
  const leaderBattle = (self: string[], opp: string[], selfPatch = {}, oppPatch = {}) =>
    battle(
      [mk('torvdue', 20, opp, oppPatch)],
      { team: [mk('gnistkat', 20, self, selfPatch)], ai: 'leader' },
      'leader',
    );

  it('boosts when healthy, unboosted and not threatened with a KO', () => {
    const s = leaderBattle(['t_strike', 't_atk_up'], ['t_wait']);
    expect(chooseAiAction(s, 1, 'leader', dex)).toEqual(move(1));
  });

  it('does not boost when already boosted, hurt, or facing a KO', () => {
    const s = leaderBattle(['t_strike', 't_atk_up'], ['t_wait']);
    const boosted: BattleState = {
      ...s,
      sides: [s.sides[0], { ...s.sides[1], stages: { atk: 2, def: 0, spd: 0 } }],
    };
    expect(chooseAiAction(boosted, 1, 'leader', dex)).toEqual(move(0));
    const active = getActive(s, 1);
    const hurt = leaderBattle(['t_strike', 't_atk_up'], ['t_wait'], {
      hp: Math.floor(getMaxHp(active, dex) * 0.6),
    });
    expect(chooseAiAction(hurt, 1, 'leader', dex)).toEqual(move(0));
    // t_big does ~73 to a 92-HP gnistkat: above 70% HP (66) but inside KO range.
    const threatened = leaderBattle(['t_strike', 't_atk_up'], ['t_big'], { hp: 66 });
    expect(chooseAiAction(threatened, 1, 'leader', dex)).toEqual(move(0));
  });

  it('uses a status move when the target has no status', () => {
    const s = leaderBattle(['t_strike', 't_poison'], ['t_big']);
    expect(chooseAiAction(s, 1, 'leader', dex)).toEqual(move(1));
    const statused = leaderBattle(['t_strike', 't_poison'], ['t_big'], {}, { status: 'burn' });
    expect(chooseAiAction(statused, 1, 'leader', dex)).toEqual(move(0));
  });

  it('returns nothing without set-up moves or when out of PP', () => {
    const s = leaderBattle(['t_strike'], ['t_wait']);
    expect(setupAction(s, 1, getLegalActions(s, 1, dex), dex)).toBe(null);
    const empty = leaderBattle(['t_atk_up'], ['t_wait']);
    empty.sides[1].team[0]!.moves[0]!.pp = 0;
    expect(setupAction(empty, 1, getLegalActions(empty, 1, dex), dex)).toBe(null);
  });

  it('trainers apply the set-up rule about half of the time', () => {
    const picks = seeds(400, (seed) => {
      const s = battle(
        [mk('torvdue', 20, ['t_wait'])],
        { team: [mk('gnistkat', 20, ['t_strike', 't_atk_up'])], ai: 'trainer' },
        'trainer',
        seed,
      );
      const a = chooseAiAction(s, 1, 'trainer', dex);
      return a.type === 'move' ? a.index : -1;
    });
    // 20% random (half of which picks the boost) + 80% × 50% set-up ≈ 50% boosts.
    const boosts = picks.filter((i) => i === 1).length / 400;
    expect(boosts).toBeGreaterThan(0.4);
    expect(boosts).toBeLessThan(0.6);
  });
});

describe('revive leaf (M1.6, GDD items)', () => {
  it('revives a fainted bench creature at 50% HP and clears its status', () => {
    const fainted = mk('mosbille', 10, ['t_wait'], { hp: 0, status: 'poison' });
    const s = battle(
      { team: [mk('torvdue', 10, ['t_wait']), fainted], items: { revive_leaf: 1 } },
      [mk('rendsnude', 10, ['t_wait'])],
    );
    const legal = getLegalActions(s, 0, dex);
    expect(legal).toContainEqual({ type: 'item', itemId: 'revive_leaf', target: 1 });
    expect(legal).not.toContainEqual({ type: 'item', itemId: 'revive_leaf', target: 0 });
    const r = turn(s, { type: 'item', itemId: 'revive_leaf', target: 1 }, move());
    const revived = r.state.sides[0].team[1]!;
    expect(revived.hp).toBe(Math.floor(getMaxHp(revived, dex) / 2));
    expect(revived.status).toBe(null);
    expect(types(r.events).slice(1, 3)).toEqual(['item_used', 'heal']);
    expect(r.state.sides[0].items.revive_leaf).toBe(0);
    expect(getLegalActions(r.state, 0, dex)).toContainEqual({ type: 'switch', index: 1 });
  });

  it('is not offered when nobody has fainted', () => {
    const s = battle({ team: [mk('torvdue', 10)], items: { revive_leaf: 1 } }, [
      mk('rendsnude', 10),
    ]);
    expect(getLegalActions(s, 0, dex).some((a) => a.type === 'item')).toBe(false);
  });
});
