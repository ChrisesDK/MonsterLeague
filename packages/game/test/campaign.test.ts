import { describe, expect, it } from 'vitest';
import { regions } from '@oml/data';
import {
  activeCampaign,
  arriveInZone,
  campaignDex,
  campaignSummaries,
  canSwitchCampaign,
  chooseStarter,
  frontierRoutes,
  journal,
  loadSave,
  newSave,
  SAVE_VERSION,
  switchCampaign,
  walkingRoutes,
  type SaveGame,
} from './helpers';

const svb = regions.svendborg;

function playing(): SaveGame {
  const s = chooseStarter({ ...newSave('ab'), onboarding: 'starter' }, 'gnistkat');
  return { ...s, onboarding: 'done', badges: [1, 2], coins: 120, zones: ['munkemose'] };
}

describe('campaigns per region (P27)', () => {
  it('a new save plays Odense with nothing parked', () => {
    const s = newSave('ab');
    expect(s.region).toBe('odense');
    expect(s.campaigns).toEqual({});
    expect(campaignDex(s)).toBe(regions.odense);
  });

  it('a v10 save becomes the Odense campaign, unchanged', () => {
    const { region: _r, campaigns: _c, ...v10 } = { ...playing(), version: 10 };
    const r = loadSave(v10, 'x');
    if (!r.ok) throw new Error(r.error);
    expect(r.save.version).toBe(SAVE_VERSION);
    expect(r.save.region).toBe('odense');
    expect(r.save.campaigns).toEqual({});
    expect(r.save.badges).toEqual([1, 2]);
    expect(r.save.team).toHaveLength(1);
  });

  it('entering a new region parks the campaign and starts at the starter choice', () => {
    const odense = playing();
    const s = switchCampaign(odense, 'svendborg');
    expect(s.region).toBe('svendborg');
    expect(s.onboarding).toBe('starter');
    expect(s.starter).toBeNull();
    expect(s.team).toEqual([]);
    expect(s.badges).toEqual([]);
    expect(s.coins).toBe(0);
    expect(s.zones).toEqual([]);
    // shared: seed, settings and the uid counter
    expect(s.seed).toBe(odense.seed);
    expect(s.settings).toEqual(odense.settings);
    expect(s.nextUid).toBe(odense.nextUid);
    expect(s.campaigns.odense).toEqual(activeCampaign(odense));
    expect(campaignDex(s)).toBe(svb);
    const r = loadSave(s, 'x');
    expect(r.ok).toBe(true);
  });

  it('coming back restores the campaign exactly, and keeps the other one', () => {
    const odense = playing();
    const there = { ...switchCampaign(odense, 'svendborg'), coins: 7, badges: [1] };
    const back = switchCampaign(there, 'odense');
    expect(activeCampaign(back)).toEqual(activeCampaign(odense));
    expect(back.campaigns.odense).toBeUndefined();
    expect(back.campaigns.svendborg?.coins).toBe(7);
    expect(campaignSummaries(back)).toEqual([
      { region: 'odense', started: true, badges: 2, playing: true },
      { region: 'svendborg', started: false, badges: 1, playing: false },
    ]);
  });

  it('a save that has not passed the safety note keeps that step in a new region', () => {
    expect(switchCampaign(newSave('ab'), 'svendborg').onboarding).toBe('safety');
  });

  it('waits for the battle and its choices', () => {
    const s = { ...playing(), pending: [{ kind: 'evolve' as const, uid: 'p1', into: 'x' }] };
    expect(canSwitchCampaign(s)).toBe(false);
    expect(switchCampaign(s, 'svendborg')).toBe(s);
    const same = playing();
    expect(switchCampaign(same, 'odense')).toBe(same);
  });

  it('the active region is never also parked (validated)', () => {
    const s = playing();
    const bad = { ...s, campaigns: { odense: activeCampaign(s) } };
    expect(loadSave(bad, 'x').ok).toBe(false);
  });

  it('starters belong to their region', () => {
    const s = switchCampaign(playing(), 'svendborg');
    expect(() => chooseStarter(s, 'gnistkat', svb)).toThrow(/not a starter/);
  });
});

describe('ferry islands (P27)', () => {
  const island = Object.values(svb.zones).find((z) => z.opensOnArrival)!;
  const s = switchCampaign(playing(), 'svendborg');

  it('an island opens on arrival, other zones do not', () => {
    const a = arriveInZone(s, island.id, svb);
    expect(a.zones).toContain(island.id);
    expect(arriveInZone(a, island.id, svb)).toBe(a);
    const town = Object.values(svb.zones).find((z) => !z.opensOnArrival && !z.start)!;
    expect(arriveInZone(s, town.id, svb)).toBe(s);
    expect(arriveInZone(s, null, svb)).toBe(s);
  });

  it('ferry crossings are never walking routes or frontier routes', () => {
    const ferries = Object.values(svb.routes).filter((r) => r.kind === 'ferry');
    expect(ferries.length).toBeGreaterThan(0);
    expect(walkingRoutes(svb).some((r) => r.kind === 'ferry')).toBe(false);
    expect(frontierRoutes(s, svb).some((r) => r.kind === 'ferry')).toBe(false);
    expect(journal(s, null, svb).routesTotal).toBe(Object.keys(svb.routes).length - ferries.length);
  });
});
