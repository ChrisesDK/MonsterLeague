import { describe, expect, it } from 'vitest';
import {
  dragRotation,
  FLING_DECAY_MS,
  FLING_MAX_DEG_PER_MS,
  flingVelocity,
  hazeForPitch,
  ORBIT,
  pitchForZoom,
} from '../src/map/orbit';

/** The player's screen point on a 390 × 844 phone (between the HUD rows). */
const C = { x: 195, y: 372 };

/** Plays a stroke through dragRotation: total turn, largest step-to-step change in °/px. */
function play(points: { x: number; y: number }[]) {
  let total = 0;
  const rates: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const d = dragRotation(C, a, b);
    total += d;
    if (len > 0) rates.push(d / len);
  }
  let jump = 0;
  for (let i = 1; i < rates.length; i++) jump = Math.max(jump, Math.abs(rates[i]! - rates[i - 1]!));
  return { total, min: Math.min(...rates), max: Math.max(...rates), jump };
}
const line = (a: { x: number; y: number }, b: { x: number; y: number }, n = 200) =>
  Array.from({ length: n + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / n,
    y: a.y + ((b.y - a.y) * i) / n,
  }));
const arc = (cx: number, cy: number, r: number, dir: 1 | -1, turns: number) =>
  Array.from({ length: Math.round(720 * turns) + 1 }, (_, i) => {
    const a = Math.PI / 2 + dir * (i / 720) * 2 * Math.PI;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });

describe('tilt follows the zoom', () => {
  it('30 degrees zoomed out, 76 zoomed in', () => {
    expect(pitchForZoom(ORBIT.minZoom)).toBe(30);
    expect(pitchForZoom(ORBIT.maxZoom)).toBe(76);
    expect(pitchForZoom(17.5)).toBeCloseTo(53);
    expect(pitchForZoom(10)).toBe(30);
  });
  it('the distance haze only shows at steep tilts', () => {
    expect(hazeForPitch(30)).toBe(0);
    expect(hazeForPitch(55)).toBe(0);
    expect(hazeForPitch(76)).toBe(1);
  });
});

describe('drag to rotate: motion around the player turns the map (owner feedback)', () => {
  it('a full circle around the player turns the map about one full turn, smoothly', () => {
    for (const [ox, oy, r] of [
      [0, 0, 200],
      [0, 50, 240], // around the screen's middle, a little below the player
      [30, 40, 260],
    ] as const) {
      const res = play(arc(C.x + ox, C.y + oy, r, 1, 1));
      expect(res.max).toBeLessThan(0); // always the same way round
      expect(res.jump).toBeLessThan(0.05); // no jerk anywhere in the loop
      expect(res.total).toBeLessThan(-300);
      expect(res.total).toBeGreaterThan(-420);
    }
  });

  it('half circles in both directions turn the map both ways', () => {
    expect(play(arc(C.x, C.y, 200, 1, 0.5)).total).toBeLessThan(-150);
    expect(play(arc(C.x, C.y, 200, -1, 0.5)).total).toBeGreaterThan(150);
  });

  it('a swipe below the player turns the map; the same swipe above turns it the other way', () => {
    const below = play(line({ x: 40, y: 700 }, { x: 350, y: 700 })).total;
    const above = play(line({ x: 40, y: 120 }, { x: 350, y: 120 })).total;
    expect(below).toBeGreaterThan(30);
    expect(above).toBeLessThan(-30);
  });

  it('a horizontal swipe level with the player is negligible, even straight through it', () => {
    for (const dy of [0, 10, -20, 40]) {
      const through = play(line({ x: 15, y: C.y + dy }, { x: 375, y: C.y + dy }));
      expect(Math.abs(through.total), `offset ${dy}`).toBeLessThan(10);
    }
  });

  it('up or down along the side turns the map', () => {
    expect(play(line({ x: 370, y: 650 }, { x: 370, y: 150 })).total).toBeGreaterThan(60);
  });

  it('moving towards or away from the player does nothing', () => {
    expect(Math.abs(play(line({ x: 195, y: 750 }, { x: 195, y: 450 })).total)).toBeLessThan(0.01);
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
