import type { Map as MlMap } from 'maplibre-gl';

/**
 * Play-view camera (owner requests after M2d): the camera always looks at the player.
 * - One-finger (or mouse) drag rotates the map around the player, never pans it.
 * - Pinch and the scroll wheel zoom around the player (the map centre).
 * - Zooming in tilts the camera up (30 degrees zoomed out, close to looking straight down,
 *   76 zoomed in) and moves the player lower on the screen (look-ahead, see lookAheadPadding).
 * - The sky wall (skyWall.ts) hides the world beyond the fog distance and is the sky.
 */
export const ORBIT = {
  minZoom: 16.5,
  /** Owner: 18.5 put the camera too close to the ground. */
  maxZoom: 18.3,
  zoom: 17.5,
  /** Tilt when zoomed all the way out … */
  minPitch: 30,
  /**
   * … and all the way in. 76 shows clearly more ground ahead when zoomed in; the fog wall
   * at 2 km hides the map's far edge (see fogWall).
   */
  maxPitch: 76,
};

/** Tilt for a zoom level: linear from minPitch (zoomed out) to maxPitch (zoomed in). */
export function pitchForZoom(zoom: number): number {
  const t = Math.max(0, Math.min(1, (zoom - ORBIT.minZoom) / (ORBIT.maxZoom - ORBIT.minZoom)));
  return ORBIT.minPitch + t * (ORBIT.maxPitch - ORBIT.minPitch);
}

/**
 * Drag-to-rotate (owner feedback: accuracy first). The map turns by exactly the angle the
 * finger sweeps around the player, so the screen always follows the finger, at any
 * distance from the player: close to the player a small move sweeps a large angle, far away
 * a large move sweeps a small one, just as the finger does. Moves that start or end on the
 * player itself (within DEAD_PX) have no defined angle and are skipped.
 */
export const DEAD_PX = 2;

/** Bearing change (degrees; + = the view turns clockwise on the compass) for a finger move a → b with the player at c (screen px, y down). */
export function dragRotation(
  c: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  if (Math.hypot(a.x - c.x, a.y - c.y) < DEAD_PX || Math.hypot(b.x - c.x, b.y - c.y) < DEAD_PX)
    return 0;
  let d = (Math.atan2(b.y - c.y, b.x - c.x) - Math.atan2(a.y - c.y, a.x - c.x)) * (180 / Math.PI);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  // the map follows the finger: clockwise on screen turns the content clockwise, so the
  // bearing goes down
  return -d;
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

/** Fingers (or the mouse button) currently down on each map, kept by attachOrbit. */
const fingers = new WeakMap<MlMap, Map<number, unknown>>();

/**
 * True while a finger or the mouse is down on the map. The play view must not re-centre
 * the camera with `jumpTo` then: `jumpTo` resets every MapLibre gesture, and a pinch only
 * counts as moving once the fingers have spread past MapLibre's zoom threshold. Re-centring
 * on a gliding player in that gap wiped the pinch, which then did nothing until the fingers
 * were lifted (owner report: pinch sometimes ignored on the phone).
 */
export function fingersDown(map: MlMap): boolean {
  return (fingers.get(map)?.size ?? 0) > 0;
}

/**
 * One-handed zoom (testers' request): tap, then tap again and hold within DOUBLE_TAP_MS and
 * DOUBLE_TAP_PX, and drag: down zooms in, up zooms out (as in common map apps), sideways
 * turns the view. Touch only.
 */
export const DOUBLE_TAP_MS = 320;
export const DOUBLE_TAP_PX = 40;
/** Pixels of vertical drag per zoom level. */
export const ONE_FINGER_PX_PER_ZOOM = 160;
/** Degrees per pixel of sideways drag while zooming with one finger. */
export const ONE_FINGER_DEG_PER_PX = 0.35;

/** The zoom after a one-finger zoom drag of `dyPx` (down = +, in) from `zoom`. */
export function oneFingerZoom(zoom: number, dyPx: number): number {
  return Math.max(ORBIT.minZoom, Math.min(ORBIT.maxZoom, zoom + dyPx / ONE_FINGER_PX_PER_ZOOM));
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
  fingers.set(map, pointers);
  let last: { x: number; y: number; t: number } | null = null;
  let moved = 0;
  /** Recent rotation steps (event time, degrees) for the fling. */
  let samples: { t: number; delta: number }[] = [];
  let fling = 0;
  /** The last tap (touch, no drag), for tap → tap-and-hold zoom. */
  let lastTap: { x: number; y: number; t: number } | null = null;
  /** While zooming with one finger: where the drag is now. */
  let zooming: { x: number; y: number } | null = null;
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
    const p = local(e);
    pointers.set(e.pointerId, p);
    last = pointers.size === 1 ? p : null; // two fingers: pinch/twist (MapLibre)
    moved = 0;
    samples = [];
    zooming =
      pointers.size === 1 &&
      e.pointerType === 'touch' &&
      lastTap &&
      p.t - lastTap.t <= DOUBLE_TAP_MS &&
      Math.hypot(p.x - lastTap.x, p.y - lastTap.y) <= DOUBLE_TAP_PX
        ? { x: p.x, y: p.y }
        : null;
    lastTap = null;
  };
  const move = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    if (pointers.size !== 1 || !last) return;
    const p = local(e);
    if (zooming) {
      moved += Math.hypot(p.x - zooming.x, p.y - zooming.y);
      map.setZoom(oneFingerZoom(map.getZoom(), p.y - zooming.y));
      // the same way round as a normal drag (owner: right to left turns counter-clockwise)
      map.setBearing(map.getBearing() + (p.x - zooming.x) * ONE_FINGER_DEG_PER_PX);
      zooming = { x: p.x, y: p.y };
      return;
    }
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
    const wasDragging = last !== null && moved >= 6 && pointers.size === 0 && !zooming;
    // a touch that didn't drag is a tap: the next one may start a one-finger zoom
    if (last !== null && moved < 6 && !zooming && e.pointerType === 'touch') lastTap = local(e);
    if (zooming) moved = Math.max(moved, 6); // the drag must not also tap what lies under it
    zooming = null;
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
    fingers.delete(map);
    el.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    el.removeEventListener('click', click, true);
  };
}

/** Ground metres per screen pixel at the map centre (MapLibre's 512 px world tiles). */
export function metresPerPx(lat: number, zoom: number): number {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/**
 * How far MapLibre draws the ground (owner report: zoomed in, the ground ended before the
 * fog). MapLibre stops drawing where the view reaches 85% of the way (in screen pixels) from
 * the centre to the horizon: zoomed all the way in that was only about 850 m ahead, short of
 * the fog wall, and with the look-ahead padding it would draw almost to the real horizon
 * (tens of kilometres of tiles). MapLibre takes that line from `Transform.getHorizon()`, so
 * the play map replaces it with this: the horizon value (px above the centre) at which the
 * ground is drawn exactly `aheadM` past the centre (the player), and no further.
 *
 * `offsetY` is the centre's offset from the middle of the screen (padding, + = lower), which
 * MapLibre's far-plane formula scales the horizon angle by; solved by bisection.
 */
export function horizonForReach(
  pitchDeg: number,
  cameraToCenterPx: number,
  mPerPx: number,
  aheadM: number,
  offsetY = 0,
): number {
  const f = cameraToCenterPx;
  const p = (pitchDeg * Math.PI) / 180;
  const toHorizon = Math.PI / 2 - p; // angle from the centre ray up to the true horizon
  // angle above the centre ray of the ground point aheadM past the centre
  const target = toHorizon - Math.atan((f * Math.cos(p)) / (f * Math.sin(p) + aheadM / mPerPx));
  // the angle MapLibre's far plane reaches for a horizon value (its formula, see _calcMatrices)
  const reach = (hz: number) => Math.atan(hz / f) * (1 + offsetY / hz);
  let lo = 1e-3;
  let hi = Math.tan(toHorizon) * f * 0.9999;
  if (reach(hi) <= target) return hi;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (reach(mid) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * Look ahead when zoomed in (owner idea): the camera still looks at the player, but the
 * player sits lower on the screen the further you zoom in, leaving more of the screen for
 * the ground ahead and the sky. Zoomed out the player stands in the middle of the screen
 * (owner: higher up, it showed too much of the ground behind); zoomed all the way in, 72 %
 * of the way down, just above the open Nearby strip (`clear` px kept free at the bottom).
 */
export const LOOK_AHEAD = { bottom: 230, playerIn: 0.72, clear: 220 };

/** MapLibre padding for a zoom and screen height (the player is drawn at the padded centre). */
export function lookAheadPadding(
  zoom: number,
  height: number,
): { top: number; bottom: number; left: number; right: number } {
  const t = Math.max(0, Math.min(1, (zoom - ORBIT.minZoom) / (ORBIT.maxZoom - ORBIT.minZoom)));
  const { bottom, playerIn, clear } = LOOK_AHEAD;
  const yOut = height / 2;
  const yIn = Math.max(yOut, Math.min(height * playerIn, height - clear));
  const y = yOut + t * (yIn - yOut);
  return { top: Math.round(2 * y - height + bottom), bottom, left: 0, right: 0 };
}
