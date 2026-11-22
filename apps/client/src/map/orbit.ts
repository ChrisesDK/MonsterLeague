import type { Map as MlMap } from 'maplibre-gl';

/**
 * Play-view camera (owner requests after M2d): the camera always looks at the player.
 * - One-finger (or mouse) drag rotates the map around the player, never pans it.
 * - Pinch and the scroll wheel zoom around the player (the map centre).
 * - Zooming in tilts the camera up (30 degrees zoomed out, close to looking straight down,
 *   76 zoomed in) and moves the player lower on the screen (look-ahead, see lookAheadPadding).
 * - The fog wall (fogWall.ts) hides the world beyond the fog distance; the sky is drawn
 *   behind the map.
 */
export const ORBIT = {
  minZoom: 16.5,
  maxZoom: 18.5,
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
 * the ground ahead and the sky. Zoomed out the player stands where it always did (between
 * the HUD rows); zoomed all the way in, 60% of the way down: clear of the place card at the
 * bottom (an arena's card reaches up to about two thirds of the screen), and kept above the
 * bottom HUD on short screens.
 */
export const LOOK_AHEAD = { top: 130, bottom: 230, playerIn: 0.6, hudGap: 50 };

/** MapLibre padding for a zoom and screen height (the player is drawn at the padded centre). */
export function lookAheadPadding(
  zoom: number,
  height: number,
): { top: number; bottom: number; left: number; right: number } {
  const t = Math.max(0, Math.min(1, (zoom - ORBIT.minZoom) / (ORBIT.maxZoom - ORBIT.minZoom)));
  const { top, bottom, playerIn, hudGap } = LOOK_AHEAD;
  const yOut = (height + top - bottom) / 2;
  const yIn = Math.max(yOut, Math.min(height * playerIn, height - bottom - hudGap));
  const y = yOut + t * (yIn - yOut);
  return { top: Math.round(2 * y - height + bottom), bottom, left: 0, right: 0 };
}

/**
 * Stars on the night sky (owner request): small dots in repeating tiles, drawn in the sky
 * behind the map, so they only show above the horizon. They turn with the camera at the
 * speed the town turns at the horizon (about 22 px per degree on a phone; every tile width
 * divides one full turn, so the sky wraps without a seam) and move with the horizon when
 * the tilt changes. Each layer: [x, y, radius, opacity] in a tile of [w, h].
 */
export const STAR_PX_PER_DEG = 22;
const STAR_TILES: { w: number; h: number; stars: [number, number, number, number][] }[] = [
  {
    w: 240,
    h: 150,
    stars: [
      [18, 22, 1.3, 0.9],
      [96, 64, 1, 0.7],
      [170, 18, 1.6, 1],
      [214, 98, 1, 0.6],
      [58, 120, 1.2, 0.8],
    ],
  },
  {
    w: 330,
    h: 210,
    stars: [
      [40, 70, 0.9, 0.55],
      [138, 150, 1.4, 0.85],
      [250, 44, 1, 0.65],
      [300, 180, 0.9, 0.5],
    ],
  },
  {
    w: 360,
    h: 270,
    stars: [
      [120, 30, 1.8, 0.95],
      [290, 120, 1.1, 0.7],
      [24, 210, 1, 0.6],
    ],
  },
];

/**
 * The sky behind the map: sky colour at the top of the screen, fog colour at the horizon;
 * with `stars` (night), stars above it. Returns a CSS `background` value.
 */
export function skyBackground(
  horizonY: number,
  sky: string,
  fog: string,
  stars?: { bearing: number },
): string {
  const gradient = `linear-gradient(180deg, ${sky} 0px, ${fog} ${Math.max(1, horizonY).toFixed(0)}px)`;
  if (!stars) return gradient;
  const pan = -(((stars.bearing % 360) + 360) % 360) * STAR_PX_PER_DEG;
  const layers = STAR_TILES.map(({ w, h, stars: dots }) => {
    const x = (((pan % w) + w) % w).toFixed(0);
    const y = (((horizonY % h) + h) % h).toFixed(0);
    const g = dots
      .map(
        ([sx, sy, r, a]) =>
          `radial-gradient(circle at ${sx}px ${sy}px, rgba(255,248,230,${a}) 0 ${r}px, transparent ${(r + 0.8).toFixed(1)}px) ${x}px ${y}px / ${w}px ${h}px repeat`,
      )
      .join(', ');
    return g;
  });
  return `${layers.join(', ')}, ${gradient}`;
}
