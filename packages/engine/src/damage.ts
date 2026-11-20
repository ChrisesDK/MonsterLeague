import type { Dex } from '@oml/data';
import type { TypeId } from './types';

/** Multiplier of an attacking type against a (possibly dual-typed) defender. Dual types multiply. */
export function typeEffectiveness(
  attackType: TypeId,
  defenderTypes: readonly TypeId[],
  dex: Dex,
): number {
  let mul = 1;
  for (const t of defenderTypes) mul *= dex.chart[attackType][t];
  return mul;
}

export const CRIT_CHANCE = 1 / 16;
export const CRIT_MULTIPLIER = 1.5;
export const STAB_MULTIPLIER = 1.5;
export const RANDOM_MIN = 0.85;

export interface DamageInput {
  level: number;
  power: number;
  /** Attacker's effective atk (stages applied, burn NOT applied). */
  atk: number;
  /** Defender's effective def (stages applied). */
  def: number;
  stab: boolean;
  typeMul: number;
  crit: boolean;
  /** Random factor in [0.85, 1.0]. */
  random: number;
  burned: boolean;
}

function rawDamage(i: DamageInput): number {
  const a = i.burned ? i.atk / 2 : i.atk;
  const base = (((2 * i.level) / 5 + 2) * i.power * a) / i.def / 50 + 2;
  return (
    base * (i.stab ? STAB_MULTIPLIER : 1) * i.typeMul * (i.crit ? CRIT_MULTIPLIER : 1) * i.random
  );
}

/**
 * damage = floor( ( ((2L/5 + 2) × P × A / D) / 50 + 2 ) × STAB × typeMul × crit × r )
 * Minimum 1 unless typeMul = 0. Burn halves A.
 */
export function computeDamage(i: DamageInput): number {
  if (i.typeMul === 0 || i.power <= 0) return 0;
  return Math.max(1, Math.floor(rawDamage(i)));
}

/** Expected (average) damage, used by the AI. Includes accuracy and crit chance. */
export function expectedDamage(
  i: Omit<DamageInput, 'crit' | 'random'>,
  accuracy: number | null,
): number {
  if (i.typeMul === 0 || i.power <= 0) return 0;
  const noCrit = rawDamage({ ...i, crit: false, random: (RANDOM_MIN + 1) / 2 });
  const critMul = 1 + CRIT_CHANCE * (CRIT_MULTIPLIER - 1);
  return noCrit * critMul * ((accuracy ?? 100) / 100);
}
