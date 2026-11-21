import { latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import {
  aheadM,
  glideStep,
  markerInView,
  coarseCellsAround,
  distanceM,
  offset,
  speedKmh,
  tooFast,
  type Fix,
  GPS_GRACE_MS,
  playableFix,
} from '../src/map/geo';

describe('map geometry and filters', () => {
  it('measures distance and offsets in metres', () => {
    const a = { lat: 55.4, lng: 10.385 };
    const b = offset(a, 100, 90);
    expect(distanceM(a, b)).toBeGreaterThan(98);
    expect(distanceM(a, b)).toBeLessThan(102);
  });

  it('prefetches a neighbouring res-7 cell only near an edge', () => {
    const p = { lat: 55.3998, lng: 10.3852 };
    const cells = coarseCellsAround(p);
    expect(cells[0]).toBe(latLngToCell(p.lat, p.lng, 7));
    expect(cells.length).toBeGreaterThanOrEqual(1);
    expect(cells.length).toBeLessThanOrEqual(4);
  });

  it('computes speed from device speed or from fixes ≥ 5 s apart', () => {
    const f = (t: number, lng: number, speed?: number): Fix => ({
      lat: 55.4,
      lng,
      accuracy: 5,
      time: t * 1000,
      speed,
    });
    expect(speedKmh([])).toBe(null);
    expect(speedKmh([f(0, 10.38, 2)])).toBeCloseTo(7.2);
    // ~63 m in 10 s ≈ 23 km/h
    const kmh = speedKmh([f(0, 10.38), f(10, 10.381)])!;
    expect(kmh).toBeGreaterThan(20);
    expect(kmh).toBeLessThan(26);
    expect(speedKmh([f(0, 10.38), f(2, 10.381)])).toBe(null);
  });

  it('hides spawns above 25 km/h and shows them again below 20', () => {
    expect(tooFast(false, 30)).toBe(true);
    expect(tooFast(true, 22)).toBe(true);
    expect(tooFast(true, 15)).toBe(false);
    expect(tooFast(false, 24)).toBe(false);
    expect(tooFast(true, null)).toBe(true);
  });
});

describe('GPS dips (owner request after M2d)', () => {
  const good = { lat: 55.4, lng: 10.38, accuracy: 12, time: 1_000_000 };
  const weak = { lat: 55.401, lng: 10.381, accuracy: 104, time: 1_030_000 };
  it('an accurate fix is used as it is', () => {
    expect(playableFix(good, good, good.time)).toBe(good);
  });
  it('a weak fix keeps the last accurate one in play for 90 s', () => {
    expect(playableFix(weak, good, good.time + 30_000)).toBe(good);
    expect(playableFix(weak, good, good.time + GPS_GRACE_MS)).toBe(good);
    expect(playableFix(weak, good, good.time + GPS_GRACE_MS + 1)).toBeNull();
    expect(playableFix(weak, null, weak.time)).toBeNull();
  });
});

describe('the player figure glides to a new fix (owner request)', () => {
  const a = { lat: 55.4, lng: 10.38 };
  const b = { lat: 55.4002, lng: 10.38 }; // ~22 m north
  it('moves part of the way each frame and arrives', () => {
    const one = glideStep(a, b, 1 / 60);
    expect(distanceM(a, one)).toBeGreaterThan(0.3);
    expect(distanceM(one, b)).toBeLessThan(distanceM(a, b));
    let p = a;
    for (let i = 0; i < 180; i++) p = glideStep(p, b, 1 / 60); // 3 s
    expect(p).toEqual(b);
  });
  it('snaps on a first fix or a teleport', () => {
    expect(glideStep(null, b, 0.016)).toBe(b);
    const far = { lat: 55.41, lng: 10.38 };
    expect(glideStep(a, far, 0.016)).toBe(far);
  });
});

describe('map icons behind the camera are hidden (owner report)', () => {
  const me = { lat: 55.398, lng: 10.366 };
  const centre = { lat: 55.3998, lng: 10.3852 }; // ~1.2 km east
  it('measures how far ahead a point lies for the camera bearing', () => {
    expect(aheadM(me, 90, centre)).toBeGreaterThan(1100);
    expect(aheadM(me, 270, centre)).toBeLessThan(-1100);
    expect(Math.abs(aheadM(me, 0, centre))).toBeLessThan(250);
  });
  it('looking east the centre can show; looking west it cannot', () => {
    expect(markerInView(me, 90, 300, centre)).toBe(true);
    expect(markerInView(me, 270, 300, centre)).toBe(false);
    // close behind the player (still on screen at the bottom) stays visible
    expect(markerInView(me, 270, 300, { lat: me.lat, lng: me.lng + 0.002 })).toBe(true);
    // never further than 2 km
    expect(markerInView(me, 90, 300, { lat: me.lat, lng: me.lng + 0.04 })).toBe(false);
  });
});
