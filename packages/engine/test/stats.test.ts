import { describe, expect, it } from 'vitest';
import { calcHp, calcStat, calcStats, clampStage, stageMultiplier } from '../src/stats';

describe('stats', () => {
  it('uses floor(base × 2 × L / 100) + 5 for non-HP stats', () => {
    expect(calcStat(80, 12)).toBe(Math.floor((80 * 2 * 12) / 100) + 5); // 24
    expect(calcStat(80, 12)).toBe(24);
    expect(calcStat(100, 100)).toBe(205);
    expect(calcStat(1, 1)).toBe(5);
  });

  it('uses floor(base × 2 × L / 100) + L + 10 for HP', () => {
    expect(calcHp(70, 12)).toBe(16 + 12 + 10);
    expect(calcHp(100, 100)).toBe(310);
  });

  it('calcStats combines all four', () => {
    expect(calcStats({ hp: 70, atk: 80, def: 60, spd: 90 }, 12)).toEqual({
      hp: 38,
      atk: 24,
      def: 19,
      spd: 26,
    });
  });

  it('stage multipliers: ×1.5 per positive, ÷1.5 per negative, clamped to ±6', () => {
    expect(stageMultiplier(0)).toBe(1);
    expect(stageMultiplier(1)).toBe(1.5);
    expect(stageMultiplier(2)).toBe(2.25);
    expect(stageMultiplier(-1)).toBeCloseTo(1 / 1.5);
    expect(stageMultiplier(-2)).toBeCloseTo(1 / 2.25);
    expect(stageMultiplier(6)).toBeCloseTo(1.5 ** 6);
    expect(stageMultiplier(9)).toBeCloseTo(1.5 ** 6);
    expect(clampStage(-9)).toBe(-6);
    expect(clampStage(3)).toBe(3);
  });
});
