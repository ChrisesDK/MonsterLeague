import maplibregl, { type CustomLayerInterface, type Map as MlMap } from 'maplibre-gl';

/**
 * The fog wall as a real wall in the 3D scene (owner feedback: the screen-space fog covered
 * buildings that stand inside it). A ring around the player at the fog distance, in the fog
 * colour, drawn with MapLibre's depth buffer: buildings in front of it stay in front, and
 * everything behind it (ground, buildings, labels) is hidden. Its top is a little above the
 * camera's height, so seen from the camera it ends just above the horizon, where the sky
 * (the map's background, behind the canvas) takes over.
 */
export const FOG_WALL_ID = 'fog-wall';
/** How far the wall's top reaches above the camera's height (hides tall buildings behind it). */
export const WALL_ABOVE_CAMERA_M = 40;
/** Segments around the ring. */
export const WALL_SEGMENTS = 128;

/**
 * Triangle-strip vertices of the ring wall, relative to its centre, in MercatorCoordinate
 * units: (x, y, z) for bottom and top at every step around (y grows southwards).
 */
export function wallStrip(radius: number, height: number, segments = WALL_SEGMENTS): Float32Array {
  const out = new Float32Array((segments + 1) * 2 * 3);
  for (let i = 0; i <= segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    const x = radius * Math.sin(a);
    const y = -radius * Math.cos(a);
    out.set([x, y, 0, x, y, height], i * 6);
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

const VERT = `
attribute vec3 a_pos;
uniform mat4 u_matrix;
void main() { gl_Position = u_matrix * vec4(a_pos, 1.0); }`;
const FRAG = `
precision mediump float;
uniform vec3 u_color;
void main() { gl_FragColor = vec4(u_color, 1.0); }`;

/** Adds the wall on top of every layer; `distanceM` and `colour` are read on every frame. */
export function addFogWall(map: MlMap, distanceM: () => number, colour: () => string): void {
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let aPos = -1;
  let uMatrix: WebGLUniformLocation | null = null;
  let uColor: WebGLUniformLocation | null = null;
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
      uMatrix = gl.getUniformLocation(program, 'u_matrix');
      uColor = gl.getUniformLocation(program, 'u_color');
      buffer = gl.createBuffer();
    },
    render(gl, matrix) {
      if (!program || !buffer) return;
      const tr = map.transform;
      const c = maplibregl.MercatorCoordinate.fromLngLat(map.getCenter(), 0);
      const perM = c.meterInMercatorCoordinateUnits();
      const metresPerPx =
        (40075016.686 * Math.cos((tr.center.lat * Math.PI) / 180)) / (512 * 2 ** tr.zoom);
      const cameraM =
        tr.cameraToCenterDistance * Math.cos((tr.pitch * Math.PI) / 180) * metresPerPx;
      const verts = wallStrip(distanceM() * perM, (cameraM + WALL_ABOVE_CAMERA_M) * perM);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(uMatrix, false, translated(matrix as ArrayLike<number>, c.x, c.y));
      gl.uniform3fv(uColor, rgb(colour()));
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, verts.length / 3);
    },
  };
  map.addLayer(layer);
}
