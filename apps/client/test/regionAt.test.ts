import { describe, expect, it } from 'vitest';
import { regions, REGION_IDS } from '@oml/data';
import { distanceToRegionM, REGION_SLACK_M, regionAt, regionGeo } from '../src/map/regionGeo';
import { spawnRequestUrl } from '../src/map/spawnApi';
import { latLngToCell } from 'h3-js';

const ODENSE_CENTRE = { lat: 55.3998, lng: 10.3852 };
const SVENDBORG_HARBOUR = { lat: 55.06, lng: 10.615 };
const COPENHAGEN = { lat: 55.676, lng: 12.568 };
/** Faaborg-Midtfyn, between the two regions: in neither. */
const RINGE = { lat: 55.238, lng: 10.478 };

describe('the region at a position (P27)', () => {
  it('finds each region, and none outside them', () => {
    expect(regionAt(ODENSE_CENTRE, REGION_IDS)).toBe('odense');
    expect(regionAt(SVENDBORG_HARBOUR, REGION_IDS)).toBe('svendborg');
    expect(regionAt(COPENHAGEN, REGION_IDS)).toBeNull();
    expect(regionAt(RINGE, REGION_IDS)).toBeNull();
  });

  it('only among the regions asked for (playable ones)', () => {
    expect(regionAt(SVENDBORG_HARBOUR, ['odense'])).toBeNull();
  });

  it('every zone centre counts as its own region and no other', () => {
    for (const r of REGION_IDS)
      for (const z of Object.values(regions[r].zones)) {
        expect(regionAt(z, REGION_IDS), z.id).toBe(r);
        for (const other of REGION_IDS.filter((o) => o !== r))
          expect(distanceToRegionM(other, z)).toBeGreaterThan(REGION_SLACK_M * 10);
      }
  });

  it('a quay just off the coast still counts; out at sea it does not', () => {
    expect(distanceToRegionM('svendborg', SVENDBORG_HARBOUR)).toBeLessThan(REGION_SLACK_M);
    // the middle of the Great Belt, east of Svendborg
    expect(regionAt({ lat: 55.1, lng: 10.95 }, REGION_IDS)).toBeNull();
  });

  it('the ferry islands belong to Svendborg', () => {
    for (const z of Object.values(regions.svendborg.zones).filter((x) => x.opensOnArrival))
      expect(regionAt(z, REGION_IDS)).toBe('svendborg');
  });

  it("each region's geometry is its own", () => {
    const o = regionGeo('odense');
    const s = regionGeo('svendborg');
    const ids = (g: typeof o) => new Set(g.zones.features.map((f) => f.properties.id));
    for (const id of ids(s)) expect(ids(o).has(id)).toBe(false);
    expect(s.routes.features.some((f) => f.properties.kind === 'ferry')).toBe(true);
    expect(o.routes.features.every((f) => regions.odense.routes[f.properties.id])).toBe(true);
  });

  it('a spawn request in Svendborg still carries only region, cell and window', () => {
    const cell = latLngToCell(SVENDBORG_HARBOUR.lat, SVENDBORG_HARBOUR.lng, 7);
    const url = new URL(spawnRequestUrl('https://svc.test', cell, 'current', 'svendborg'));
    expect([...url.searchParams.keys()].sort()).toEqual(['cell', 'region', 'window']);
    expect(url.searchParams.get('region')).toBe('svendborg');
  });
});
