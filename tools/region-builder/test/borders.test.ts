import { area, polygon } from '@turf/turf';
import { gridDisk, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { chaikin, closeBorder, zoneEdges } from '../src/borders';

describe('borders (D162)', () => {
  it('Chaikin smoothing keeps both ends and adds corner points', () => {
    const pts: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    const out = chaikin(pts, 2);
    expect(out[0]).toEqual([0, 0]);
    expect(out.at(-1)).toEqual([1, 1]);
    expect(out.length).toBeGreaterThan(pts.length);
  });

  it('closing a border fills a narrow inlet and leaves no holes', () => {
    // a 2 × 2 km square with a 100 m wide, 1 km deep slit (like the canal)
    const x = (m: number) => 10.3 + m / 63_300;
    const y = (m: number) => 55.4 + m / 111_000;
    const slit = polygon([
      [
        [x(0), y(0)],
        [x(950), y(0)],
        [x(950), y(1000)],
        [x(1050), y(1000)],
        [x(1050), y(0)],
        [x(2000), y(0)],
        [x(2000), y(2000)],
        [x(0), y(2000)],
        [x(0), y(0)],
      ],
    ]);
    const closed = closeBorder(slit, 400);
    expect(area(closed)).toBeGreaterThan(area(slit) + 0.08e6);
    const g = closed.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const p of polys) expect(p).toHaveLength(1);
  });

  it('every edge between two zones once; district edges marked; no edges on the outside', () => {
    // a disk of cells split into two zones (west, east) of different districts
    const centre = latLngToCell(55.4, 10.38, 10);
    const zoneOf = new Map<string, number>();
    for (const c of gridDisk(centre, 4)) zoneOf.set(c, c < centre ? 0 : 1);
    const lines = zoneEdges(zoneOf, (z) => (z === 0 ? 1 : 2), 0);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l.properties.kind).toBe('district');
    const same = zoneEdges(zoneOf, () => 1, 0);
    for (const l of same) expect(l.properties.kind).toBe('zone');
    // one zone only: no edges at all (the outline is the region border's job)
    const one = new Map([...zoneOf.keys()].map((c) => [c, 0]));
    expect(zoneEdges(one, () => 1)).toEqual([]);
  });
});
