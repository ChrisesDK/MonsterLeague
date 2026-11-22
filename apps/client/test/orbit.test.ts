import { describe, expect, it } from 'vitest';
import {
  dragRotation,
  FLING_DECAY_MS,
  FLING_MAX_DEG_PER_MS,
  flingVelocity,
  fogWall,
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
    expect(pitchForZoom(17.5)).toBeCloseTo(53);
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

describe('fog wall (screen space, static)', () => {
  it('clear inside the ellipse through the projected fog distance, a hard edge, sky above', () => {
    const w = fogWall(
      { x: 195, y: 500 },
      { x: 195, y: 100 },
      { x: 595, y: 500 },
      '#aaccee',
      '#ddeeee',
    );
    // radii: 400 px ahead and to the side; drawn down to the player's row only
    expect(w.mask).toContain('ellipse 400px 400px at 195px 500px');
    expect(w.mask).toContain('transparent 99.50%');
    expect(w.height).toBe('500px');
    // sky at the top of the screen, fog at the wall's top edge
    expect(w.background).toBe('linear-gradient(180deg, #aaccee 0px, #ddeeee 100px)');
  });
  it('never has a zero radius', () => {
    const p = { x: 10, y: 10 };
    expect(fogWall(p, p, p, '#000', '#111').mask).toContain('ellipse 1px 1px');
  });
});
