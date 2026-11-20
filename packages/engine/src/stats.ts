import type { BaseStats } from '@oml/data';
import type { StageStat, Stats } from './types';

export const MIN_STAGE = -6;
export const MAX_STAGE = 6;
export const MAX_LEVEL = 100;

/** Non-HP stat at level L: floor(base × 2 × L / 100) + 5 */
export function calcStat(base: number, level: number): number {
  return Math.floor((base * 2 * level) / 100) + 5;
}

/** HP at level L: floor(base × 2 × L / 100) + L + 10 */
export function calcHp(base: number, level: number): number {
  return Math.floor((base * 2 * level) / 100) + level + 10;
}

export function calcStats(base: BaseStats, level: number): Stats {
  return {
    hp: calcHp(base.hp, level),
    atk: calcStat(base.atk, level),
    def: calcStat(base.def, level),
    spd: calcStat(base.spd, level),
  };
}

export function clampStage(stage: number): number {
  return Math.max(MIN_STAGE, Math.min(MAX_STAGE, stage));
}

/** ×1.5 per positive stage, ÷1.5 per negative stage. */
export function stageMultiplier(stage: number): number {
  const s = clampStage(stage);
  return s >= 0 ? 1.5 ** s : 1 / 1.5 ** -s;
}

export const STAGE_STATS: readonly StageStat[] = ['atk', 'def', 'spd'];
