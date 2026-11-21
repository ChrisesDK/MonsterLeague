import type { Map as MlMap } from 'maplibre-gl';

/**
 * Play-view camera (owner requests after M2d): the camera always looks at the player.
 * - One-finger (or mouse) drag rotates the map around the player, never pans it.
 * - Pinch and the scroll wheel zoom around the player (the map centre).
 * - Zooming in tilts the camera up (55° zoomed out, 80° zoomed in) so the view reaches
 *   further while the camera is closer to the ground.
 */
export const ORBIT = {
  minZoom: 16.5,
  maxZoom: 18.5,
  zoom: 17.5,
  /** Tilt when zoomed all the way out … */
  minPitch: 55,
  /** … and all the way in. */
  maxPitch: 80,
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
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  // radius at the middle of the stroke
  const rx = (a.x + b.x) / 2 - c.x;
  const ry = (a.y + b.y) / 2 - c.y;
  const r = Math.hypot(rx, ry);
  const sideways = (side.sy * dx - side.sx * dy) * DEG_PER_PX;
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

/** Fling: after a quick swipe the map keeps turning and slows down over about 0.4 s. */
const FLING_DECAY_MS = 180;
const FLING_MIN_DEG_PER_MS = 0.05;

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
  let side: StrokeSide = { sx: 1, sy: 1 };
  /** Smoothed rotation speed (deg/ms) for the fling. */
  let velocity = 0;
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
    if (last) side = strokeSide(map.project(map.getCenter()), last);
    moved = 0;
    velocity = 0;
  };
  const move = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    if (pointers.size !== 1 || !last) return;
    const p = local(e);
    moved += Math.hypot(p.x - last.x, p.y - last.y);
    if (moved < 6) return; // a tap, not a drag
    const c = map.project(map.getCenter());
    const delta = dragRotation(c, last, p, side);
    const dt = Math.max(1, p.t - last.t);
    velocity = velocity * 0.6 + (delta / dt) * 0.4;
    map.setBearing(map.getBearing() + delta);
    last = p;
  };
  const up = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const wasDragging = last !== null && moved >= 6 && pointers.size === 0;
    last = null;
    if (!wasDragging || Math.abs(velocity) < FLING_MIN_DEG_PER_MS) return;
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
