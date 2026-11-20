import { describe, expect, it } from 'vitest';
import { createCreature, getMaxHp } from '../src/index';
import { gainXp, levelForXp, xpForLevel, xpYield } from '../src/xp';
import { dex } from './helpers';

describe('xp curve', () => {
  it('xp to reach level n is n³', () => {
    expect(xpForLevel(1)).toBe(1);
    expect(xpForLevel(16)).toBe(4096);
    expect(levelForXp(4095)).toBe(15);
    expect(levelForXp(4096)).toBe(16);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(10 ** 9)).toBe(100);
  });

  it('yield = floor(baseXp × level × (1.5 if trainer) / 7 / participants)', () => {
    expect(xpYield(50, 10, 1, false)).toBe(71);
    expect(xpYield(50, 10, 2, false)).toBe(35);
    expect(xpYield(50, 10, 1, true)).toBe(107);
    expect(xpYield(50, 10, 0, true)).toBe(0);
  });
});

describe('gainXp', () => {
  it('levels up keeping damage taken', () => {
    const c = createCreature('torvdue', 10, 'a', dex);
    const max10 = getMaxHp(c, dex);
    c.hp = max10 - 7;
    const events = gainXp(c, xpForLevel(12) - c.xp, 0, dex);
    expect(c.level).toBe(12);
    expect(
      events.filter((e) => e.type === 'level_up').map((e) => (e as { level: number }).level),
    ).toEqual([11, 12]);
    expect(c.hp).toBe(getMaxHp(c, dex) - 7);
  });

  it('learns learnset moves when fewer than 4 are known', () => {
    const c = createCreature('torvdue', 7, 'a', dex);
    expect(c.moves).toHaveLength(2);
    const events = gainXp(c, xpForLevel(8) - c.xp, 0, dex);
    expect(events).toContainEqual({
      type: 'move_learned',
      side: 0,
      uid: 'a',
      moveId: 'squall_slap',
    });
    expect(c.moves.map((m) => m.moveId)).toContain('squall_slap');
  });

  it('emits move_learn_choice instead when 4 moves are known', () => {
    const c = createCreature('gnistkat', 12, 'a', dex);
    expect(c.moves).toHaveLength(4);
    const events = gainXp(c, xpForLevel(13) - c.xp, 1, dex);
    expect(events).toContainEqual({
      type: 'move_learn_choice',
      side: 1,
      uid: 'a',
      moveId: 'cinder_brand',
    });
    expect(c.moves).toHaveLength(4);
  });

  it('does not relearn a known move and ignores zero xp / unknown species', () => {
    const c = createCreature('baalkat', 12, 'a', dex, { moves: ['cinder_brand'] });
    const events = gainXp(c, xpForLevel(13) - c.xp, 0, dex);
    expect(events.some((e) => e.type === 'move_learned')).toBe(false);
    expect(gainXp(c, 0, 0, dex)).toEqual([]);
    expect(gainXp({ ...c, speciesId: 'nope' }, 100, 0, dex)).toEqual([]);
  });

  it('emits evolution_ready at the evolution level', () => {
    const c = createCreature('aaodder', 15, 'a', dex);
    const events = gainXp(c, xpForLevel(16) - c.xp, 0, dex);
    expect(events).toContainEqual({
      type: 'evolution_ready',
      side: 0,
      uid: 'a',
      speciesId: 'aaodder',
      into: 'stroemodder',
    });
    expect(c.speciesId).toBe('aaodder'); // evolution happens outside the battle
  });

  it('a fainted creature stays at 0 HP on level-up', () => {
    const c = { ...createCreature('torvdue', 10, 'a', dex), hp: 0 };
    gainXp(c, xpForLevel(11) - c.xp, 0, dex);
    expect(c.hp).toBe(0);
  });
});
