import { describe, expect, it } from 'vitest';
import { hazeStrip, rgb, skyAt, translated, wallStrip } from '../src/map/fogWall';

describe('fog wall in the 3D scene', () => {
  it('is a closed ring: bottom and top at every step, first and last step meet', () => {
    const v = wallStrip(2, 0.5, 4);
    expect(v.length).toBe(5 * 8);
    // north first (y grows southwards in Mercator units), ground then top, both solid
    expect([...v.slice(0, 8)].map((n) => +n.toFixed(6))).toEqual([0, -2, 0, 1, 0, -2, 0.5, 1]);
    // a quarter turn on: east
    expect(v[8]).toBeCloseTo(2);
    expect(v[9]).toBeCloseTo(0);
    expect(v[32]).toBeCloseTo(v[0]!);
    expect(v[33]).toBeCloseTo(v[1]!);
  });
  it('the haze band lies on the ground, clear inside and full at the wall', () => {
    const v = hazeStrip(1, 2, 4);
    expect([...v.slice(0, 8)].map((n) => +n.toFixed(6))).toEqual([0, -1, 0, 0, 0, -2, 0, 1]);
  });
  it('is coloured like the sky behind it: sky at the top, fog at and below the horizon', () => {
    const sky: [number, number, number] = [0, 0, 1];
    const fog: [number, number, number] = [1, 1, 1];
    expect(skyAt(0, 200, sky, fog)).toEqual(sky);
    expect(skyAt(100, 200, sky, fog)).toEqual([0.5, 0.5, 1]);
    expect(skyAt(200, 200, sky, fog)).toEqual(fog);
    expect(skyAt(600, 200, sky, fog)).toEqual(fog);
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
