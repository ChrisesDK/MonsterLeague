import { content } from '@oml/data';
import { newSave, routeCheckpoints, type SaveGame } from '@oml/game';
import { describe, expect, it } from 'vitest';
import { walkedGeo } from '../src/map/layers';
import { routePercent } from '../src/game/goalText';

/** P22: a route's walked part is drawn solid between reached neighbouring checkpoints. */
describe('route progress on the map', () => {
  const route = content.routes.route1!;
  const cps = routeCheckpoints(route);
  const withRoute = (got: number[]): SaveGame => {
    const s = newSave('0123456789abcdef0123456789abcdef');
    return { ...s, journal: { ...s.journal, routes: { [route.id]: got } } };
  };

  it('nothing walked → nothing drawn; one checkpoint alone draws no line', () => {
    expect(walkedGeo(newSave('ab')).features).toEqual([]);
    expect(walkedGeo(withRoute([3])).features).toEqual([]);
  });

  it('draws one line per unbroken stretch of reached checkpoints', () => {
    const fc = walkedGeo(withRoute([0, 1, 2, 5, 6]));
    expect(fc.features).toHaveLength(1);
    const g = fc.features[0]!.geometry as GeoJSON.MultiLineString;
    expect(g.coordinates).toHaveLength(2);
    expect(g.coordinates[0]).toHaveLength(3);
    expect(g.coordinates[1]).toHaveLength(2);
    expect(g.coordinates[0]![0]).toEqual([cps[0]!.lng, cps[0]!.lat]);
  });

  it('the progress bar reaches 100 % at 90 % of the checkpoints', () => {
    expect(routePercent(0, cps.length)).toBe(0);
    expect(routePercent(Math.ceil(cps.length * 0.9), cps.length)).toBe(100);
    expect(routePercent(cps.length, cps.length)).toBe(100);
  });
});
