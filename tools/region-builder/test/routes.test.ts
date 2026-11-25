import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLAG, wildFlags } from '../src/config';
import {
  distM,
  edgeFactor,
  routeMetrics,
  samplePath,
  segmentDistM,
  simplify,
  type LngLat,
  ROUTES,
} from '../src/route-lib';

describe('wild areas (M2d)', () => {
  it('a cell is wild when park, forest, meadow and water cover at least half of it', () => {
    expect(wildFlags({ park: 30, meadow: 20, urban: 50 })).toBe(FLAG.wild);
    expect(wildFlags({ park: 30, urban: 70 })).toBe(0);
    expect(wildFlags({ water: 40, forest: 20 })).toBe(FLAG.wild | FLAG.waterEdge);
    expect(wildFlags({ water: 20, park: 60 })).toBe(FLAG.wild);
    expect(wildFlags({})).toBe(0);
  });
});

describe('route search costs', () => {
  it('prefers footpaths, avoids busy roads and steps, and never uses motorways or railways', () => {
    expect(edgeFactor({ highway: 'footway' })).toBe(1);
    expect(edgeFactor({ highway: 'path' })).toBe(1);
    expect(edgeFactor({ highway: 'residential' })).toBeGreaterThan(1);
    expect(edgeFactor({ highway: 'primary' })!).toBeGreaterThan(
      edgeFactor({ highway: 'residential' })!,
    );
    expect(edgeFactor({ highway: 'steps' })!).toBeGreaterThan(3);
    expect(edgeFactor({ highway: 'motorway' })).toBeNull();
    expect(edgeFactor({ highway: 'trunk_link' })).toBeNull();
    expect(edgeFactor({ highway: 'footway', railway: 'platform' })).toBeNull();
    expect(edgeFactor({ highway: 'footway', foot: 'no' })).toBeNull();
    expect(edgeFactor({ highway: 'service', access: 'private' })).toBeNull();
    expect(edgeFactor({ highway: 'service', access: 'private', foot: 'yes' })).not.toBeNull();
  });
});

describe('route geometry helpers', () => {
  const a: LngLat = [10.38, 55.39];
  const b: LngLat = [10.39, 55.39];
  it('measures distances in metres', () => {
    expect(distM(a, b)).toBeGreaterThan(620);
    expect(distM(a, b)).toBeLessThan(640);
    expect(segmentDistM([10.385, 55.3901], a, b)).toBeCloseTo(11.05, 0);
  });
  it('samples a path every step and simplifies straight runs away', () => {
    const pts = samplePath([a, b], 10);
    expect(pts.length).toBe(65);
    expect(simplify(pts, 1)).toEqual([a, b]);
    const bent: LngLat[] = [a, [10.385, 55.392], b];
    expect(simplify(bent, 1)).toHaveLength(3);
  });
  it('computes length and wild share', () => {
    const m = routeMetrics([a, b], (p) => ({
      district: p[0] < 10.385 ? 1 : 2,
      flags: p[0] < 10.385 ? FLAG.wild : 0,
    }));
    expect(m.lengthM).toBeCloseTo(distM(a, b));
    expect(m.wildShare).toBeGreaterThan(0.45);
    expect(m.wildShare).toBeLessThan(0.55);
    expect([...m.districts].sort()).toEqual([1, 2]);
  });
});

describe('routes.odense.json (P22)', () => {
  const routes = JSON.parse(
    readFileSync(
      new URL('../../../packages/data/content/routes.odense.json', import.meta.url),
      'utf8',
    ),
  ).routes as { number: number; from: string; to: string; kind: string; lengthM: number }[];
  it('has every route of the route list, numbered in order, badge path first', () => {
    expect(routes.map((r) => [r.number, r.from, r.to, r.kind])).toEqual(
      ROUTES.map((d) => [d.number, d.from, d.to, d.kind]),
    );
    const kinds = routes.map((r) => r.kind);
    expect(kinds.lastIndexOf('main')).toBeLessThan(kinds.indexOf('alt'));
  });

  it('keeps every route a walk of reasonable length (none like the old 13.6 km Route 7)', () => {
    for (const r of routes) {
      expect(r.lengthM, `route ${r.number}`).toBeGreaterThan(300);
      expect(r.lengthM, `route ${r.number}`).toBeLessThan(8000);
    }
  });
});
