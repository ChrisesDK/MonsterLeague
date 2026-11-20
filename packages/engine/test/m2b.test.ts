import { describe, expect, it } from 'vitest';
import {
  createBattle,
  createCreature,
  gainXp,
  learnMove,
  resolveTurn,
  xpForLevel,
  type BattleEvent,
} from '../src/index';
import { dex, move, seeds } from './helpers';

const disobeys = (events: BattleEvent[]) => events.filter((e) => e.type === 'disobey').length;

function duel(seed: number, level: number, obedienceLevel: number | null | undefined) {
  const me = createCreature('torvdue', level, 'me', dex, { moves: ['t_strike'] });
  const foe = createCreature('brokrabbe', 40, 'foe', dex, { moves: ['t_wait'] });
  return createBattle(
    {
      kind: 'trainer',
      sides: [
        { team: [me], ...(obedienceLevel !== undefined ? { obedienceLevel } : {}) },
        { team: [foe], ai: 'trainer' },
      ],
    },
    seed,
    dex,
  );
}

describe('obedience (GDD: above the obedience level, orders are ignored 50% of the time)', () => {
  it('creatures above the level disobey about half the time', () => {
    const n = 400;
    const count = seeds(n, (seed) =>
      disobeys(resolveTurn(duel(seed, 25, 15), [move(), move()], dex).events),
    ).reduce((a, b) => a + b);
    expect(count / n).toBeGreaterThan(0.42);
    expect(count / n).toBeLessThan(0.58);
  });

  it('creatures at or below the level, and sides without a level, always obey', () => {
    for (const [level, cap] of [
      [15, 15],
      [25, null],
      [25, undefined],
    ] as const) {
      const total = seeds(100, (seed) =>
        disobeys(resolveTurn(duel(seed, level, cap), [move(), move()], dex).events),
      );
      expect(total.reduce((a, b) => a + b)).toBe(0);
    }
  });

  it('a disobedient turn uses no PP and makes no move', () => {
    const s = duel(1, 25, 15);
    const hit = seeds(60, (seed) =>
      resolveTurn({ ...s, rngState: duel(seed, 25, 15).rngState }, [move(), move()], dex),
    ).find((r) => disobeys(r.events) > 0)!;
    expect(hit.events.some((e) => e.type === 'move_used' && e.side === 0)).toBe(false);
    expect(hit.state.sides[0].team[0]!.moves[0]!.pp).toBe(s.sides[0].team[0]!.moves[0]!.pp);
  });

  it('is stored on the side (null by default)', () => {
    expect(duel(1, 10, 20).sides[0].obedienceLevel).toBe(20);
    expect(duel(1, 10, undefined).sides[0].obedienceLevel).toBe(null);
    expect(duel(1, 10, 20).sides[1].obedienceLevel).toBe(null);
  });
});

describe('field abilities take a move slot', () => {
  it('a creature with a field ability learns at most 3 battle moves', () => {
    const c = { ...createCreature('torvdue', 7, 'a', dex), fieldAbility: 'forager' };
    c.moves = c.moves.concat({ moveId: 'stern_glare', pp: 30 }); // 3 moves now
    expect(c.moves).toHaveLength(3);
    const events = gainXp(c, xpForLevel(8) - c.xp, 0, dex);
    expect(events.some((e) => e.type === 'move_learn_choice')).toBe(true);
    expect(c.moves).toHaveLength(3);
    expect(() => learnMove(c, 'kiln_blast', null, dex)).toThrow(/3 moves/);
    expect(learnMove(c, 'kiln_blast', 0, dex).moves[0]!.moveId).toBe('kiln_blast');
  });
});
