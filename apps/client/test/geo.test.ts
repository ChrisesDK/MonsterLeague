import { latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { coarseCellsAround, distanceM, offset, speedKmh, tooFast, type Fix } from '../src/map/geo';

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
