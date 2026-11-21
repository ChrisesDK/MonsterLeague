import { describe, expect, it } from 'vitest';
import {
  addCreatureForTest,
  chooseStarter,
  naturalRecovery,
  newSave,
  noteFainted,
  recoversAt,
  RECOVERY_SECONDS,
  teamFainted,
  type SaveGame,
} from './helpers';

const SEED = '0123456789abcdef0123456789abcdef';
const T0 = 1_800_000_000;

function faintedTeam(): SaveGame {
  const s = addCreatureForTest(chooseStarter(newSave(SEED), 'gnistkat'), 'torvdue', 4);
  return { ...s, team: s.team.map((c) => ({ ...c, hp: 0 })) };
}

describe('fainted creatures recover after 8 hours (owner request after M2d)', () => {
  it('starts a clock for each fainted creature, once', () => {
    let s = noteFainted(faintedTeam(), T0);
    expect(Object.values(s.faintedSince)).toEqual([T0, T0]);
    expect(noteFainted(s, T0 + 600)).toBe(s); // unchanged: same object, nothing to save
    expect(recoversAt(s, s.team[0]!.uid)).toBe(T0 + RECOVERY_SECONDS);
    // healed elsewhere (rest stop, tonic): the clock goes away
    s = { ...s, team: s.team.map((c, i) => (i === 0 ? { ...c, hp: 10 } : c)) };
    s = noteFainted(s, T0 + 700);
    expect(Object.keys(s.faintedSince)).toEqual([s.team[1]!.uid]);
  });

  it('heals them fully once 8 hours have passed, not before', () => {
    const s = noteFainted(faintedTeam(), T0);
    expect(naturalRecovery(s, T0 + RECOVERY_SECONDS - 1).save).toBe(s);
    const r = naturalRecovery(s, T0 + RECOVERY_SECONDS);
    expect(r.recovered).toHaveLength(2);
    expect(teamFainted(r.save.team)).toBe(false);
    expect(r.save.team.every((c) => c.hp > 0)).toBe(true);
    expect(r.save.faintedSince).toEqual({});
  });

  it('never heals in the middle of a battle', () => {
    const s = noteFainted(faintedTeam(), T0);
    const inBattle = { ...s, battle: { kind: 'tutorial', state: {} } } as unknown as SaveGame;
    expect(naturalRecovery(inBattle, T0 + RECOVERY_SECONDS).recovered).toEqual([]);
  });
});
