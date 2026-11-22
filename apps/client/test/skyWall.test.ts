import { describe, expect, it } from 'vitest';
import {
  hazeStrip,
  rgb,
  SKY_FULL_DEG,
  skyAt,
  translated,
  wallHeight,
  wallStrip,
} from '../src/map/skyWall';

describe('sky wall: the edge of the world and the sky', () => {
  // phone-like camera: 844 px tall view, camera-to-centre 1.5 × height
  const f = 1266;
  it('fully zoomed in (76°) it reaches above the top of the screen', () => {
    // the top of the screen is 563 px above the centre (look-ahead): about 10° above the
    // horizon, plus a 3° margin
    const h = wallHeight(76, 563, f, 37, 150, 1200);
    const deg = (Math.atan((h - 37) / (1200 + 150)) * 180) / Math.PI;
    expect(deg).toBeGreaterThan(12);
    expect(deg).toBeLessThan(14.5);
  });
  it('zoomed out (the top of the screen is ground) it just reaches above the horizon', () => {
    const h = wallHeight(30, 372, f, 500, 300, 1200);
    const deg = (Math.atan((h - 500) / 1500) * 180) / Math.PI;
    expect(deg).toBeCloseTo(3, 5);
  });
  it('wall vertices: position, place on the wall (u around, height in m), solid', () => {
    const v = wallStrip(2, 0.5, 300, 4);
    expect(v.length).toBe(5 * 12);
    expect([...v.slice(0, 12)].map((n) => +n.toFixed(6))).toEqual([
      0, -2, 0, 0, 0, 1, 0, -2, 0.5, 0, 300, 1,
    ]);
    // a quarter turn on: east, u = 0.25
    expect(v[12]).toBeCloseTo(2);
    expect(v[15]).toBeCloseTo(0.25);
    // the last step meets the first (u = 1 = a full turn)
    expect(v[48]).toBeCloseTo(v[0]!);
    expect(v[51]).toBeCloseTo(1);
  });
  it('the haze band lies on the ground, clear inside and full at the wall', () => {
    const v = hazeStrip(1, 2, 4);
    expect([...v.slice(0, 12)].map((n) => +n.toFixed(6))).toEqual([
      0, -1, 0, 0, 0, 0, 0, -2, 0, 0, 0, 1,
    ]);
  });
  it('colour: fog at and below the horizon, the sky colour higher up', () => {
    const sky: [number, number, number] = [0, 0, 1];
    const fog: [number, number, number] = [1, 1, 1];
    expect(skyAt(-5, sky, fog)).toEqual(fog);
    expect(skyAt(0, sky, fog)).toEqual(fog);
    expect(skyAt(SKY_FULL_DEG / 2, sky, fog)).toEqual([0.5, 0.5, 1]);
    expect(skyAt(SKY_FULL_DEG + 10, sky, fog)).toEqual(sky);
  });
  it('moves the matrix to the player in double precision; reads palette colours', () => {
    const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const m = translated(id, 0.53, 0.32);
    expect(m[12]).toBeCloseTo(0.53);
    expect(m[13]).toBeCloseTo(0.32);
    expect(rgb('#1c2335').map((c) => Math.round(c * 255))).toEqual([28, 35, 53]);
    expect(rgb('#fff')).toEqual([1, 1, 1]);
  });
});
