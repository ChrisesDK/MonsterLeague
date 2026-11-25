import { content } from '@oml/data';
import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_SPACING_M,
  chooseStarter,
  distanceM,
  journal,
  newSave,
  noteDistrict,
  noteRestStop,
  noteRoutes,
  noteWildWalk,
  routeCheckpoints,
  visitRestStop,
  frontierRoutes,
  isZoneOpen,
  nextCheckpoint,
  nextRouteToward,
  openZones,
  ROUTE_DONE_SHARE,
  routeProgress,
  isMainTrainer,
  type SaveGame,
} from '../src/index';

const SEED = '0123456789abcdef0123456789abcdef';
const fresh = (): SaveGame => ({
  ...chooseStarter(newSave(SEED), 'gnistkat'),
  onboarding: 'done',
});
const KONGENS_HAVE = { lat: 55.3998, lng: 10.3852 };
/** The trainers the Journal's main step counts in district d (badge-path routes, D163). */
const trainersIn = (d: number) =>
  Object.values(content.pois).flatMap((p) =>
    p.kind === 'trainer' && p.district === d && isMainTrainer(p) ? [p.trainer] : [],
  );

describe('Journal: the main goal chain (P22)', () => {
  const nearestTrainer = (from: { lat: number; lng: number }) =>
    Object.values(content.pois)
      .filter((p) => p.kind === 'trainer' && p.district === 1 && isMainTrainer(p))
      .sort((x, y) => distanceM(from, x) - distanceM(from, y))[0]!;

  it('a new player starts in the open start zone: beat its trainers first', () => {
    const j = journal(fresh(), KONGENS_HAVE);
    expect(j.current?.id).toBe('d1.trainers');
    expect(j.current?.progress).toEqual({ n: 0, of: trainersIn(1).length });
    const t = nearestTrainer(KONGENS_HAVE);
    expect(j.current?.target).toEqual({ lat: t.lat, lng: t.lng });
    expect(j.zonesOpen).toBe(1);
    expect(j.routesDone).toBe(0);
    expect(j.routesTotal).toBe(Object.keys(content.routes).length);
  });

  it('then a rest stop, then the arena; badge 1 points at the route to arena 2', () => {
    let save: SaveGame = { ...noteDistrict(fresh(), 1), defeatedTrainers: trainersIn(1) };
    expect(journal(save, KONGENS_HAVE).current?.kind).toBe('rest');
    save = visitRestStop(save, content.pois.rest_jernbanegade!, 1_800_000_000).save;
    expect(save.journal.restStops).toEqual(['rest_jernbanegade']);
    const arena = journal(save, KONGENS_HAVE).current!;
    expect(arena.kind).toBe('arena');
    expect(arena.comingSoon).toBeUndefined();
    save = { ...save, badges: [1] };
    const j = journal(save, KONGENS_HAVE);
    expect(j.current?.id).toBe('d2.route');
    expect(j.current?.zone).toBe('naesbyhoved');
    const route = content.routes[j.current!.routeId!]!;
    expect([route.from, route.to]).toContain('centrum');
    expect(j.districts.map((d) => d.district)).toEqual([1, 2]);
  });

  it('district 2: open its zone, beat its trainers, rest, arena', () => {
    const save: SaveGame = { ...fresh(), badges: [1] };
    const main = journal(save, KONGENS_HAVE).districts[1]!.main;
    expect(main.map((g) => g.kind)).toEqual(['route', 'trainers', 'rest', 'arena']);
    expect(main[0]!.done).toBe(false);
    const open = journal({ ...save, zones: ['naesbyhoved'] }, KONGENS_HAVE).districts[1]!.main;
    expect(open[0]!.done).toBe(true);
  });

  it('D168: every arena is built, so no arena goal is "coming soon"', () => {
    const save: SaveGame = { ...fresh(), badges: [1, 2], zones: ['stige'] };
    const d3 = journal(save, KONGENS_HAVE).districts.find((d) => d.district === 3)!;
    expect(d3.main.at(-1)!.kind).toBe('arena');
    expect(d3.main.at(-1)!.comingSoon).toBeUndefined();
    // with every zone open and seven badges, no district shows a "coming soon" arena
    const all = journal(
      { ...fresh(), badges: [1, 2, 3, 4, 5, 6, 7], zones: Object.keys(content.zones) },
      null,
    );
    for (const d of all.districts) expect(d.main.some((g) => g.comingSoon)).toBe(false);
  });

  it('with all 8 badges there is no current goal', () => {
    expect(journal({ ...fresh(), badges: [1, 2, 3, 4, 5, 6, 7, 8] }, null).current).toBeNull();
  });
});

describe('Journal: routes fill in and open zones (P22)', () => {
  const route = content.routes.route1!;
  const cps = routeCheckpoints(route);

  it('route 1 runs from the start zone to arena 2; checkpoints every 25 m, ends included', () => {
    expect([route.from, route.to]).toEqual(['centrum', 'naesbyhoved']);
    expect(CHECKPOINT_SPACING_M).toBe(25);
    expect(cps.length).toBeGreaterThanOrEqual(Math.floor(route.lengthM / CHECKPOINT_SPACING_M));
    expect(distanceM(cps[0]!, { lat: route.path[0]![1], lng: route.path[0]![0] })).toBe(0);
    for (let i = 1; i < cps.length - 1; i++)
      expect(distanceM(cps[i - 1]!, cps[i]!)).toBeLessThanOrEqual(CHECKPOINT_SPACING_M + 1);
  });

  it('walking fills the route; at 90 % it is finished and opens the zone it leads to', () => {
    let save: SaveGame = { ...fresh(), badges: [1] };
    expect(nextCheckpoint(save, route)).toEqual(cps[0]);
    save = noteRoutes(save, cps[0]!);
    // checkpoints are 25 m apart and reached within 30 m: the first step ticks off two
    const got = save.journal.routes.route1!;
    expect(got).toContain(0);
    expect(got.every((i) => distanceM(cps[i]!, cps[0]!) <= 30)).toBe(true);
    expect(nextCheckpoint(save, route)).toEqual(cps[got.length]);
    // unchanged position → same object (nothing to save)
    expect(noteRoutes(save, cps[0]!)).toBe(save);
    const need = Math.ceil(cps.length * ROUTE_DONE_SHARE);
    // each step also reaches the next checkpoint (25 m apart, 30 m reach)
    for (const cp of cps.slice(0, need - 2)) save = noteRoutes(save, cp);
    expect(save.journal.routes.route1).toHaveLength(need - 1);
    expect(routeProgress(save, route).done).toBe(false);
    expect(isZoneOpen(save, 'naesbyhoved')).toBe(false);
    save = noteRoutes(save, cps[need - 1]!);
    expect(routeProgress(save, route).done).toBe(true);
    expect(save.zones).toContain('naesbyhoved');
    expect(journal(save, null).routesDone).toBe(1);
  });

  it('a route walked between two closed zones opens them once one end opens', () => {
    const r = Object.values(content.routes).find(
      (x) => !content.zones[x.from]!.start && !content.zones[x.to]!.start,
    )!;
    const all = routeCheckpoints(r).map((_, i) => i);
    let save: SaveGame = {
      ...fresh(),
      journal: { ...fresh().journal, routes: { [r.id]: all } },
    };
    save = openZones(save);
    expect(save.zones).toEqual([]);
    save = openZones({ ...save, zones: [r.from] });
    expect(save.zones).toEqual([r.from, r.to].sort());
    // the next checkpoint of a route walked from its open end counts from that end
    const half: SaveGame = { ...fresh(), zones: [r.to] };
    expect(nextCheckpoint(half, r)).toEqual(routeCheckpoints(r).at(-1));
  });

  it('the next route toward a closed zone starts in an open zone', () => {
    const save = fresh();
    for (const zone of Object.keys(content.zones)) {
      if (isZoneOpen(save, zone)) {
        expect(nextRouteToward(save, zone)).toBeNull();
        continue;
      }
      const r = nextRouteToward(save, zone)!;
      expect(r, zone).toBeTruthy();
      expect(isZoneOpen(save, r.from) || isZoneOpen(save, r.to), zone).toBe(true);
    }
    expect(frontierRoutes(save).every((r) => r.from === 'centrum' || r.to === 'centrum')).toBe(
      true,
    );
  });
});

describe('Journal: side goals', () => {
  it('explore: metres in wild areas, capped at the goal', () => {
    let save = fresh();
    save = noteWildWalk(save, 4, 120);
    save = noteWildWalk(save, 4, 250);
    expect(save.journal.wildMetres['4']).toBe(300);
    expect(noteWildWalk(save, 4, 10)).toBe(save);
    const g = journal({ ...save, badges: [1, 2, 3] }, null)
      .districts.find((d) => d.district === 4)!
      .side.find((x) => x.kind === 'exploreWild')!;
    expect(g.done).toBe(true);
    expect(g.progress).toEqual({ n: 300, of: 300 });
  });

  it('catch a type and meet the rare creature in the district', () => {
    const save: SaveGame = {
      ...fresh(),
      badges: [1],
      caught: { kampetrold: [2] },
      seen: { kampetrold: [2] },
    };
    const side = journal(save, null).districts[1]!.side;
    expect(side.map((g) => [g.kind, g.done])).toEqual([
      ['exploreWild', false],
      ['catchType', true], // Kampetrold is Stone
      ['findRare', true],
    ]);
  });

  it('locked districts only appear once the player has walked into them', () => {
    const save = noteDistrict(fresh(), 8);
    const d8 = journal(save, null).districts.find((d) => d.district === 8)!;
    expect(d8.main).toEqual([]);
    expect(d8.side).toHaveLength(3);
  });

  it('records are idempotent', () => {
    const s = noteRestStop(noteDistrict(fresh(), 1), 'rest_library');
    expect(noteDistrict(s, 1)).toBe(s);
    expect(noteRestStop(s, 'rest_library')).toBe(s);
    expect(noteDistrict(s, null)).toBe(s);
  });
});
