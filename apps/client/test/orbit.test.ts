import { describe, expect, it } from 'vitest';
import { dragRotation, ORBIT, pitchForZoom, ROTATE_RADIUS_PX, strokeSide } from '../src/map/orbit';

/** The player's screen point on a 390 × 844 phone (between the HUD rows). */
const C = { x: 195, y: 372 };

/** Sums the rotation of a stroke sampled in small steps, and its largest single step per px. */
function stroke(points: { x: number; y: number }[], steps = 60) {
  const side = strokeSide(C, points[0]!);
  let total = 0;
  let maxPerPx = 0;
  for (let s = 1; s < points.length; s++) {
    const a = points[s - 1]!;
    const b = points[s]!;
    for (let i = 0; i < steps; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps };
      const q = {
        x: a.x + ((b.x - a.x) * (i + 1)) / steps,
        y: a.y + ((b.y - a.y) * (i + 1)) / steps,
      };
      const d = dragRotation(C, p, q, side);
      total += d;
      maxPerPx = Math.max(maxPerPx, Math.abs(d) / Math.hypot(q.x - p.x, q.y - p.y));
    }
  }
  return { total, maxPerPx };
}

describe('tilt follows the zoom (owner request)', () => {
  it('55° zoomed out, 80° zoomed in', () => {
    expect(pitchForZoom(ORBIT.minZoom)).toBe(55);
    expect(pitchForZoom(ORBIT.maxZoom)).toBe(80);
    expect(pitchForZoom(17.5)).toBeCloseTo(67.5);
    expect(pitchForZoom(10)).toBe(55);
  });
});

describe('drag to rotate around the player', () => {
  it('a quarter circle around the player turns the map a quarter, with the finger', () => {
    const r = 250;
    const arc = Array.from({ length: 31 }, (_, i) => {
      const a = (Math.PI / 2) * (i / 30); // from the right side, clockwise to the bottom
      return { x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a) };
    });
    const { total } = stroke(arc);
    // clockwise finger → content turns clockwise → the bearing goes down by about 90°
    // (a little more this far out, see ROTATE_RADIUS_MAX_PX)
    expect(total).toBeLessThan(-85);
    expect(total).toBeGreaterThan(-115);
  });

  it('a swipe along the bottom turns the map; the same swipe along the top turns it back', () => {
    const bottom = stroke([
      { x: 40, y: 720 },
      { x: 350, y: 720 },
    ]).total;
    const top = stroke([
      { x: 40, y: 80 },
      { x: 350, y: 80 },
    ]).total;
    expect(bottom).toBeGreaterThan(40);
    expect(top).toBeLessThan(-40);
  });

  it('up or down along the side rotates, as before', () => {
    const right = stroke([
      { x: 370, y: 650 },
      { x: 370, y: 150 },
    ]).total;
    expect(right).toBeGreaterThan(40); // finger goes anticlockwise round the player
  });

  it('a long swipe from one side to the other, level with the player, still rotates', () => {
    const across = stroke([
      { x: 10, y: C.y + 10 },
      { x: 380, y: C.y + 10 },
    ]);
    expect(Math.abs(across.total)).toBeGreaterThan(100);
  });

  it('dragging straight over the player stays calm (no spikes near the centre)', () => {
    const through = stroke([
      { x: 20, y: C.y - 3 },
      { x: 370, y: C.y + 3 },
    ]);
    const steady = (180 / Math.PI / ROTATE_RADIUS_PX) * 1.05;
    expect(through.maxPerPx).toBeLessThanOrEqual(steady);
    expect(Math.abs(through.total)).toBeGreaterThan(100);
    // and a diagonal across the player too
    expect(
      stroke([
        { x: 40, y: 150 },
        { x: 350, y: 600 },
      ]).maxPerPx,
    ).toBeLessThanOrEqual(steady);
  });

  it('a stroke aimed straight at the player hardly turns the map (no sideways intent)', () => {
    expect(
      Math.abs(
        stroke([
          { x: 60, y: 200 },
          { x: 180, y: 355 },
        ]).total,
      ),
    ).toBeLessThan(15);
  });

  it('every direction rotates at a similar rate, so no stroke feels dead', () => {
    const rates = [
      [
        { x: 100, y: 700 },
        { x: 300, y: 700 },
      ],
      [
        { x: 370, y: 600 },
        { x: 370, y: 400 },
      ],
      [
        { x: 20, y: 380 },
        { x: 220, y: 380 },
      ],
      [
        { x: 60, y: 260 },
        { x: 200, y: 120 },
      ],
    ].map((s) => Math.abs(stroke(s).total) / 200);
    for (const r of rates) expect(r).toBeGreaterThan(0.2);
  });
});
