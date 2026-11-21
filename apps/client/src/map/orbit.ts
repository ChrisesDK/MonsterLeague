import type { Map as MlMap } from 'maplibre-gl';

/**
 * Play-view camera (owner requests after M2d): the camera always looks at the player.
 * - One-finger (or mouse) drag rotates the map around the player, never pans it.
 * - Pinch and the scroll wheel zoom around the player (the map centre).
 * - Zooming in tilts the camera up (30 degrees zoomed out, close to looking straight down, 76 zoomed in); a haze along the
 *   top of the map hides where the map's far edge ends.
 */
export const ORBIT = {
  minZoom: 16.5,
  maxZoom: 18.5,
  zoom: 17.5,
  /** Tilt when zoomed all the way out … */
  minPitch: 30,
  /**
   * … and all the way in. 65 to 72 was too little to see on a phone; 76 shows clearly more
   * ground ahead when zoomed in, and the haze covers the far edge (see .map-haze).
   */
  maxPitch: 76,
};

/** Haze strength (0–1) for a tilt: none up to 55 degrees, full at the steepest tilt. */
export function hazeForPitch(pitch: number): number {
  return Math.max(0, Math.min(1, (pitch - 55) / (ORBIT.maxPitch - 55)));
}

/** Tilt for a zoom level: linear from minPitch (zoomed out) to maxPitch (zoomed in). */
export function pitchForZoom(zoom: number): number {
  const t = Math.max(0, Math.min(1, (zoom - ORBIT.minZoom) / (ORBIT.maxZoom - ORBIT.minZoom)));
  return ORBIT.minPitch + t * (ORBIT.maxPitch - ORBIT.minPitch);
}

/**
 * Drag-to-rotate (owner feedback: simplified). Only motion *around* the player turns the
 * map, with the finger: a stroke below or above the player, along a side, or a half or full
 * circle around the player. A horizontal swipe level with the player moves towards or away
 * from it, so it turns the map hardly at all; nothing is blocked or ignored.
 * - Close to the player the angle swept changes very fast, so each move's rotation is
 *   damped by (r / NEAR_PX)³ there: a swipe right next to the player stays negligible.
 * - The angle is measured with an effective radius of at least MIN_RADIUS_PX (steady) and
 *   at most MAX_RADIUS_PX (far strokes near the screen edge still turn decisively).
 */
export const NEAR_PX = 200;
export const MIN_RADIUS_PX = 140;
export const MAX_RADIUS_PX = 260;

/** Bearing change (degrees; + = the view turns clockwise on the compass) for a finger move a → b with the player at c (screen px, y down). */
export function dragRotation(
  c: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rx = (a.x + b.x) / 2 - c.x;
  const ry = (a.y + b.y) / 2 - c.y;
  const r = Math.hypot(rx, ry);
  if (r < 1e-6) return 0;
  // the part of the move that goes around the player (+ = clockwise on screen)
  const tangential = (rx * dy - ry * dx) / r;
  const near = Math.min(1, (r / NEAR_PX) ** 3);
  const reff = Math.min(MAX_RADIUS_PX, Math.max(r, MIN_RADIUS_PX));
  // the map follows the finger: clockwise finger → content turns clockwise → bearing down
  return ((-tangential * near) / reff) * (180 / Math.PI);
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
    const delta = dragRotation(c, last, p);
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

/**
 * The fog ellipse in screen pixels, from the player's screen point and the projected points
 * at the fog start and end ahead of the player and at the fog end to the side. Returns the
 * CSS radial-gradient for the .map-fog overlay (transparent inside the start, solid fog
 * from the end outwards).
 */
export function fogEllipse(
  player: { x: number; y: number },
  startAhead: { x: number; y: number },
  endAhead: { x: number; y: number },
  endSide: { x: number; y: number },
  colour: string,
): string {
  const ry = Math.max(1, Math.hypot(endAhead.x - player.x, endAhead.y - player.y));
  const rx = Math.max(1, Math.hypot(endSide.x - player.x, endSide.y - player.y));
  const ryStart = Math.hypot(startAhead.x - player.x, startAhead.y - player.y);
  const startPct = Math.max(0, Math.min(99, (100 * ryStart) / ry));
  const mid = startPct + (100 - startPct) * 0.55;
  return (
    `radial-gradient(ellipse ${rx.toFixed(0)}px ${ry.toFixed(0)}px at ${player.x.toFixed(0)}px ${player.y.toFixed(0)}px, ` +
    `transparent ${startPct.toFixed(1)}%, ` +
    `color-mix(in srgb, ${colour} 55%, transparent) ${mid.toFixed(1)}%, ${colour} 100%)`
  );
}
