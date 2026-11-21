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
  routeInto,
  visitRestStop,
  type SaveGame,
} from '../src/index';

const SEED = '0123456789abcdef0123456789abcdef';
const fresh = (): SaveGame => ({
  ...chooseStarter(newSave(SEED), 'gnistkat'),
  onboarding: 'done',
});
const KONGENS_HAVE = { lat: 55.3998, lng: 10.3852 };
const HARBOUR = { lat: 55.412, lng: 10.388 };
const trainersIn = (d: number) =>
  Object.values(content.pois).flatMap((p) =>
    p.kind === 'trainer' && p.district === d ? [p.trainer] : [],
  );

describe('Journal: the main goal chain (M2d)', () => {
  it('a new player outside district 1 gets one goal: reach district 1', () => {
    const j = journal(fresh(), HARBOUR);
    expect(j.current?.kind).toBe('reach');
    expect(j.current?.district).toBe(1);
    expect(j.current?.target).toEqual({ lat: 55.39978, lng: 10.38522 });
  });

  it('in district 1 the next goal is its trainers, pointing at the nearest unbeaten one', () => {
    const save = noteDistrict(fresh(), 1);
    const j = journal(save, KONGENS_HAVE);
    expect(j.current?.id).toBe('d1.trainers');
    expect(j.current?.progress).toEqual({ n: 0, of: trainersIn(1).length });
    const lise = content.pois.trainer_lise!;
    expect(j.current?.target).toEqual({ lat: lise.lat, lng: lise.lng });
  });

  it('then a rest stop, then the arena; badge 1 moves on to district 2', () => {
    let save: SaveGame = {
      ...noteDistrict(fresh(), 1),
      defeatedTrainers: trainersIn(1),
    };
    expect(journal(save, KONGENS_HAVE).current?.kind).toBe('rest');
    save = visitRestStop(save, content.pois.rest_jernbanegade!, 1_800_000_000).save;
    expect(save.journal.restStops).toEqual(['rest_jernbanegade']);
    const arena = journal(save, KONGENS_HAVE).current!;
    expect(arena.kind).toBe('arena');
    expect(arena.comingSoon).toBeUndefined();
    save = { ...save, badges: [1] };
    const j = journal(save, KONGENS_HAVE);
    expect(j.current?.id).toBe('d2.reach');
    expect(j.districts.map((d) => d.district)).toEqual([1, 2]);
  });

  it('district 2: reach it, walk Route 1, beat its 2 trainers, rest, arena', () => {
    const save: SaveGame = { ...fresh(), badges: [1] };
    const main = journal(save, KONGENS_HAVE).districts[1]!.main;
    expect(main.map((g) => g.kind)).toEqual(['reach', 'route', 'trainers', 'rest', 'arena']);
    expect(main[1]!.routeId).toBe('route1');
    expect(main[2]!.progress).toEqual({ n: 0, of: 2 });
  });

  it('an arena that is not built yet is "coming soon"', () => {
    const save: SaveGame = { ...noteDistrict(fresh(), 3), badges: [1, 2] };
    const d3 = journal(save, KONGENS_HAVE).districts.find((d) => d.district === 3)!;
    expect(d3.main.map((g) => g.kind)).toEqual(['reach', 'route', 'arena']);
    expect(d3.main.at(-1)!.comingSoon).toBe(true);
  });

  it('with all 8 badges there is no current goal', () => {
    expect(journal({ ...fresh(), badges: [1, 2, 3, 4, 5, 6, 7, 8] }, null).current).toBeNull();
  });
});

describe('Journal: route walking', () => {
  const route = routeInto(2)!;
  const cps = routeCheckpoints(route);

  it('checkpoints are spaced 100 m along the route, ends included', () => {
    expect(cps.length).toBeGreaterThanOrEqual(Math.floor(route.lengthM / CHECKPOINT_SPACING_M));
    expect(distanceM(cps[0]!, { lat: route.path[0]![1], lng: route.path[0]![0] })).toBe(0);
    for (let i = 1; i < cps.length - 1; i++)
      expect(distanceM(cps[i - 1]!, cps[i]!)).toBeLessThanOrEqual(CHECKPOINT_SPACING_M + 1);
  });

  it('walking the route ticks checkpoints off; 80 % completes the goal', () => {
    let save: SaveGame = { ...fresh(), badges: [1] };
    const goal = () => journal(save, null).districts[1]!.main.find((g) => g.kind === 'route')!;
    expect(goal().target).toEqual(cps[0]);
    save = noteRoutes(save, cps[0]!);
    expect(save.journal.routes.route1).toEqual([0]);
    expect(goal().target).toEqual(cps[1]);
    // unchanged position → same object (nothing to save)
    expect(noteRoutes(save, cps[0]!)).toBe(save);
    for (const cp of cps.slice(0, Math.ceil(cps.length * 0.8))) save = noteRoutes(save, cp);
    expect(goal().done).toBe(true);
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
