import { describe, expect, it } from 'vitest';
import type { Feature, Geometry } from 'geojson';
import { latLngToCell } from 'h3-js';
import {
  FeatureIndex,
  areaRules,
  classifyCell,
  distanceToSegmentM,
  lineRules,
  pointRules,
} from '../src/classify';
import { buildQuery } from '../src/overpass';

// A small square around a res-10 cell near Kongens Have.
const LAT = 55.3998;
const LNG = 10.3852;
const sq = (d: number, lat = LAT, lng = LNG): number[][][] => [
  [
    [lng - d, lat - d],
    [lng + d, lat - d],
    [lng + d, lat + d],
    [lng - d, lat + d],
    [lng - d, lat - d],
  ],
];
const poly = (tags: Record<string, string>, d = 0.01): Feature<Geometry> => ({
  type: 'Feature',
  properties: tags,
  geometry: { type: 'Polygon', coordinates: sq(d) },
});
const cell = latLngToCell(LAT, LNG, 10);

describe('OSM tag rules', () => {
  it('maps tags to biomes and noSpawn', () => {
    expect(areaRules({ leisure: 'park' })).toEqual([{ biome: 'park' }]);
    expect(areaRules({ natural: 'wood' })).toEqual([{ biome: 'forest' }]);
    expect(areaRules({ landuse: 'grass' })).toEqual([{ biome: 'meadow' }]);
    expect(areaRules({ landuse: 'port' })).toEqual([{ biome: 'industrial' }]);
    expect(areaRules({ natural: 'water', water: 'pond' })).toEqual([{ biome: 'water' }]);
    expect(areaRules({ amenity: 'kindergarten' })).toEqual([{ noSpawn: true }]);
    expect(areaRules({ landuse: 'cemetery' })).toEqual([{ noSpawn: true }]);
    expect(areaRules({ highway: 'footway' })).toEqual([]);
    expect(lineRules({ waterway: 'river' })).toEqual([{ biome: 'water', buffer: 15 }]);
    expect(lineRules({ waterway: 'stream' })).toEqual([{ biome: 'water', buffer: 5 }]);
    expect(lineRules({ railway: 'rail' })).toEqual([{ noSpawn: true, buffer: 10 }]);
    expect(lineRules({ highway: 'trunk_link' })).toEqual([{ noSpawn: true, buffer: 20 }]);
    expect(lineRules({ railway: 'tram' })).toEqual([]);
    expect(pointRules({ historic: 'memorial' })).toEqual([{ biome: 'historic', buffer: 20 }]);
    expect(pointRules({ amenity: 'school' })).toEqual([{ noSpawn: true, buffer: 30 }]);
  });

  it('measures point-to-segment distance in metres', () => {
    const d = distanceToSegmentM([10.385, 55.4], [10.384, 55.4001], [10.386, 55.4001]);
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(12.5); // 0.0001° lat ≈ 11 m
  });
});

describe('cell classification', () => {
  it('gives full share to a covering area and respects priority', () => {
    const index = new FeatureIndex();
    index.addFeature(poly({ landuse: 'residential' }));
    index.addFeature(poly({ leisure: 'park' }));
    const c = classifyCell(index, cell, 12);
    expect(c.shares).toEqual({ park: 100 });
    expect(c.noSpawn).toBe(false);
    expect(c.samples).toBe(49);
  });

  it('splits shares by area and buffers river lines', () => {
    const index = new FeatureIndex();
    index.addFeature(poly({ landuse: 'residential' }));
    index.addFeature({
      type: 'Feature',
      properties: { waterway: 'river' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [LNG - 0.01, LAT],
          [LNG + 0.01, LAT],
        ],
      },
    });
    const c = classifyCell(index, cell, 12);
    expect(c.shares.water).toBeGreaterThan(10);
    expect(c.shares.water).toBeLessThan(80);
    expect((c.shares.water ?? 0) + (c.shares.urban ?? 0)).toBe(100);
  });

  it('marks a cell noSpawn when any sample touches a noSpawn feature', () => {
    const index = new FeatureIndex();
    index.addFeature(poly({ leisure: 'park' }));
    index.addFeature({
      type: 'Feature',
      properties: { amenity: 'school' },
      geometry: { type: 'Point', coordinates: [LNG, LAT] },
    });
    expect(classifyCell(index, cell, 12).noSpawn).toBe(true);
  });

  it('returns no shares where nothing is mapped', () => {
    expect(classifyCell(new FeatureIndex(), cell, 12).shares).toEqual({});
  });
});

describe('Overpass query', () => {
  it('uses (south,west,north,east) and covers the needed tags', () => {
    const q = buildQuery([10.3, 55.35, 10.47, 55.43]);
    expect(q).toContain('(55.35,10.3,55.43,10.47)');
    for (const t of ['waterway', 'railway"="rail', 'kindergarten', 'historic', 'motorway'])
      expect(q).toContain(t);
  });
});
