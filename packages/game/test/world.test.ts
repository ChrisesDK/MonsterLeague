import { content, type RegionFile } from '@oml/data';
import { decodeRegion, isBlocked } from '@oml/spawn';
import { Rng, seedRng } from '@oml/engine';
import { cellToChildren, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import {
  distanceM,
  guideHints,
  onboardingTargets,
  placeTutorial,
  TUTORIAL_MAX_M,
  TUTORIAL_MIN_M,
} from '../src/index';
import regionFile from '../../data/region/region.odense.json';

const region = decodeRegion(regionFile as unknown as RegionFile);

describe('tutorial creature placement', () => {
  it('lands 100–200 m away on a spawnable, unblocked spot', () => {
    // Odense station (lots of no-spawn rail around it), Kongens Have and a residential street
    const starts = [
      { lat: 55.4017, lng: 10.3866 },
      { lat: 55.3998, lng: 10.3852 },
      { lat: 55.3905, lng: 10.4012 },
    ];
    for (const from of starts) {
      for (let seed = 1; seed <= 15; seed++) {
        const rng = new Rng(seedRng(seed));
        const p = placeTutorial(from, region, () => rng.next());
        const d = distanceM(from, p);
        expect(d).toBeGreaterThanOrEqual(TUTORIAL_MIN_M);
        expect(d).toBeLessThanOrEqual(TUTORIAL_MAX_M);
        const cell = region.cells.get(latLngToCell(p.lat, p.lng, 10))!;
        expect(cell).toBeDefined();
        expect(cell.noSpawn).toBe(false);
        const child = latLngToCell(p.lat, p.lng, 12);
        const i = cellToChildren(cell.id, 12).indexOf(child);
        if (i >= 0) expect(isBlocked(cell.blockedMask, i)).toBe(false);
      }
    }
  });

  it('works outside the region without checks', () => {
    const from = { lat: 56.15, lng: 10.2 };
    const p = placeTutorial(from, region, () => 0.5);
    const d = distanceM(from, p);
    expect(d).toBeGreaterThanOrEqual(TUTORIAL_MIN_M);
    expect(d).toBeLessThanOrEqual(TUTORIAL_MAX_M);
  });
});

describe('onboarding targets', () => {
  it('points to the nearest district-1 rest stop and trainer; in district 1 only the rest stop', () => {
    const far = { lat: 55.37, lng: 10.43 };
    const t = onboardingTargets(far, 5, []);
    expect(t.restStop?.poi.kind).toBe('restStop');
    expect(t.trainer?.poi.kind).toBe('trainer');
    expect(t.trainer!.distance).toBeGreaterThan(1000);
    const inside = onboardingTargets({ lat: 55.3998, lng: 10.3852 }, 1, []);
    expect(inside.trainer).toBeNull();
    expect(inside.restStop!.poi.id).toBe('rest_jernbanegade');
    const beaten = Object.values(content.pois)
      .filter((p) => p.kind === 'trainer')
      .map((p) => (p.kind === 'trainer' ? p.trainer : ''));
    expect(onboardingTargets(far, 5, beaten).trainer).toBeNull();
  });
});

describe('field guide hints', () => {
  it('names the top biomes, time and required ability', () => {
    const hints = guideHints('mosbille');
    expect(hints.length).toBeGreaterThanOrEqual(1);
    expect(hints.some((h) => h.requires === 'forager')).toBe(true);
    for (const h of hints) expect(h.biomes.length).toBeGreaterThan(0);
    expect(guideHints('gnistkat')).toEqual([]);
  });
});
