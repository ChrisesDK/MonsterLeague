import maplibregl, { type CustomLayerInterface, type Map as MlMap } from 'maplibre-gl';

/**
 * The sky wall (owner design, D152): the edge of the world and the sky in one. A tall ring
 * around the player at the fog distance, drawn in the 3D scene with MapLibre's depth buffer:
 *
 * - it is the world's loading boundary: buildings in front of it stay in front, and
 *   everything behind it (ground, buildings, labels) is hidden;
 * - it is the sky: its colour follows the angle above the horizon as seen from the camera
 *   (the fog colour at the foot, the sky colour higher up), and at night it carries the
 *   stars, at fixed places on the wall. The stars therefore sit exactly where the edge of the
 *   world is and move with the skyline when the camera turns (a sky painted behind the map
 *   behaved as infinitely far away and slid against it);
 * - it is tall enough to fill the screen above the horizon at every tilt (worked out from
 *   the camera on every frame), so nothing behind the map is ever seen;
 * - a haze band on the ground just inside it blends the last stretch of ground into the
 *   fog colour at the wall's foot.
 *
 * It replaces the fog wall painted like a screen-space sky, the sky behind the map and the
 * CSS star tiles (D138, D141, D142).
 */
export const SKY_WALL_ID = 'sky-wall';
/** The haze band on the ground inside the wall: its width, and how strong it gets. */
export const HAZE_M = 150;
export const HAZE_MAX = 0.9;
/** Segments around the ring. */
export const WALL_SEGMENTS = 128;
/** Height above the horizon (degrees, seen from the camera) where the sky colour is reached. */
export const SKY_FULL_DEG = 14;
/** Extra height above the top of the screen, in degrees (never a gap at the top). */
const TOP_MARGIN_DEG = 3;
/** Star grid on the wall (metres): one cell per this many metres, a star in some of them. */
export const STAR_CELL_M = 26;

/**
 * How tall the wall must be (metres) so its top lies above the top of the screen.
 * `pitchDeg` 0 looks straight down; `aboveCentrePx` is how far the top of the screen is
 * above the camera's centre point (px), `f` the camera-to-centre distance (px); the camera
 * stands `cameraM` above the ground and `backM` behind the player; the wall is `radiusM`
 * from the player.
 */
export function wallHeight(
  pitchDeg: number,
  aboveCentrePx: number,
  f: number,
  cameraM: number,
  backM: number,
  radiusM: number,
): number {
  const axisDown = 90 - pitchDeg; // the view axis' angle below the horizontal
  const topDeg = (Math.atan(aboveCentrePx / f) * 180) / Math.PI - axisDown;
  const deg = Math.max(0, topDeg) + TOP_MARGIN_DEG;
  return cameraM + (radiusM + backM) * Math.tan((deg * Math.PI) / 180);
}

/**
 * Triangle-strip vertices of the wall, relative to its centre: per vertex the position
 * (x, y, z in MercatorCoordinate units; y grows southwards), then the place on the wall
 * (u = 0–1 around the ring from north, height in metres) and the opacity weight (1: solid).
 */
export function wallStrip(
  radius: number,
  height: number,
  heightM: number,
  segments = WALL_SEGMENTS,
): Float32Array {
  const out = new Float32Array((segments + 1) * 2 * 6);
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const a = 2 * Math.PI * u;
    const x = radius * Math.sin(a);
    const y = -radius * Math.cos(a);
    out.set([x, y, 0, u, 0, 1, x, y, height, u, heightM, 1], i * 12);
  }
  return out;
}

/**
 * Triangle-strip vertices of the haze band: a ring on the ground from `inner` (weight 0,
 * clear) to `outer` (weight 1, the wall's foot), same layout as wallStrip.
 */
export function hazeStrip(inner: number, outer: number, segments = WALL_SEGMENTS): Float32Array {
  const out = new Float32Array((segments + 1) * 2 * 6);
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const a = 2 * Math.PI * u;
    const s = Math.sin(a);
    const c = -Math.cos(a);
    out.set([inner * s, inner * c, 0, u, 0, 0, outer * s, outer * c, 0, u, 0, 1], i * 12);
  }
  return out;
}

/**
 * `m × translate(cx, cy, 0)` for a column-major 4 × 4 matrix, in double precision, so the
 * wall's vertices can stay small (relative to the player) and don't jitter in float32.
 */
export function translated(m: ArrayLike<number>, cx: number, cy: number): Float32Array {
  const out = new Float32Array(16);
  for (let i = 0; i < 16; i++) out[i] = m[i]!;
  for (let r = 0; r < 4; r++) out[12 + r] = m[r]! * cx + m[4 + r]! * cy + m[12 + r]!;
  return out;
}

/** '#rrggbb' or '#rgb' → [r, g, b] in 0–1 (anything else: a neutral grey). */
export function rgb(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return [0.8, 0.8, 0.8];
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/**
 * The wall's colour at an angle above the horizon (degrees, seen from the camera): the fog
 * colour at and below the horizon, blending into the sky colour by SKY_FULL_DEG. The shader
 * does the same per pixel.
 */
export function skyAt(
  elevDeg: number,
  sky: [number, number, number],
  fog: [number, number, number],
): [number, number, number] {
  const t = Math.max(0, Math.min(1, elevDeg / SKY_FULL_DEG));
  return [0, 1, 2].map((i) => fog[i]! + (sky[i]! - fog[i]!) * t) as [number, number, number];
}

const VERT = `
attribute vec3 a_pos;
attribute vec3 a_wall;
uniform mat4 u_matrix;
varying vec3 v_wall;
void main() {
  v_wall = a_wall;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}`;
// v_wall: (u around the ring, height in metres, opacity weight). Colour: the sky gradient by
// the angle above the horizon seen from the camera; stars at night: a soft dot in some cells
// of a grid laid on the wall (fixed places, so they move with the world).
const FRAG = `
precision highp float;
uniform vec3 u_sky;
uniform vec3 u_fog;
uniform float u_cameraM;
uniform float u_distM;
uniform float u_skyFull;
uniform float u_ringM;
uniform float u_night;
uniform float u_max;
varying vec3 v_wall;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  float elev = atan(v_wall.y - u_cameraM, u_distM);
  vec3 c = mix(u_fog, u_sky, clamp(elev / u_skyFull, 0.0, 1.0));
  if (u_night > 0.5) {
    vec2 p = vec2(v_wall.x * u_ringM, v_wall.y) / ${STAR_CELL_M.toFixed(1)};
    vec2 cell = floor(p);
    if (hash(cell) < 0.32) {
      vec2 centre = cell + 0.2 + 0.6 * vec2(hash(cell + 1.3), hash(cell + 7.1));
      float d = length(p - centre) * ${STAR_CELL_M.toFixed(1)};
      float r = 1.4 + 1.8 * hash(cell + 3.7);
      float s = (1.0 - smoothstep(r * 0.35, r, d)) * (0.55 + 0.45 * hash(cell + 9.2));
      s *= smoothstep(0.003, 0.025, elev); // down to just above the skyline
      c = mix(c, vec3(1.0, 0.97, 0.9), s);
    }
  }
  float a = u_max * smoothstep(0.0, 1.0, v_wall.z);
  gl_FragColor = vec4(c * a, a);
}`;

/**
 * Adds the sky wall on top of every layer. `distanceM` (the setting) and `look` (the sky and
 * fog colours, and whether it is night) are read on every frame.
 */
export function addSkyWall(
  map: MlMap,
  distanceM: () => number,
  look: () => { sky: string; fog: string; night: boolean },
): void {
  let program: WebGLProgram | null = null;
  let wallBuf: WebGLBuffer | null = null;
  let hazeBuf: WebGLBuffer | null = null;
  let aPos = -1;
  let aWall = -1;
  const u: Record<string, WebGLUniformLocation | null> = {};
  const layer: CustomLayerInterface = {
    id: SKY_WALL_ID,
    type: 'custom',
    renderingMode: '3d',
    onAdd(_map, gl) {
      const shader = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };
      program = gl.createProgram()!;
      gl.attachShader(program, shader(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      aPos = gl.getAttribLocation(program, 'a_pos');
      aWall = gl.getAttribLocation(program, 'a_wall');
      for (const n of [
        'u_matrix',
        'u_sky',
        'u_fog',
        'u_cameraM',
        'u_distM',
        'u_skyFull',
        'u_ringM',
        'u_night',
        'u_max',
      ])
        u[n] = gl.getUniformLocation(program, n);
      wallBuf = gl.createBuffer();
      hazeBuf = gl.createBuffer();
    },
    render(gl, matrix) {
      if (!program || !wallBuf || !hazeBuf) return;
      const tr = map.transform;
      const c = maplibregl.MercatorCoordinate.fromLngLat(map.getCenter(), 0);
      const perM = c.meterInMercatorCoordinateUnits();
      const mPerPx =
        (40075016.686 * Math.cos((tr.center.lat * Math.PI) / 180)) / (512 * 2 ** tr.zoom);
      const p = (tr.pitch * Math.PI) / 180;
      const f = tr.cameraToCenterDistance;
      const cameraM = f * Math.cos(p) * mPerPx;
      const backM = f * Math.sin(p) * mPerPx;
      const d = distanceM();
      const heightM = wallHeight(tr.pitch, tr.centerPoint.y, f, cameraM, backM, d);
      const { sky, fog, night } = look();

      gl.useProgram(program);
      gl.uniformMatrix4fv(u.u_matrix!, false, translated(matrix as ArrayLike<number>, c.x, c.y));
      gl.uniform3fv(u.u_sky!, rgb(sky));
      gl.uniform3fv(u.u_fog!, rgb(fog));
      gl.uniform1f(u.u_cameraM!, cameraM);
      gl.uniform1f(u.u_distM!, d + backM);
      gl.uniform1f(u.u_skyFull!, (SKY_FULL_DEG * Math.PI) / 180);
      // whole star cells around the ring, so the pattern meets itself without a seam
      gl.uniform1f(u.u_ringM!, Math.round((2 * Math.PI * d) / STAR_CELL_M) * STAR_CELL_M);
      gl.uniform1f(u.u_night!, night ? 1 : 0);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const draw = (buf: WebGLBuffer, verts: Float32Array, max: number) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(aWall);
        gl.vertexAttribPointer(aWall, 3, gl.FLOAT, false, 24, 12);
        gl.uniform1f(u.u_max!, max);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, verts.length / 6);
      };
      draw(hazeBuf, hazeStrip(Math.max(0, d - HAZE_M) * perM, d * perM), HAZE_MAX);
      draw(wallBuf, wallStrip(d * perM, heightM * perM, heightM), 1);
      gl.disableVertexAttribArray(aPos);
      gl.disableVertexAttribArray(aWall);
    },
  };
  map.addLayer(layer);
}
