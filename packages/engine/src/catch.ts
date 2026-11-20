import type { Status } from './types';

export const CATCH_STATUS_BONUS = 1.5;

/**
 * p = min(1, (catchRate / 255) × (1 − (2/3) × hp/maxHp) × itemBonus × statusBonus)
 * statusBonus is 1.5 when the target is asleep or paralysed.
 */
export function catchChance(
  catchRate: number,
  hp: number,
  maxHp: number,
  itemBonus: number,
  status: Status | null,
): number {
  const statusBonus = status === 'sleep' || status === 'paralysis' ? CATCH_STATUS_BONUS : 1;
  const p = (catchRate / 255) * (1 - ((2 / 3) * hp) / maxHp) * itemBonus * statusBonus;
  return Math.max(0, Math.min(1, p));
}
