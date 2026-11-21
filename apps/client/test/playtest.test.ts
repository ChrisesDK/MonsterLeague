import { content } from '@oml/data';
import { getLegalActions } from '@oml/engine';
import { describe, expect, it } from 'vitest';
import {
  SESSION_PLAN,
  buildPlaytestBattle,
  countAction,
  playerSide,
  wildPool,
} from '../src/playtest/plan';

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('playtest session plan', () => {
  it('follows the Gate 2 order with an optional arena 2 leader', () => {
    expect(SESSION_PLAN.map((s) => s.id)).toEqual([
      'wild1',
      'wild2',
      'trainer1',
      'leader1',
      'leader2',
    ]);
    expect(SESSION_PLAN.filter((s) => s.optional).map((s) => s.id)).toEqual(['leader2']);
    for (const s of SESSION_PLAN)
      if (s.trainerId) expect(content.trainers[s.trainerId]).toBeDefined();
  });

  it('wild pool excludes starter lines and rares', () => {
    const pool = wildPool();
    expect(pool).toContain('torvdue');
    expect(pool).not.toContain('gnistkat');
    expect(pool).not.toContain('baalkat');
    expect(pool).not.toContain('loftnisse');
    expect(pool).not.toContain('soeormling');
  });

  it('builds wild battles at L8–10 with the arena preset and charms', () => {
    const levels = new Set<number>();
    for (const r of [0, 0.34, 0.67, 0.99]) {
      const b = buildPlaytestBattle(SESSION_PLAN[0]!, 'water', seq(r));
      expect(b.state.kind).toBe('wild');
      expect(wildPool()).toContain(b.opponentId);
      levels.add(b.opponentLevel!);
      expect(b.state.sides[1].team[0]!.level).toBe(b.opponentLevel);
      expect(b.state.sides[0].team[0]!.speciesId).toBe('aaodder');
      expect(b.state.sides[0].ai).toBe(null);
      expect(getLegalActions(b.state, 0)).toContainEqual({ type: 'catch', itemId: 'basic_charm' });
    }
    expect([...levels].sort()).toEqual([10, 8, 9].sort());
  });

  it('builds trainer and leader battles from content, starter first', () => {
    const leader2 = buildPlaytestBattle(SESSION_PLAN[4]!, 'grove', seq(0.5));
    expect(leader2.state.kind).toBe('leader');
    expect(leader2.opponentId).toBe('leader_stone');
    expect(leader2.state.sides[0].team.map((c) => c.speciesId)[0]).toBe('boegling');
    expect(leader2.state.sides[0].team).toHaveLength(4);
    expect(leader2.state.sides[1].ai).toBe('leader');
    const trainer = buildPlaytestBattle(SESSION_PLAN[2]!, 'fire', seq(0.5));
    expect(trainer.state.kind).toBe('trainer');
    expect(trainer.opponentLevel).toBe(null);
    expect(playerSide(1, 'fire').team).toHaveLength(3);
    expect(() => playerSide(9, 'fire')).toThrow();
    expect(() =>
      buildPlaytestBattle(
        { id: 'x', kind: 'trainer', arena: 1, trainerId: 'nope' },
        'fire',
        seq(0),
      ),
    ).toThrow();
  });

  it('counts voluntary switches, items and catch attempts', () => {
    let c = { switches: 0, itemsUsed: 0, catchAttempts: 0 };
    c = countAction(c, { type: 'switch' }, false);
    c = countAction(c, { type: 'switch' }, true); // forced replacement: not counted
    c = countAction(c, { type: 'item' }, false);
    c = countAction(c, { type: 'catch' }, false);
    c = countAction(c, { type: 'move' }, false);
    expect(c).toEqual({ switches: 1, itemsUsed: 1, catchAttempts: 1 });
  });
});
