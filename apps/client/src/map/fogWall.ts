import maplibregl, { type CustomLayerInterface, type Map as MlMap } from 'maplibre-gl';

/**
 * The edge of the world (owner feedback, D138/D142). A ring-shaped wall around the player
 * at the fog distance, drawn in the 3D scene with MapLibre's depth buffer: buildings in front
 * of it stay in front, and everything behind it (ground, buildings, labels) is hidden. It is
 * what makes the round cut-out of the map, and the boundary nothing behind is seen past.
 *
 * It is painted with the sky's own gradient (sky colour at the top of the screen, fog colour
 * at the horizon and below, exactly like the sky behind the map), so it is practically
 * invisible: the round patch of world simply ends in sky. Its top is at the camera's height,
 * so seen from the camera it ends at the horizon and never covers the stars above it. A
 * haze band on the ground just inside it blends the last stretch of ground into the sky.
 */
export const FOG_WALL_ID = 'fog-wall';
/** The wall's top above the camera's height (at the horizon, so the stars stay visible). */
export const WALL_ABOVE_CAMERA_M = 1;
/** The haze band on the ground inside the wall: its width, and how strong it gets. */
export const HAZE_M = 150;
export const HAZE_MAX = 0.9;
/** Segments around the ring. */
export const WALL_SEGMENTS = 128;

/**
 * Triangle-strip vertices of the ring wall, relative to its centre, in MercatorCoordinate
 * units: (x, y, z, w) for bottom and top at every step around (y grows southwards). `w` is
 * the opacity weight (1: the wall is solid).
 */
export function wallStrip(radius: number, height: number, segments = WALL_SEGMENTS): Float32Array {
  const out = new Float32Array((segments + 1) * 2 * 4);
  for (let i = 0; i <= segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    const x = radius * Math.sin(a);
    const y = -radius * Math.cos(a);
    out.set([x, y, 0, 1, x, y, height, 1], i * 8);
  }
  return out;
}

/**
 * Triangle-strip vertices of the haze band: a ring on the ground from `inner` (weight 0,
 * clear) to `outer` (weight 1, the wall's foot), same layout as wallStrip.
 */
export function hazeStrip(inner: number, outer: number, segments = WALL_SEGMENTS): Float32Array {
  const out = new Float32Array((segments + 1) * 2 * 4);
  for (let i = 0; i <= segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    const s = Math.sin(a);
    const c = -Math.cos(a);
    out.set([inner * s, inner * c, 0, 0, outer * s, outer * c, 0, 1], i * 8);
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
 * The sky gradient's colour at a screen row (CSS px from the top), as skyBackground draws
 * it: sky at the top, fog at the horizon, fog below. The shader does the same per pixel.
 */
export function skyAt(
  y: number,
  horizonY: number,
  sky: [number, number, number],
  fog: [number, number, number],
): [number, number, number] {
  const t = Math.max(0, Math.min(1, y / Math.max(1, horizonY)));
  return [0, 1, 2].map((i) => sky[i]! + (fog[i]! - sky[i]!) * t) as [number, number, number];
}

const VERT = `
attribute vec4 a_pos;
uniform mat4 u_matrix;
varying float v_w;
void main() {
  v_w = a_pos.w;
  gl_Position = u_matrix * vec4(a_pos.xyz, 1.0);
}`;
// colour: the sky gradient at this pixel's row (gl_FragCoord is in device pixels from the
// bottom); opacity: smooth ramp of the weight (the wall has weight 1, the haze 0 → 1)
const FRAG = `
precision highp float;
uniform vec3 u_sky;
uniform vec3 u_fog;
uniform float u_horizon;
uniform float u_height;
uniform float u_max;
varying float v_w;
void main() {
  float y = u_height - gl_FragCoord.y;
  float t = clamp(y / max(u_horizon, 1.0), 0.0, 1.0);
  vec3 c = mix(u_sky, u_fog, t);
  float a = u_max * smoothstep(0.0, 1.0, v_w);
  gl_FragColor = vec4(c * a, a);
}`;

/** A point this far ahead is drawn (practically) on the horizon. */
const HORIZON_M = 200_000;

/**
 * Adds the wall on top of every layer. `distanceM` and `colours` (the sky and fog colours of
 * the current palette) are read on every frame.
 */
export function addFogWall(
  map: MlMap,
  distanceM: () => number,
  colours: () => { sky: string; fog: string },
): void {
  let program: WebGLProgram | null = null;
  let wallBuf: WebGLBuffer | null = null;
  let hazeBuf: WebGLBuffer | null = null;
  let aPos = -1;
  const u: Record<string, WebGLUniformLocation | null> = {};
  const layer: CustomLayerInterface = {
    id: FOG_WALL_ID,
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
      for (const n of ['u_matrix', 'u_sky', 'u_fog', 'u_horizon', 'u_height', 'u_max'])
        u[n] = gl.getUniformLocation(program, n);
      wallBuf = gl.createBuffer();
      hazeBuf = gl.createBuffer();
    },
    render(gl, matrix) {
      if (!program || !wallBuf || !hazeBuf) return;
      const tr = map.transform;
      const centre = map.getCenter();
      const c = maplibregl.MercatorCoordinate.fromLngLat(centre, 0);
      const perM = c.meterInMercatorCoordinateUnits();
      const metresPerPx =
        (40075016.686 * Math.cos((tr.center.lat * Math.PI) / 180)) / (512 * 2 ** tr.zoom);
      const cameraM =
        tr.cameraToCenterDistance * Math.cos((tr.pitch * Math.PI) / 180) * metresPerPx;
      // the horizon's row on screen (CSS px), as the sky behind the map uses it
      const b = (map.getBearing() * Math.PI) / 180;
      const far = new maplibregl.LngLat(
        centre.lng +
          ((HORIZON_M * Math.sin(b)) / 111_320) * (1 / Math.cos((centre.lat * Math.PI) / 180)),
        centre.lat + (HORIZON_M * Math.cos(b)) / 111_320,
      );
      const horizonY = map.project(far).y;
      const dpr = map.getPixelRatio();
      const { sky, fog } = colours();
      const d = distanceM();

      gl.useProgram(program);
      gl.uniformMatrix4fv(u.u_matrix!, false, translated(matrix as ArrayLike<number>, c.x, c.y));
      gl.uniform3fv(u.u_sky!, rgb(sky));
      gl.uniform3fv(u.u_fog!, rgb(fog));
      gl.uniform1f(u.u_horizon!, horizonY * dpr);
      gl.uniform1f(u.u_height!, gl.drawingBufferHeight);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const draw = (buf: WebGLBuffer, verts: Float32Array, max: number) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 4, gl.FLOAT, false, 0, 0);
        gl.uniform1f(u.u_max!, max);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, verts.length / 4);
      };
      draw(hazeBuf, hazeStrip(Math.max(0, d - HAZE_M) * perM, d * perM), HAZE_MAX);
      draw(wallBuf, wallStrip(d * perM, (cameraM + WALL_ABOVE_CAMERA_M) * perM), 1);
    },
  };
  map.addLayer(layer);
}
