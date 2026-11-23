import { describe, expect, it } from 'vitest';
import { ringPath, SCAN_OPACITY, SCAN_PERIOD_MS, scanPhase, scanRing } from '../src/map/scanRing';
import { DEAD_ZONE_M, steadyTarget } from '../src/map/geo';

describe('scan inside the battle range', () => {
  it('sweeps from the player to the range ring once per period, fading out', () => {
    expect(scanPhase(0)).toBe(0);
    expect(scanPhase(SCAN_PERIOD_MS / 2)).toBeCloseTo(0.5);
    expect(scanPhase(SCAN_PERIOD_MS * 3 + 1)).toBeCloseTo(1 / SCAN_PERIOD_MS);
    expect(scanRing(0, 40)).toEqual({ radiusM: 0, opacity: SCAN_OPACITY });
    const mid = scanRing(0.5, 40);
    expect(mid.radiusM).toBeCloseTo(30); // eases out: quick near the player
    expect(mid.opacity).toBeCloseTo(SCAN_OPACITY * Math.SQRT1_2);
    const end = scanRing(0.999, 40);
    expect(end.radiusM).toBeLessThanOrEqual(40);
    expect(end.opacity).toBeLessThan(0.05);
  });
  it('draws a closed path through the projected points', () => {
    expect(
      ringPath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 8 },
      ]),
    ).toBe('M0.0 0.0L10.0 0.0L5.0 8.0Z');
    expect(ringPath([])).toBe('');
  });
});

describe('dead zone for the player figure (owner: it shook while standing still)', () => {
  const at = { lat: 55.3992, lng: 10.3852 };
  const north = (m: number) => ({ lat: at.lat + m / 110_540, lng: at.lng });
  it('GPS drift of a few metres keeps the figure where it is', () => {
    expect(steadyTarget(at, north(1))).toBe(at);
    expect(steadyTarget(at, north(DEAD_ZONE_M - 0.2))).toBe(at);
  });
  it('a real move (or the first fix) is followed', () => {
    expect(steadyTarget(at, north(DEAD_ZONE_M + 0.5))).toEqual(north(DEAD_ZONE_M + 0.5));
    expect(steadyTarget(null, at)).toEqual(at);
  });
});
