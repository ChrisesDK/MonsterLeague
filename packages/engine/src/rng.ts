/**
 * Seeded PRNG (sfc32, seeded with splitmix32). The full generator state is a plain
 * `number[]` of four uint32 values so it can live inside BattleState and be serialised.
 */

function splitmix32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    z ^= z >>> 16;
    return z >>> 0;
  };
}

/** Creates a fresh RNG state from an integer seed. */
export function seedRng(seed: number): number[] {
  const next = splitmix32(seed);
  return [next(), next(), next(), next()];
}

/** Mixes several integers into one 32-bit seed (used to derive independent streams). */
export function mixSeed(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) {
    h = Math.imul(h ^ (v >>> 0), 0x01000193);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/**
 * Mutable cursor over a copied RNG state. Engine functions create one from the input
 * state, draw numbers, and write `getState()` into the new (cloned) BattleState.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(state: readonly number[]) {
    if (state.length !== 4) throw new Error('RNG state must have 4 numbers');
    this.a = state[0]! >>> 0;
    this.b = state[1]! >>> 0;
    this.c = state[2]! >>> 0;
    this.d = state[3]! >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with `percent`% probability. 100 and 0 do not consume a number. */
  chance(percent: number): boolean {
    if (percent >= 100) return true;
    if (percent <= 0) return false;
    return this.next() * 100 < percent;
  }

  pick<T>(list: readonly T[]): T {
    if (list.length === 0) throw new Error('Cannot pick from an empty list');
    return list[Math.floor(this.next() * list.length)]!;
  }

  getState(): number[] {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }
}
