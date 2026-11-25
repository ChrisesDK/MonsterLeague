/**
 * Borders for the maps (owner feedback after P22): one clean region outline and the edges
 * between zones, each drawn exactly once.
 *
 * - The region border is the municipality border "closed" by 400 m (buffer out, then in): the
 *   OSM border follows the coast and cuts the harbour, the canal and small inlets out of the
 *   municipality, which made the water look like it lay outside Odense.
 * - Zone edges come from the H3 cells: every edge between two cells of different zones,
 *   joined into lines between the points where three zones meet, then smoothed (Chaikin) so
 *   the hexagon steps become curves. An edge between zones of different districts is a
 *   district edge. Edges on the region's outside are never included (the region border
 *   draws that line).
 */
import { buffer, simplify } from '@turf/turf';
import type { Feature, LineString, MultiPolygon, Polygon } from 'geojson';
import { directedEdgeToBoundary, getDirectedEdgeDestination, originToDirectedEdges } from 'h3-js';

export const CLOSE_M = 400;

/** The municipality border with inlets and slits up to ~2 × CLOSE_M wide filled in. */
export function closeBorder(
  border: Feature<MultiPolygon | Polygon>,
  m = CLOSE_M,
): Feature<MultiPolygon | Polygon> {
  const out = buffer(buffer(border, m, { units: 'meters' })!, -m, { units: 'meters' })!;
  const s = simplify(out, { tolerance: 0.00015, highQuality: true }) as Feature<
    MultiPolygon | Polygon
  >;
  // Keep only the outer rings: a hole would be drawn as a ring inside the region.
  const g = s.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'MultiPolygon', coordinates: polys.map((p) => [p[0]!]) },
  };
}

export type EdgeKind = 'district' | 'zone';

/**
 * Lines between zones. `zoneOf` maps every cell inside the region to its zone index;
 * `districtOf` gives a zone's district.
 */
export function zoneEdges(
  zoneOf: ReadonlyMap<string, number>,
  districtOf: (zone: number) => number,
  smoothing = 3,
): Feature<LineString, { kind: EdgeKind }>[] {
  // 1. Every shared edge once, as a pair of vertex keys.
  const key = ([lat, lng]: number[]) => `${lat!.toFixed(7)},${lng!.toFixed(7)}`;
  const pos = new Map<string, [number, number]>();
  const segs: { a: string; b: string; kind: EdgeKind }[] = [];
  for (const [cell, z] of zoneOf) {
    for (const edge of originToDirectedEdges(cell)) {
      const other = getDirectedEdgeDestination(edge);
      const oz = zoneOf.get(other);
      if (oz === undefined || oz === z || other < cell) continue;
      const [p, q] = directedEdgeToBoundary(edge) as unknown as [number[], number[]];
      const a = key(p!);
      const b = key(q!);
      pos.set(a, [p![1]!, p![0]!]);
      pos.set(b, [q![1]!, q![0]!]);
      segs.push({ a, b, kind: districtOf(z) === districtOf(oz) ? 'zone' : 'district' });
    }
  }
  // 2. Join into chains: break at vertices that don't have exactly two segments, or where
  //    the kind changes.
  const at = new Map<string, number[]>();
  segs.forEach((s, i) => {
    at.set(s.a, [...(at.get(s.a) ?? []), i]);
    at.set(s.b, [...(at.get(s.b) ?? []), i]);
  });
  const used = new Set<number>();
  const chains: { pts: string[]; kind: EdgeKind }[] = [];
  const walk = (start: string, first: number): string[] => {
    const pts = [start];
    let cur = start;
    let seg = first;
    for (;;) {
      used.add(seg);
      const s = segs[seg]!;
      const next = s.a === cur ? s.b : s.a;
      pts.push(next);
      const around = at.get(next)!;
      if (around.length !== 2) break;
      const cont = around.find((i) => i !== seg)!;
      if (used.has(cont) || segs[cont]!.kind !== s.kind) break;
      cur = next;
      seg = cont;
    }
    return pts;
  };
  // Chains that start at a junction or an end first, then the closed loops that remain.
  for (const [v, list] of at)
    if (list.length !== 2 || segs[list[0]!]!.kind !== segs[list[1]!]!.kind)
      for (const i of list) if (!used.has(i)) chains.push({ pts: walk(v, i), kind: segs[i]!.kind });
  segs.forEach((s, i) => {
    if (!used.has(i)) chains.push({ pts: walk(s.a, i), kind: s.kind });
  });
  // 3. Straighten each chain, round its corners (Chaikin), keeping its ends where they are
  //    so the lines still meet, then drop points the eye can't see (~3 m).
  return chains.map((c) => {
    const line: Feature<LineString, { kind: EdgeKind }> = {
      type: 'Feature',
      properties: { kind: c.kind },
      geometry: { type: 'LineString', coordinates: c.pts.map((k) => pos.get(k)!) },
    };
    // straighten the hexagon steps (~35 m) before rounding the corners
    const straight = simplify(line, { tolerance: 0.0004, highQuality: true });
    line.geometry.coordinates = chaikin(
      straight.geometry.coordinates as [number, number][],
      smoothing,
    );
    const thin = simplify(line, { tolerance: 0.00003, highQuality: true });
    thin.geometry.coordinates = thin.geometry.coordinates.map(([x, y]) => [
      Math.round(x! * 1e5) / 1e5,
      Math.round(y! * 1e5) / 1e5,
    ]);
    return thin;
  });
}

/** Chaikin corner cutting; the first and last points stay. */
export function chaikin(pts: [number, number][], iterations: number): [number, number][] {
  let cur = pts;
  for (let n = 0; n < iterations && cur.length > 2; n++) {
    const next: [number, number][] = [cur[0]!];
    for (let i = 0; i + 1 < cur.length; i++) {
      const [ax, ay] = cur[i]!;
      const [bx, by] = cur[i + 1]!;
      if (i > 0) next.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by]);
      if (i + 2 < cur.length) next.push([0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
    }
    next.push(cur[cur.length - 1]!);
    cur = next;
  }
  return cur;
}
