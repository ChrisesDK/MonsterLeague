import { describe, expect, it } from 'vitest';
import {
  dragRotation,
  FLING_DECAY_MS,
  FLING_MAX_DEG_PER_MS,
  flingVelocity,
  horizonForReach,
  lookAheadPadding,
  oneFingerZoom,
  ONE_FINGER_PX_PER_ZOOM,
  metresPerPx,
  ORBIT,
  pitchForZoom,
} from '../src/map/orbit';

/** The player's screen point on a 390 × 844 phone (between the HUD rows). */
const C = { x: 195, y: 372 };

/** Plays a stroke through dragRotation: total turn, largest step-to-step change in °/step. */
function play(points: { x: number; y: number }[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dragRotation(C, points[i - 1]!, points[i]!);
  return total;
}
const line = (a: { x: number; y: number }, b: { x: number; y: number }, n = 200) =>
  Array.from({ length: n + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / n,
    y: a.y + ((b.y - a.y) * i) / n,
  }));
const arc = (r: number, dir: 1 | -1, turns: number, from = Math.PI / 2) =>
  Array.from({ length: Math.round(720 * turns) + 1 }, (_, i) => {
    const a = from + dir * (i / 720) * 2 * Math.PI;
    return { x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a) };
  });
/** The angle (degrees) a point is seen at from the player. */
const angle = (p: { x: number; y: number }) => (Math.atan2(p.y - C.y, p.x - C.x) * 180) / Math.PI;

describe('tilt follows the zoom', () => {
  it('30 degrees zoomed out, 76 zoomed in', () => {
    expect(pitchForZoom(ORBIT.minZoom)).toBe(30);
    expect(pitchForZoom(ORBIT.maxZoom)).toBe(76);
    expect(pitchForZoom((ORBIT.minZoom + ORBIT.maxZoom) / 2)).toBeCloseTo(53);
    expect(pitchForZoom(10)).toBe(30);
  });
});

describe('drag to rotate: the screen follows the finger exactly (owner feedback)', () => {
  it('one loop around the player is exactly one map turn, at any distance', () => {
    for (const r of [20, 60, 140, 300]) {
      expect(play(arc(r, 1, 1)), `radius ${r}`).toBeCloseTo(-360, 6);
      expect(play(arc(r, -1, 1)), `radius ${r}`).toBeCloseTo(360, 6);
    }
  });

  it('a quarter circle close to the player turns the map as much as one far away', () => {
    const near = play(arc(30, 1, 0.25));
    const far = play(arc(280, 1, 0.25));
    expect(near).toBeCloseTo(-90, 6);
    expect(far).toBeCloseTo(-90, 6);
  });

  it('any stroke turns the map by exactly the angle the finger swept around the player', () => {
    const strokes: [{ x: number; y: number }, { x: number; y: number }][] = [
      [
        { x: 40, y: 700 },
        { x: 350, y: 700 },
      ],
      [
        { x: 370, y: 650 },
        { x: 370, y: 150 },
      ],
      [
        { x: 175, y: 352 },
        { x: 215, y: 352 },
      ], // right next to the player (20 px above it)
    ];
    for (const [a, b] of strokes) {
      let swept = angle(b) - angle(a);
      if (swept > 180) swept -= 360;
      if (swept < -180) swept += 360;
      expect(play(line(a, b))).toBeCloseTo(-swept, 6);
    }
  });

  it('moving straight towards or away from the player does nothing', () => {
    expect(play(line({ x: 195, y: 750 }, { x: 195, y: 450 }))).toBeCloseTo(0, 9);
  });

  it('a move that starts or ends on the player has no angle and is skipped', () => {
    expect(dragRotation(C, C, { x: 250, y: 300 })).toBe(0);
    expect(dragRotation(C, { x: 250, y: 300 }, { x: C.x + 1, y: C.y })).toBe(0);
  });
});

describe('fling after a swipe', () => {
  it('measures speed over time, not per event (events can come 1 ms apart)', () => {
    const fast = Array.from({ length: 12 }, (_, i) => ({ t: 1000 + i * 2, delta: 12 }));
    expect(flingVelocity(fast, 1024)).toBe(FLING_MAX_DEG_PER_MS);
    expect(FLING_MAX_DEG_PER_MS * FLING_DECAY_MS).toBeLessThanOrEqual(90);
  });
  it('a normal finger swipe flings at its own speed', () => {
    const swipe = Array.from({ length: 10 }, (_, i) => ({ t: 1000 + i * 16, delta: 4 }));
    expect(flingVelocity(swipe, 1150)).toBeCloseTo(28 / 100, 1);
  });
  it('no fling when the finger stopped before it was lifted', () => {
    const swipe = Array.from({ length: 10 }, (_, i) => ({ t: 1000 + i * 16, delta: 4 }));
    expect(flingVelocity(swipe, 1300)).toBe(0);
  });
});

describe('the ground reaches past the fog at every tilt (owner report)', () => {
  // MapLibre's camera geometry: the camera-to-centre distance is 1.5 × the screen height
  // (36.87° field of view); its far plane reaches this far past the centre for a horizon value
  const f = 1.5 * 844;
  const reachedM = (pitch: number, hz: number, mPerPx: number, offsetY = 0) => {
    const p = (pitch * Math.PI) / 180;
    const a = Math.atan(hz / f) * (1 + offsetY / hz); // angle above the centre ray
    const below = Math.PI / 2 - p - a; // ray angle below the horizontal
    if (below <= 0) return Infinity; // at or past the horizon
    return ((f * Math.cos(p)) / Math.tan(below) - f * Math.sin(p)) * mPerPx;
  };
  const m = metresPerPx(55.4, ORBIT.maxZoom);

  it("MapLibre's own horizon stops the ground about 1 km ahead when zoomed in", () => {
    const own = Math.tan(((90 - 76) * Math.PI) / 180) * f * 0.85;
    expect(reachedM(76, own, m)).toBeGreaterThan(700);
    expect(reachedM(76, own, m)).toBeLessThan(1200);
  });
  // look-ahead puts the centre at or below the screen's middle when tilted (offset ≥ 0)
  it('the replacement draws the ground to the requested distance, with the look-ahead padding', () => {
    for (const offsetY of [0, 45, 141]) {
      const hz = horizonForReach(76, f, m, 2300, offsetY);
      expect(reachedM(76, hz, m, offsetY), `offset ${offsetY}`).toBeCloseTo(2300, -1);
    }
  });
  it('and no further: with the look-ahead MapLibre itself would draw almost to the horizon', () => {
    const own = Math.tan(((90 - 76) * Math.PI) / 180) * f * 0.85;
    expect(reachedM(76, own, m, 141)).toBeGreaterThan(50_000);
    expect(reachedM(76, horizonForReach(76, f, m, 2300, 141), m, 141)).toBeCloseTo(2300, -1);
  });
  it('metres per pixel at Odense', () => {
    expect(metresPerPx(55.4, 18.5)).toBeCloseTo(0.12, 2);
  });
});

describe('look-ahead: the player sits lower on the screen when zoomed in', () => {
  it('zoomed out it stands in the middle (owner), zoomed in 72% of the way down', () => {
    const y = (zoom: number) => {
      const p = lookAheadPadding(zoom, 844);
      return (844 + p.top - p.bottom) / 2;
    };
    expect(y(ORBIT.minZoom)).toBe(422);
    expect(Math.abs(y(ORBIT.maxZoom) - 0.72 * 844)).toBeLessThanOrEqual(1);
    expect(y(17.4)).toBeGreaterThan(422);
    expect(y(17.4)).toBeLessThan(0.72 * 844);
  });
  it('stays above the open Nearby strip on a short screen', () => {
    const p = lookAheadPadding(ORBIT.maxZoom, 600);
    expect((600 + p.top - p.bottom) / 2).toBeLessThanOrEqual(600 - 220);
  });
});

describe('one-finger zoom (testers: one hand)', () => {
  it('down zooms in, up out, within the zoom range', () => {
    expect(oneFingerZoom(17, ONE_FINGER_PX_PER_ZOOM)).toBeCloseTo(18);
    expect(oneFingerZoom(17.5, -ONE_FINGER_PX_PER_ZOOM)).toBeCloseTo(16.5);
    expect(oneFingerZoom(18, 1000)).toBe(ORBIT.maxZoom);
    expect(oneFingerZoom(17, -1000)).toBe(ORBIT.minZoom);
  });
});
