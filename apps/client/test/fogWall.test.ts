import { describe, expect, it } from 'vitest';
import { rgb, translated, wallStrip } from '../src/map/fogWall';

describe('fog wall in the 3D scene', () => {
  it('is a closed ring: bottom and top at every step, first and last step meet', () => {
    const v = wallStrip(2, 0.5, 4);
    expect(v.length).toBe(5 * 6);
    // north first (y grows southwards in Mercator units), ground then top
    expect([...v.slice(0, 6)].map((n) => +n.toFixed(6))).toEqual([0, -2, 0, 0, -2, 0.5]);
    // a quarter turn on: east
    expect(v[6]).toBeCloseTo(2);
    expect(v[7]).toBeCloseTo(0);
    expect(v.slice(24, 30)[0]).toBeCloseTo(v[0]!);
    expect(v.slice(24, 30)[1]).toBeCloseTo(v[1]!);
  });
  it('moves the matrix to the player in double precision (vertices stay small)', () => {
    const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const m = translated(id, 0.53, 0.32);
    expect(m[12]).toBeCloseTo(0.53);
    expect(m[13]).toBeCloseTo(0.32);
    expect(m[15]).toBe(1);
  });
  it('reads the palette colours', () => {
    expect(rgb('#ff0000')).toEqual([1, 0, 0]);
    expect(rgb('#1c2335').map((c) => Math.round(c * 255))).toEqual([28, 35, 53]);
    expect(rgb('#fff')).toEqual([1, 1, 1]);
  });
});
