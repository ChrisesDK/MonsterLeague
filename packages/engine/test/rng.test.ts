import { describe, expect, it } from 'vitest';
import { mixSeed, Rng, seedRng } from '../src/rng';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(seedRng(42));
    const b = new Rng(seedRng(42));
    const xs = Array.from({ length: 50 }, () => a.next());
    expect(Array.from({ length: 50 }, () => b.next())).toEqual(xs);
    expect(new Rng(seedRng(43)).next()).not.toEqual(xs[0]);
  });

  it('resumes from a saved state', () => {
    const a = new Rng(seedRng(7));
    a.next();
    const saved = a.getState();
    const expected = a.next();
    expect(new Rng(saved).next()).toBe(expected);
  });

  it('produces values in range', () => {
    const r = new Rng(seedRng(1));
    for (let i = 0; i < 2000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = r.int(1, 3);
      expect([1, 2, 3]).toContain(n);
    }
  });

  it('chance() handles 0 and 100 without consuming numbers', () => {
    const r = new Rng(seedRng(5));
    const before = r.getState();
    expect(r.chance(100)).toBe(true);
    expect(r.chance(0)).toBe(false);
    expect(r.getState()).toEqual(before);
    const hits = Array.from({ length: 4000 }, () => r.chance(25)).filter(Boolean).length;
    expect(hits / 4000).toBeGreaterThan(0.2);
    expect(hits / 4000).toBeLessThan(0.3);
  });

  it('pick() and invalid states', () => {
    const r = new Rng(seedRng(3));
    expect(['a', 'b']).toContain(r.pick(['a', 'b']));
    expect(() => r.pick([])).toThrow();
    expect(() => new Rng([1, 2])).toThrow();
  });

  it('mixSeed is deterministic and spreads inputs', () => {
    expect(mixSeed(1, 2, 3)).toBe(mixSeed(1, 2, 3));
    expect(mixSeed(1, 2, 3)).not.toBe(mixSeed(1, 2, 4));
  });
});
