import { content } from '@oml/data';
import { describe, expect, it } from 'vitest';
import { computeDamage, expectedDamage, typeEffectiveness } from '../src/damage';

const base = {
  level: 10,
  power: 40,
  atk: 20,
  def: 20,
  stab: false,
  typeMul: 1,
  crit: false,
  random: 1,
  burned: false,
};

describe('type chart', () => {
  const eff = (
    a: Parameters<typeof typeEffectiveness>[0],
    ...d: Parameters<typeof typeEffectiveness>[1][number][]
  ) => typeEffectiveness(a, d, content);

  it('matches the specified matrix', () => {
    const expected: Record<string, Record<string, number>> = {
      folk: { stone: 0.5, spirit: 0 },
      fire: { fire: 0.5, water: 0.5, grove: 2, stone: 0.5 },
      water: { fire: 2, water: 0.5, grove: 0.5, stone: 2 },
      grove: { fire: 0.5, water: 2, grove: 0.5, stone: 2, storm: 0.5 },
      stone: { fire: 2, grove: 0.5, storm: 2 },
      storm: { water: 2, grove: 0.5, stone: 0, storm: 0.5 },
      spirit: { folk: 0, spirit: 2 },
    };
    for (const a of content.typeIds) {
      for (const d of content.typeIds) {
        expect(eff(a, d), `${a} → ${d}`).toBe(expected[a]![d] ?? 1);
      }
    }
  });

  it('multiplies dual types', () => {
    expect(eff('grove', 'stone', 'water')).toBe(4);
    expect(eff('storm', 'stone', 'water')).toBe(0);
    expect(eff('spirit', 'folk', 'spirit')).toBe(0);
    expect(eff('fire', 'stone', 'water')).toBe(0.25);
  });
});

describe('damage formula', () => {
  it('computes the base formula', () => {
    // ((2*10/5 + 2) * 40 * 20 / 20) / 50 + 2 = 6.8
    expect(computeDamage(base)).toBe(6);
  });
  it('applies STAB, type, crit and random factor, then floors', () => {
    expect(computeDamage({ ...base, stab: true })).toBe(10); // 10.2
    expect(computeDamage({ ...base, stab: true, typeMul: 2 })).toBe(20); // 20.4
    expect(computeDamage({ ...base, crit: true })).toBe(10); // 10.2
    expect(computeDamage({ ...base, random: 0.85 })).toBe(5); // 5.78
    expect(computeDamage({ ...base, typeMul: 0.5 })).toBe(3); // 3.4
  });
  it('halves attack when burned', () => {
    // A = 10 → (6 * 40 * 10 / 20) / 50 + 2 = 4.4
    expect(computeDamage({ ...base, burned: true })).toBe(4);
  });
  it('deals at least 1 unless immune', () => {
    expect(
      computeDamage({ ...base, level: 1, power: 1, atk: 1, def: 255, typeMul: 0.25, random: 0.85 }),
    ).toBe(1);
    expect(computeDamage({ ...base, typeMul: 0 })).toBe(0);
    expect(computeDamage({ ...base, power: 0 })).toBe(0);
  });
  it('expected damage accounts for accuracy and crit', () => {
    const e = expectedDamage(base, 100);
    expect(e).toBeGreaterThan(6.8 * 0.925);
    expect(expectedDamage(base, 50)).toBeCloseTo(e / 2);
    expect(expectedDamage(base, null)).toBeCloseTo(e);
    expect(expectedDamage({ ...base, typeMul: 0 }, 100)).toBe(0);
  });
});
