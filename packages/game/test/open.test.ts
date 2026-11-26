import { regions, type RegionFile } from '@oml/data';
import { decodeRegion } from '@oml/spawn';
import { describe, expect, it } from 'vitest';
import { addCreatureForTest } from './helpers';
import {
  ARENA_MIN_TEAM,
  arenaReady,
  baseForm,
  challengeTier,
  chooseStarter,
  FIND_EVERY,
  fieldAbilitiesUnlocked,
  formAtLevel,
  isZoneOpen,
  journal,
  marketStock,
  newSave,
  noteRoutesWithFinds,
  routeBonusSpawns,
  routeCheckpoints,
  routeFind,
  scaledTeam,
  spawnLevel,
  startTrainerBattle,
  trainerStatus,
  type SaveGame,
} from '../src/index';
import regionFile from '../../data/region/odense/region.json';

/** P28: Odense is an open region. */
const dex = regions.odense;
const region = decodeRegion(regionFile as unknown as RegionFile);
const SEED = '0123456789abcdef0123456789abcdef';
const fresh = (): SaveGame => ({
  ...chooseStarter(newSave(SEED), 'gnistkat'),
  onboarding: 'done',
});
const badges = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('P28: an open region', () => {
  it('Odense is open: every zone, arena and trainer takes the player from the start', () => {
    expect(dex.open).toBe(true);
    const save = fresh();
    for (const z of Object.keys(dex.zones)) expect(isZoneOpen(save, z)).toBe(true);
    for (let a = 1; a <= 8; a++) expect(arenaReady(save, a)).toBe(true);
    // the owner: never the starter alone; an arena wants ARENA_MIN_TEAM creatures
    expect(trainerStatus(save, dex.pois.arena5!)).toEqual({
      kind: 'smallTeam',
      need: ARENA_MIN_TEAM,
    });
    const team = addCreatureForTest(addCreatureForTest(save, 'torvdue', 5), 'mosbille', 5);
    expect(trainerStatus(team, dex.pois.arena5!)).toEqual({
      kind: 'ready',
      trainerId: 'arena5_junior',
    });
    expect(trainerStatus(save, dex.pois.trainer_r3b!)?.kind).toBe('ready');
  });

  it('leaders bring more of their roster at more badges, the strongest last', () => {
    const leader = dex.trainers.leader_water!;
    let prev = 0;
    for (let tier = 0; tier <= 7; tier++) {
      const s = scaledTeam(leader, badges(tier), dex);
      expect(s.tier).toBe(tier);
      expect(s.team).toHaveLength(leader.tiers![tier]!.size);
      const levels = s.team.map((m) => m.level);
      expect(Math.max(...levels)).toBe(leader.tiers![tier]!.level);
      expect(levels[levels.length - 1]).toBe(Math.max(...levels));
      expect(s.team.length).toBeGreaterThanOrEqual(prev);
      prev = s.team.length;
      for (const m of s.team) expect(m.speciesId).toBe(formAtLevel(m.speciesId, m.level, dex));
    }
    expect(challengeTier(badges(8))).toBe(7);
  });

  it('a low tier shows first stages; coverage moves are known', () => {
    expect(formAtLevel('havodder', 10, dex)).toBe('aaodder');
    expect(formAtLevel('aaodder', 40, dex)).toBe('havodder');
    expect(baseForm('havodder', dex)).toBe('aaodder');
    const leader = dex.trainers.leader_water!;
    const withCoverage = leader.team.findIndex((m) => m.coverage);
    const tier = leader.tiers!.findIndex((t) => t.size > withCoverage);
    const s = scaledTeam(leader, badges(tier), dex);
    expect(s.team.some((m) => m.moves?.includes(leader.team[withCoverage]!.coverage!))).toBe(true);
  });

  it('route trainers move with the player band: below their district early, above it late', () => {
    const t = dex.trainers.route3_b!;
    const at = (n: number) => scaledTeam(t, badges(n), dex).team.map((m) => m.level);
    const designed = t.team.map((m) => m.level);
    expect(Math.max(...at(0))).toBeLessThan(Math.max(...designed));
    expect(at(2)).toEqual(designed); // district 3 = the band for 2 badges
    expect(Math.max(...at(7))).toBeGreaterThan(Math.max(...designed));
  });

  it('a trainer battle uses the scaled team and pays by it', () => {
    const save = startTrainerBattle(fresh(), 'arena5', 'leader_spirit', 3);
    const team = save.battle!.state.sides[1].team;
    expect(team).toHaveLength(dex.trainers.leader_spirit!.tiers![0]!.size);
    expect(Math.max(...team.map((c) => c.level))).toBe(
      dex.trainers.leader_spirit!.tiers![0]!.level,
    );
  });

  it('field abilities come from their arenas, in any order', () => {
    const save = fresh();
    expect(fieldAbilitiesUnlocked({ ...save, badges: [3] })).toEqual(['angler']);
    expect(fieldAbilitiesUnlocked({ ...save, badges: [4] })).toEqual(['forager']);
    expect(fieldAbilitiesUnlocked({ ...save, badges: [6, 7] })).toEqual([]);
  });

  it('rare creatures use the player band; markets count badges', () => {
    const bands = dex.districtBands;
    const rare = { rarity: 'rare' as const, levelRoll: 0, district: 8 };
    expect(spawnLevel(rare, [], bands, true)).toBe(bands[1]![0]);
    expect(spawnLevel(rare, [], bands, false)).toBe(bands[8]![0]);
    expect(marketStock({ badges: [7, 8] }, dex)).toContain('good_charm');
    expect(marketStock({ badges: [2] }, dex)).not.toContain('good_charm');
  });

  it('the Journal suggests the nearest arena not won, with no route step', () => {
    const save = fresh();
    const near5 = { lat: dex.arenaSites[4]!.lat, lng: dex.arenaSites[4]!.lng };
    const j = journal(save, near5);
    expect(j.current?.district).toBe(5);
    expect(j.districts.flatMap((d) => d.main).some((g) => g.kind === 'route')).toBe(false);
    expect(journal({ ...save, badges: [5] }, near5).current?.district).not.toBe(5);
  });
});

describe('P28: walking routes pays off', () => {
  const route = dex.routes.route1!;
  const cps = routeCheckpoints(route);

  it('every FIND_EVERY-th checkpoint is a find, fixed per player and spot', () => {
    const save = fresh();
    expect(routeFind(save, 'route1', 0, dex)).toBeNull();
    const f = routeFind(save, 'route1', FIND_EVERY - 1, dex)!;
    expect(f).toEqual(routeFind(save, 'route1', FIND_EVERY - 1, dex));
    expect(f.coins > 0 || f.itemId !== null).toBe(true);
    const finds = Array.from({ length: 300 }, (_, k) =>
      routeFind({ ...save, seed: `s${k}` }, 'route1', FIND_EVERY - 1, dex),
    );
    const items = finds.filter((x) => x?.itemId).length;
    expect(items).toBeGreaterThan(70);
    expect(items).toBeLessThan(130);
  });

  it('walking a route adds its finds to the save once', () => {
    let save = fresh();
    const coins = save.coins;
    let all: ReturnType<typeof noteRoutesWithFinds>['finds'] = [];
    for (const cp of cps) {
      const r = noteRoutesWithFinds(save, cp);
      save = r.save;
      all = [...all, ...r.finds];
    }
    // route 1 crosses other routes too; its own finds are one per FIND_EVERY checkpoints
    expect(all.filter((f) => f.routeId === 'route1').length).toBe(
      Math.floor(cps.length / FIND_EVERY),
    );
    expect(save.coins - coins).toBe(all.reduce((a, f) => a + f.coins, 0));
    // walked again: nothing new
    expect(noteRoutesWithFinds(save, cps[FIND_EVERY - 1]!).finds).toEqual([]);
  });

  it('a finished route has the player’s own extra creatures, with their own ids', () => {
    let save = fresh();
    const mid = cps[Math.floor(cps.length / 2)]!;
    const windows = Array.from({ length: 40 }, (_, i) => 1_900_000 + i);
    expect(windows.flatMap((w) => routeBonusSpawns(save, region, w, mid))).toEqual([]);
    for (const cp of cps) save = noteRoutesWithFinds(save, cp).save;
    const extra = windows.flatMap((w) => routeBonusSpawns(save, region, w, mid));
    expect(extra.length).toBeGreaterThan(0);
    expect(new Set(extra.map((s) => s.id)).size).toBe(extra.length);
    const other = windows.flatMap((w) => routeBonusSpawns({ ...save, seed: 'x' }, region, w, mid));
    expect(other.map((s) => s.id)).not.toEqual(extra.map((s) => s.id));
  });
});
