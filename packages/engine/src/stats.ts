import type { BaseStats } from '@oml/data';
import type { Ivs, StageStat, Stats } from './types';

export const MIN_STAGE = -6;
export const MAX_STAGE = 6;
export const MAX_LEVEL = 100;

/** Individual values run from 0 to IV_MAX. */
export const IV_MAX = 15;
/** A creature without its own IVs (trainers' creatures, creatures from before IVs). */
export const AVERAGE_IVS: Ivs = { hp: 7, atk: 7, def: 7 };

/** Non-HP stat at level L: floor((base × 2 + IV) × L / 100) + 5 */
export function calcStat(base: number, level: number, iv = 0): number {
  return Math.floor(((base * 2 + iv) * level) / 100) + 5;
}

/**
 * HP at level L: floor((base × 3 + 2 × IV) × L / 100) + 2L + 10
 * (M1.5: raised from floor(base × 2 × L / 100) + L + 10 so even fights last 4–6 turns.)
 */
export function calcHp(base: number, level: number, iv = 0): number {
  return Math.floor(((base * 3 + 2 * iv) * level) / 100) + 2 * level + 10;
}

export function calcStats(base: BaseStats, level: number, ivs: Ivs = AVERAGE_IVS): Stats {
  return {
    hp: calcHp(base.hp, level, ivs.hp),
    atk: calcStat(base.atk, level, ivs.atk),
    def: calcStat(base.def, level, ivs.def),
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
