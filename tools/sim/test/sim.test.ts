import { describe, expect, it } from 'vitest';
import { battleKindFor, formatReport, median, parseSide, runSim } from '../src/sim';

describe('sim', () => {
  it('parses trainer, species and alias specs', () => {
    expect(parseSide('leader_water').tier).toBe('leader');
    expect(parseSide('starter_fire:12').label).toBe('gnistkat L12');
    expect(parseSide('torvdue:5,mosbille').build('x').team).toHaveLength(2);
    expect(() => parseSide('nobody')).toThrow();
    expect(() => parseSide('torvdue:0')).toThrow();
  });

  it('runs battles without errors and reports stats', () => {
    const a = parseSide('starter_fire:12');
    const b = parseSide('leader_water');
    expect(battleKindFor(a, b)).toBe('leader');
    const r = runSim({ a, b, n: 50, seed: 1 });
    expect(r.errors).toEqual([]);
    expect(r.sides[0].wins + r.sides[1].wins).toBe(50);
    expect(runSim({ a, b, n: 50, seed: 1 }).turns).toEqual(r.turns);
    const text = formatReport(r, a, b);
    expect(text).toMatch(/Win rate/);
    expect(text).toMatch(/Most used moves \(B\)/);
  });

  it('median', () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
