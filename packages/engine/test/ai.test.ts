import { describe, expect, it } from 'vitest';
import {
  chooseAiAction,
  chooseReplacement,
  createBattle,
  getLegalActions,
  isLegalAction,
  type BattleState,
} from '../src/index';
import { battle, dex, mk, move, seeds, turn } from './helpers';

describe('wild AI', () => {
  it('picks a random legal move, deterministically per state', () => {
    const s = battle(
      [mk('torvdue', 10)],
      [mk('mosbille', 10, ['t_strike', 't_wait', 't_heal'])],
      'wild',
    );
    const a = chooseAiAction(s, 1, 'wild', dex);
    expect(a.type).toBe('move');
    expect(chooseAiAction(s, 1, 'wild', dex)).toEqual(a);
    const picks = new Set(
      seeds(40, (seed) =>
        JSON.stringify(
          chooseAiAction(
            {
              ...s,
              rngState: createBattle(
                {
                  kind: 'wild',
                  sides: [{ team: [mk('torvdue', 1)] }, { team: [mk('torvdue', 1)] }],
                },
                seed,
                dex,
              ).rngState,
            },
            1,
            'wild',
            dex,
          ),
        ),
      ),
    );
    expect(picks.size).toBe(3);
  });

  it('does not consume battle randomness', () => {
    const s = battle([mk('torvdue', 10)], [mk('mosbille', 10)], 'wild');
    const before = [...s.rngState];
    chooseAiAction(s, 1, 'wild', dex);
    expect(s.rngState).toEqual(before);
  });
});

describe('trainer AI', () => {
  it('mostly picks the highest expected damage move, sometimes a random one', () => {
    const picks = seeds(200, (seed) => {
      const s = battle(
        [mk('mosbille', 10)],
        [mk('gnistkat', 10, ['t_wait', 't_fire', 't_strike'])],
        'trainer',
        seed,
      );
      const a = chooseAiAction(s, 1, 'trainer', dex);
      return a.type === 'move' ? a.index : -1;
    });
    const best = picks.filter((i) => i === 1).length; // fire vs grove, STAB
    expect(best / 200).toBeGreaterThan(0.75);
    expect(best / 200).toBeLessThan(0.97);
  });
});

describe('leader AI', () => {
  it('uses a healing item below 30% HP, at most twice', () => {
    const active = mk('grimaelling', 12, ['t_strike']);
    active.hp = 3;
    const s = battle(
      [mk('torvdue', 12)],
      { team: [active], items: { large_tonic: 5, small_tonic: 1 }, ai: 'leader' },
      'leader',
    );
    expect(chooseAiAction(s, 1, 'leader', dex)).toEqual({
      type: 'item',
      itemId: 'large_tonic',
      target: 0,
    });
    const used: BattleState = { ...s, sides: [s.sides[0], { ...s.sides[1], itemsUsed: 2 }] };
    expect(chooseAiAction(used, 1, 'leader', dex).type).toBe('move');
  });

  it('switches to a resisting teammate when at a 2× disadvantage', () => {
    // grove attacker vs water active (2×); the grove teammate resists grove (½).
    const s = battle(
      [mk('boegling', 14, ['beech_lash'])],
      {
        team: [mk('grimaelling', 14, ['t_strike']), mk('mosbille', 14, ['t_strike'])],
        ai: 'leader',
      },
      'leader',
    );
    expect(chooseAiAction(s, 1, 'leader', dex)).toEqual({ type: 'switch', index: 1 });
  });

  it('otherwise attacks with the best move', () => {
    const s = battle(
      [mk('torvdue', 14)],
      { team: [mk('grimaelling', 14, ['t_wait', 'brook_spout'])], ai: 'leader' },
      'leader',
    );
    expect(chooseAiAction(s, 1, 'leader', dex)).toEqual(move(1));
  });
});

describe('replacement', () => {
  it('picks a good match-up for trainers and the first creature for wild', () => {
    const s = battle([mk('mosbille', 20)], {
      team: [
        mk('torvdue', 5, ['t_strike']),
        mk('grimaelling', 20, ['brook_spout']),
        mk('gnistkat', 20, ['hearth_spark']),
      ],
      ai: 'trainer',
    });
    expect(chooseReplacement(s, 1, dex)).toBe(2);
    expect(
      chooseReplacement({ ...s, sides: [s.sides[0], { ...s.sides[1], ai: 'wild' }] }, 1, dex),
    ).toBe(1);
  });

  it('chooseAiAction handles the replacement phase', () => {
    const s = battle([mk('rendsnude', 5), mk('mosbille', 5)], [mk('torvdue', 50, ['t_big'])]);
    const r = turn(s, move(), move());
    expect(chooseAiAction(r.state, 1, 'trainer', dex)).toEqual({ type: 'pass' });
    const a = chooseAiAction(r.state, 0, 'trainer', dex);
    expect(isLegalAction(r.state, 0, a, dex)).toBe(true);
    expect(() => chooseAiAction({ ...r.state, result: 'p1' }, 0, 'wild', dex)).toThrow();
    expect(getLegalActions(r.state, 0, dex)).toHaveLength(1);
  });

  it('throws when nobody is left', () => {
    const s = battle([mk('torvdue', 5)], [mk('torvdue', 5)]);
    expect(() => chooseReplacement(s, 1, dex)).toThrow();
  });
});
