import { booleanPointInPolygon } from '@turf/turf';
import type { Feature, Polygon, Position } from 'geojson';
import { describe, expect, it } from 'vitest';
import { coastOutline, farFromShore, SHORE_REACH_M } from '../src/coast';

// A square "municipality" on land west of lng 10.010; east of it is sea. A neighbour lies north.
const square = (w: number, s: number, e: number, n: number): Feature<Polygon> => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  },
});
const SEA = 10.01;
const isWater = (p: Position) => p[0]! > SEA;
const region = square(9.98, 55.0, 10.005, 55.02); // its border stops 300 m short of the coast
const neighbour = square(9.98, 55.02, 10.03, 55.04);

describe('coast (owner request)', () => {
  const out = coastOutline(region, [neighbour], isWater);
  it('takes in the unclaimed land up to the coast', () => {
    expect(booleanPointInPolygon([10.008, 55.01], out)).toBe(true);
  });
  it('reaches about 200 m out to sea, no further', () => {
    expect(booleanPointInPolygon([SEA + 0.002, 55.01], out)).toBe(true); // ~130 m out
    expect(booleanPointInPolygon([SEA + 0.006, 55.01], out)).toBe(false); // ~380 m out
  });
  it('never into a neighbour', () => {
    expect(booleanPointInPolygon([9.99, 55.021], out)).toBe(false);
  });
  it('blocks water positions out of reach of the shore, not those by it', () => {
    const step = SHORE_REACH_M / (111_320 * Math.cos((55 * Math.PI) / 180));
    expect(farFromShore([SEA + step / 2, 55.01], isWater)).toBe(false);
    expect(farFromShore([SEA + step * 3, 55.01], isWater)).toBe(true);
    expect(farFromShore([SEA - 0.001, 55.01], isWater)).toBe(false);
  });
});
