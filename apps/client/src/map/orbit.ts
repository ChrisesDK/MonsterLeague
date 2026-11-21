import type { Map as MlMap } from 'maplibre-gl';

/**
 * Play-view camera (owner requests after M2d): the camera always looks at the player.
 * - One-finger (or mouse) drag rotates the map around the player, never pans it.
 * - Pinch and the scroll wheel zoom around the player (the map centre).
 * - Zooming in tilts the camera up (65 degrees zoomed out, 72 zoomed in) so the view reaches
 *   further while the camera is closer to the ground.
 */
export const ORBIT = {
  minZoom: 16.5,
  maxZoom: 18.5,
  zoom: 17.5,
  /** Tilt when zoomed all the way out … */
  minPitch: 65,
  /**
   * … and all the way in. Zooming in from 16.5 to 18.5 at a fixed 65 degrees would cut the
   * ground visible ahead (to just below the Journal card) from 462 m to 116 m; 72 degrees
   * shows 226 m, about twice as much, while the horizon stays just above the screen
   * (measured in the real map; from 73 degrees the horizon and empty sky come into view).
   */
  maxPitch: 72,
};

/** Tilt for a zoom level: linear from minPitch (zoomed out) to maxPitch (zoomed in). */
export function pitchForZoom(zoom: number): number {
  const t = Math.max(0, Math.min(1, (zoom - ORBIT.minZoom) / (ORBIT.maxZoom - ORBIT.minZoom)));
  return ORBIT.minPitch + t * (ORBIT.maxPitch - ORBIT.minPitch);
}

/**
 * Rotation speed, in degrees per pixel of finger movement. A circle around the player at
 * this radius (or closer) turns the map exactly with the finger; further out the map still
 * follows the finger's angle around the player.
 */
export const ROTATE_RADIUS_PX = 140;
/** Far from the player a circle turns the map a little faster than the finger's angle, so
 * long strokes near the screen edges still rotate decisively. */
export const ROTATE_RADIUS_MAX_PX = 220;
const DEG_PER_PX = 180 / Math.PI / ROTATE_RADIUS_PX; // ≈ 0.41°/px

/**
 * Which way a stroke across the screen turns the map, decided once when the finger goes
 * down, from where it starts relative to the player: below (or level with) the player a
 * swipe to the right turns the view one way and above it the other way; right of the player
 * a swipe up turns it one way and left of it the other way, just as a circle around the
 * player would.
 */
export interface StrokeSide {
  sx: 1 | -1;
  sy: 1 | -1;
}
export function strokeSide(
  c: { x: number; y: number },
  start: { x: number; y: number },
): StrokeSide {
  return { sx: start.x < c.x ? -1 : 1, sy: start.y < c.y - 60 ? -1 : 1 };
}

/** How far past the player the finger must go before the stroke side flips. */
export const SIDE_HYSTERESIS_PX = 60;

/**
 * Follows the finger to the other side of the player during a stroke, with hysteresis: a
 * circle around the player keeps turning the same way all round (a side fixed at the start
 * made the map turn back for part of a slightly off-centre circle), while a straight swipe
 * past the player keeps its direction.
 */
export function updateSide(
  side: StrokeSide,
  c: { x: number; y: number },
  p: { x: number; y: number },
): StrokeSide {
  const m = SIDE_HYSTERESIS_PX;
  const sx = p.x < c.x - m ? -1 : p.x > c.x + m ? 1 : side.sx;
  const sy = p.y < c.y - m ? -1 : p.y > c.y + m ? 1 : side.sy;
  return sx === side.sx && sy === side.sy ? side : { sx, sy };
}

/**
 * Bearing change (degrees; + turns the view clockwise on the compass) for a finger moving
 * from a to b, with the player at c (screen px, y down). Two parts, blended by the stroke's
 * direction:
 * - around the player: the part of the move that circles the player turns the map with the
 *   finger (the effective radius never drops below ROTATE_RADIUS_PX, so dragging right over
 *   the player stays calm instead of spinning);
 * - towards or away from the player: a stroke straight across the screen (say, along the
 *   side, or from one side to the other through the player) turns the map by its sideways
 *   movement, in the direction a circle around the player would (see strokeSide).
 * Every stroke direction therefore rotates at about the same, steady rate.
 */
export function dragRotation(
  c: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  side: StrokeSide = { sx: 1, sy: 1 },
  /** Recent rotation from circling (degrees, decaying); see strokeStep. */
  intent = 0,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  // radius at the middle of the stroke
  const rx = (a.x + b.x) / 2 - c.x;
  const ry = (a.y + b.y) / 2 - c.y;
  const r = Math.hypot(rx, ry);
  const positional = (side.sy * dx - side.sx * dy) * DEG_PER_PX;
  // Once the stroke has been circling one way, the across part follows that way too, so a
  // circle that isn't centred on the player never turns the map back for part of the loop.
  const k = Math.min(1, Math.abs(intent) / INTENT_FULL_DEG);
  const sideways = (1 - k) * positional + k * Math.sign(intent) * Math.abs(positional);
  if (r < 1) return sideways;
  // components of the move: radial (towards/away) and tangential (around; + = clockwise)
  const radial = (rx * dx + ry * dy) / r;
  const tangential = (rx * dy - ry * dx) / r;
  // the map follows the finger: a clockwise stroke turns the content clockwise, i.e. the
  // bearing goes down
  const reff = Math.min(ROTATE_RADIUS_MAX_PX, Math.max(r, ROTATE_RADIUS_PX));
  const around = (-tangential / reff) * (180 / Math.PI);
  const w = Math.abs(radial) / len; // 0 = purely around the player, 1 = purely across
  return (1 - w) * around + w * sideways;
}

/** Recent circling (degrees) at which the across part fully follows the circling direction. */
const INTENT_FULL_DEG = 12;
/** Circling intent fades over this much finger movement (px). */
const INTENT_FADE_PX = 220;

/** The circling part of dragRotation on its own (used for the stroke's intent). */
function aroundPart(
  c: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rx = (a.x + b.x) / 2 - c.x;
  const ry = (a.y + b.y) / 2 - c.y;
  const r = Math.hypot(rx, ry);
  const len = Math.hypot(dx, dy);
  if (r < 1 || len === 0) return 0;
  const tangential = (rx * dy - ry * dx) / r;
  const reff = Math.min(ROTATE_RADIUS_MAX_PX, Math.max(r, ROTATE_RADIUS_PX));
  const w = Math.abs((rx * dx + ry * dy) / r) / len;
  return (1 - w) * (-tangential / reff) * (180 / Math.PI);
}

/** One finger stroke: which side of the player it is on, and which way it has been circling. */
export interface Stroke {
  side: StrokeSide;
  intent: number;
  /** Direction of the last finger move (radians), null at the start. */
  heading: number | null;
  /** Smoothed turning of the finger path (radians per px; + = clockwise on screen). */
  turn: number;
}
export function startStroke(c: { x: number; y: number }, start: { x: number; y: number }): Stroke {
  return { side: strokeSide(c, start), intent: 0, heading: null, turn: 0 };
}

/** A path curving at least this tightly (radius in px) counts fully as "drawing a circle". */
const CIRCLE_RADIUS_PX = 180;
/** Smoothing length for the path's turning (px of finger movement). */
const TURN_SMOOTH_PX = 40;
/** Advances a stroke by one finger move and returns the bearing change for it. */
export function strokeStep(
  s: Stroke,
  c: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { stroke: Stroke; delta: number } {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return { stroke: s, delta: 0 };
  const side = updateSide(s.side, c, b);
  const raw = dragRotation(c, a, b, side, s.intent);
  // A stroke that has been circling the player one way keeps turning that way.
  const k = Math.min(1, Math.abs(s.intent) / INTENT_FULL_DEG);
  const relative = (1 - k) * raw + k * Math.sign(s.intent) * Math.abs(raw);
  // Drawing a circle anywhere on the screen: the finger path's own turning drives the map
  // (360 degrees per loop), wherever the loop is. A sudden reversal (back and forth) resets
  // it instead of counting as a half turn.
  const heading = Math.atan2(b.y - a.y, b.x - a.x);
  let turn = s.turn;
  if (s.heading !== null) {
    let d = heading - s.heading;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    const f = 1 - Math.exp(-len / TURN_SMOOTH_PX);
    turn = Math.abs(d) > (2 * Math.PI) / 3 ? 0 : turn + (d / len - turn) * f;
  }
  const circling = Math.min(1, Math.abs(turn) * CIRCLE_RADIUS_PX);
  // clockwise loop → content turns clockwise → bearing goes down
  const curve = (-turn * len * 180) / Math.PI;
  const delta = (1 - circling) * relative + circling * curve;
  const intent = s.intent * Math.exp(-len / INTENT_FADE_PX) + aroundPart(c, a, b);
  return { stroke: { side, intent, heading, turn }, delta };
}

/** Fling: after a quick swipe the map keeps turning a little and slows down. */
export const FLING_DECAY_MS = 150;
const FLING_MIN_DEG_PER_MS = 0.05;
/** At most 0.6 degrees per ms, so a fling adds at most about 90 degrees. */
export const FLING_MAX_DEG_PER_MS = 0.6;
/** Speed is measured over the last part of the stroke … */
const FLING_WINDOW_MS = 100;
/** … and only if the finger was still moving when it was lifted. */
const FLING_STILL_MS = 60;

/**
 * Rotation speed for the fling (degrees per ms) from the stroke's recent moves. Measured
 * over a time window, not per event: touch and mouse events can come 1–3 ms apart, and a
 * per-event speed made a fast swipe spin the map half a turn after the finger was lifted.
 */
export function flingVelocity(samples: { t: number; delta: number }[], upAt: number): number {
  const recent = samples.filter((s) => s.t >= upAt - FLING_WINDOW_MS);
  if (recent.length === 0 || upAt - recent[recent.length - 1]!.t > FLING_STILL_MS) return 0;
  const sum = recent.reduce((a, s) => a + s.delta, 0);
  const span = Math.max(50, upAt - recent[0]!.t);
  const v = sum / span;
  return Math.max(-FLING_MAX_DEG_PER_MS, Math.min(FLING_MAX_DEG_PER_MS, v));
}

/** Wires the orbit gestures to a map. Returns a function that removes them. */
export function attachOrbit(map: MlMap): () => void {
  map.dragPan.disable();
  map.dragRotate.disable();
  map.doubleClickZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
  map.scrollZoom.enable({ around: 'center' });
  map.touchZoomRotate.enable({ around: 'center' });
  map.touchPitch.disable();

  const el = map.getCanvasContainer();
  const pointers = new Map<number, { x: number; y: number }>();
  let last: { x: number; y: number; t: number } | null = null;
  let moved = 0;
  let stroke: Stroke = { side: { sx: 1, sy: 1 }, intent: 0, heading: null, turn: 0 };
  /** Recent rotation steps (event time, degrees) for the fling. */
  let samples: { t: number; delta: number }[] = [];
  let fling = 0;
  const local = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
  };
  const stopFling = () => {
    if (fling) cancelAnimationFrame(fling);
    fling = 0;
  };
  const down = (e: PointerEvent) => {
    stopFling();
    pointers.set(e.pointerId, local(e));
    last = pointers.size === 1 ? local(e) : null; // two fingers: pinch/twist (MapLibre)
    if (last) stroke = startStroke(map.project(map.getCenter()), last);
    moved = 0;
    samples = [];
  };
  const move = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    if (pointers.size !== 1 || !last) return;
    const p = local(e);
    moved += Math.hypot(p.x - last.x, p.y - last.y);
    if (moved < 6) return; // a tap, not a drag
    const c = map.project(map.getCenter());
    const step = strokeStep(stroke, c, last, p);
    stroke = step.stroke;
    const delta = step.delta;
    samples.push({ t: p.t, delta });
    if (samples.length > 40) samples.shift();
    map.setBearing(map.getBearing() + delta);
    last = p;
  };
  const up = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const wasDragging = last !== null && moved >= 6 && pointers.size === 0;
    last = null;
    const velocity = wasDragging ? flingVelocity(samples, e.timeStamp) : 0;
    if (Math.abs(velocity) < FLING_MIN_DEG_PER_MS) return;
    let v = velocity;
    let prev = performance.now();
    const step = (now: number) => {
      const dt = now - prev;
      prev = now;
      v *= Math.exp(-dt / FLING_DECAY_MS);
      if (Math.abs(v) < 0.005) return void (fling = 0);
      map.setBearing(map.getBearing() + v * dt);
      fling = requestAnimationFrame(step);
    };
    fling = requestAnimationFrame(step);
  };
  // A drag that ends on a creature or stamp must not also tap it.
  const click = (e: MouseEvent) => {
    if (moved >= 6) {
      e.stopPropagation();
      e.preventDefault();
      moved = 0;
    }
  };
  el.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  el.addEventListener('click', click, true);
  return () => {
    stopFling();
    el.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    el.removeEventListener('click', click, true);
  };
}
