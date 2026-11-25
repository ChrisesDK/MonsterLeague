import { readFileSync } from 'node:fs';
import { latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { checkContent, checkI18n, content, i18n, parseContent, rawContent } from '../src/index';

describe('content', () => {
  it('parses and passes all cross-reference checks', () => {
    expect(checkContent(content)).toEqual([]);
    expect(checkI18n(content, i18n)).toEqual([]);
  });

  it('has the expected placeholder content sizes', () => {
    expect(content.typeIds).toHaveLength(7);
    // roster v2 (D167): 3 starter lines and 20 wild lines, each with 2 or 3 stages
    expect(Object.keys(content.species)).toHaveLength(55);
    expect(Object.keys(content.moves).length).toBeGreaterThanOrEqual(30);
    expect(Object.keys(content.items)).toHaveLength(9); // + Medium Tonic (D165)
    // every item has a market price (D165)
    for (const i of Object.values(content.items)) expect(i.price, i.id).toBeGreaterThan(0);
    const kinds = Object.values(content.pois).map((p) => p.kind);
    expect(kinds.filter((k) => k === 'arena')).toHaveLength(8);
    // D163: route trainers on every route (about one per 1.5 km), plus Lise by Kongens Have
    expect(kinds.filter((k) => k === 'trainer').length).toBeGreaterThanOrEqual(
      Object.keys(content.routes).length,
    );
    expect(kinds.filter((k) => k === 'restStop')).toHaveLength(24);
    // 13 hand-made trainers + generated route trainers (D163)
    expect(Object.keys(content.trainers).length).toBeGreaterThanOrEqual(13 + 50);
    expect(Object.keys(content.playerTeams)).toHaveLength(8);
    for (const s of Object.values(content.species)) expect(s.placeholder).toBe(true);
  });

  it('has at least 3 moves per type', () => {
    for (const t of content.typeIds) {
      expect(
        Object.values(content.moves).filter((m) => m.type === t).length,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('detects broken cross-references', () => {
    const broken = structuredClone(content);
    broken.species.gnistkat!.learnset[0]!.moveId = 'nope';
    broken.species.gnistkat!.evolution = { into: 'missing', level: 16 };
    delete (broken.chart.fire as Partial<Record<string, number>>).water;
    broken.trainers.leader_water!.team[0]!.speciesId = 'ghost';
    broken.trainers.leader_water!.items = { void_item: 1 };
    const errors = checkContent(broken);
    expect(errors.join('\n')).toMatch(/learnset move "nope"/);
    expect(errors.join('\n')).toMatch(/evolution target "missing"/);
    expect(errors.join('\n')).toMatch(/fire → water/);
    expect(errors.join('\n')).toMatch(/species "ghost"/);
    expect(errors.join('\n')).toMatch(/item "void_item"/);
  });

  it('detects missing i18n keys', () => {
    const errors = checkI18n(content, { en: { ...i18n.en, 'only.en': 'x' }, da: {} });
    expect(errors.some((e) => e.includes('species.gnistkat.name'))).toBe(true);
    expect(errors.some((e) => e.includes('"only.en"'))).toBe(true);
  });

  it('rejects schema-invalid content', () => {
    const bad = { ...rawContent, moves: { moves: [{ id: 'x', type: 'lava' }] } };
    expect(() => parseContent(bad)).toThrow();
  });
});

describe('arenas and player-team presets', () => {
  it('requires one leader per arena and presets one creature larger than the leader', () => {
    const broken = structuredClone(content);
    broken.trainers.leader_folk!.arena = 2;
    broken.playerTeams.arena1!.team.push({ speciesId: 'torvdue', level: 9 });
    broken.playerTeams.arena1!.items = { nope: 1 };
    broken.playerTeams.arena1!.team[0]!.speciesId = 'ghost';
    const errors = checkContent(broken).join('\n');
    expect(errors).toMatch(/arena 2 already has a leader/);
    expect(errors).toMatch(/arena 1 has no leader/);
    expect(errors).toMatch(/item "nope"/);
    expect(errors).toMatch(/species "ghost"/);
    delete broken.trainers.leader_water!.arena;
    expect(checkContent(broken).join('\n')).toMatch(/leaders need an arena/);
  });
});

describe('GDD audit checks (M1.6)', () => {
  it('rejects catch rates below 3 and levels above the Odense cap', () => {
    const species = structuredClone((rawContent.species as { species: unknown[] }).species);
    (species[0] as { catchRate: number }).catchRate = 2;
    expect(() => parseContent({ ...rawContent, species: { species } })).toThrow();
    const broken = structuredClone(content);
    broken.trainers.leader_water!.team[0]!.level = 51;
    broken.playerTeams.arena2!.team[0]!.level = 51;
    broken.spawns.push({
      species: 'ghost',
      district: 1,
      weight: 1,
      rarity: 'common',
      biomes: {},
      time: 'any',
    });
    const errors = checkContent(broken).join('\n');
    expect(errors).toMatch(/level 51 above the Odense cap 50/);
    expect(errors).toMatch(/player team arena2: level 51/);
    expect(errors).toMatch(/spawn \d+: species "ghost"/);
  });

  it('validates spawn entries', () => {
    expect(() =>
      parseContent({
        ...rawContent,
        spawns: {
          spawns: [{ species: 'torvdue', district: 9, weight: 1, biomes: {}, time: 'any' }],
        },
      }),
    ).toThrow();
  });
});

describe('field abilities (M1.7, GDD v1.2 / P1)', () => {
  it('has the six GDD abilities with badges 2–7 and learner types', () => {
    const fa = content.fieldAbilities;
    expect(Object.keys(fa)).toEqual([
      'forager',
      'angler',
      'runereader',
      'nightseer',
      'sealbreaker',
      'homing',
    ]);
    expect(Object.values(fa).map((f) => f.badge)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(fa.forager!.types).toEqual(['grove', 'folk']);
    expect(fa.homing!.types).toEqual(['storm']);
    expect(i18n.da['fieldAbility.runereader.name']).toBe('Runelæser');
    expect(i18n.en['fieldAbility.nightseer.name']).toBe('Nightseer');
  });

  it('rejects duplicate badges, unknown types and unknown spawn requirements', () => {
    const broken = structuredClone(content);
    broken.fieldAbilities.angler!.badge = 2;
    broken.spawns.push({
      species: 'torvdue',
      district: 1,
      weight: 1,
      rarity: 'rare',
      biomes: {},
      time: 'any',
      requires: 'nope',
    });
    const errors = checkContent(broken).join('\n');
    expect(errors).toMatch(/badge 2 already unlocks "forager"/);
    expect(errors).toMatch(/field ability "nope" does not exist/);
    expect(() =>
      parseContent({
        ...rawContent,
        fieldAbilities: { fieldAbilities: [{ id: 'x', badge: 2, types: ['lava'] }] },
      }),
    ).toThrow();
  });
});

describe('POIs (M2b)', () => {
  it('arenas 1–8 (junior then leader), route trainers in their level range, rest stops everywhere, all unverified', () => {
    const pois = Object.values(content.pois);
    const arenas = pois.filter((p) => p.kind === 'arena');
    expect(arenas.map((a) => a.kind === 'arena' && [a.district, a.trainers])).toEqual([
      [1, ['arena1_junior', 'leader_folk']],
      [2, ['arena2_junior', 'leader_stone']],
      [3, ['arena3_junior', 'leader_water']],
      [4, ['arena4_junior', 'leader_grove']],
      [5, ['arena5_junior', 'leader_spirit']],
      [6, ['arena6_junior', 'leader_fire']],
      [7, ['arena7_junior', 'leader_mixed']],
      [8, ['arena8_junior', 'leader_storm']],
    ]);
    // route trainers stay inside their district's band (district 1: 4–9, the starter's range)
    const range: Record<number, [number, number]> = { ...content.districtBands, 1: [4, 9] };
    for (const p of pois) {
      expect(p.verified).toBe(false);
      if (p.kind === 'trainer') {
        const t = content.trainers[p.trainer]!;
        for (const m of t.team) {
          expect(m.level).toBeGreaterThanOrEqual(range[p.district]![0]);
          expect(m.level).toBeLessThanOrEqual(range[p.district]![1]);
        }
        expect(t.reward).toBeDefined();
      }
    }
    const naesbyhoved = pois.filter((p) => p.zone === 'naesbyhoved').map((p) => p.kind);
    expect(naesbyhoved.filter((k) => k === 'arena')).toHaveLength(1);
    expect(naesbyhoved).toContain('restStop');
    expect(naesbyhoved.filter((k) => k === 'trainer').length).toBeGreaterThanOrEqual(2);
    // P22: a rest stop at every arena site and town (and at the main destinations)
    const rested = new Set(pois.filter((p) => p.kind === 'restStop').map((p) => p.zone));
    for (const z of Object.values(content.zones))
      if (z.kind === 'arena' || z.kind === 'town') expect(rested.has(z.id), z.id).toBe(true);
    // D168: every leader's team sits at the top of its district's band (arena 8 at the cap)
    for (const t of Object.values(content.trainers))
      if (t.tier === 'leader') {
        const top = Math.max(...t.team.map((m) => m.level));
        expect(top, t.id).toBeGreaterThanOrEqual(content.districtBands[t.arena!]![1] - 2);
        expect(top, t.id).toBeLessThanOrEqual(50);
      }
  });

  it('roster v2 (D167): every wild line has 2–3 stages, evolved forms fit their level', () => {
    const species = Object.values(content.species);
    const parent = (id: string) => species.find((s) => s.evolution?.into === id);
    const firsts = species.filter((s) => !parent(s.id));
    expect(firsts).toHaveLength(23); // 3 starters + 20 wild lines
    for (const f of firsts) {
      let n = 1;
      for (let s = f; s.evolution; s = content.species[s.evolution.into]!) n++;
      expect(n, f.id).toBeGreaterThanOrEqual(2);
      expect(n, f.id).toBeLessThanOrEqual(3);
    }
    // trainers never field a first stage far above the level it evolves at
    for (const t of Object.values(content.trainers))
      for (const m of t.team) {
        const evo = content.species[m.speciesId]!.evolution;
        if (evo) expect(m.level, `${t.id} ${m.speciesId}`).toBeLessThan(evo.level + 3);
      }
    // every rarity is used; very rare creatures only in destinations
    const rarities = new Set(species.map((s) => s.rarity));
    expect([...rarities].sort()).toEqual(['common', 'rare', 'uncommon', 'veryRare']);
    for (const e of content.spawns)
      if (content.species[e.species]!.rarity === 'veryRare') expect(e.destinationOnly).toBe(true);
    // some creatures only spawn in destinations (forest, field and lake zones)
    const destOnly = new Set(
      firsts
        .map((f) => f.id)
        .filter((id) => {
          const entries = content.spawns.filter((e) => e.species === id && !e.requires);
          return entries.length > 0 && entries.every((e) => e.destinationOnly);
        }),
    );
    expect(destOnly.size).toBeGreaterThanOrEqual(5);
    // every wild line spawns somewhere
    for (const f of firsts)
      if (!['gnistkat', 'aaodder', 'boegling'].includes(f.id))
        expect(
          content.spawns.some((e) => e.species === f.id),
          f.id,
        ).toBe(true);
  });

  it("each POI's own map cell counts as the POI's zone and district (region build)", () => {
    const region = JSON.parse(
      readFileSync(new URL('../region/odense/region.json', import.meta.url), 'utf8'),
    ) as { zones: string[]; cells: Record<string, number[]> };
    for (const p of Object.values(content.pois)) {
      const row = region.cells[latLngToCell(p.lat, p.lng, 10)];
      expect(row?.[0], p.id).toBe(p.district);
      expect(region.zones[row![1]!], p.id).toBe(p.zone);
    }
  });

  it('rejects broken POI references', () => {
    const broken = structuredClone(content);
    const arena = broken.pois.arena1!;
    if (arena.kind === 'arena') arena.trainers = ['leader_folk', 'arena1_junior'];
    const t = broken.pois.trainer_ole!;
    if (t.kind === 'trainer') t.trainer = 'nobody';
    const r = broken.pois.rest_library!;
    if (r.kind === 'restStop') r.restock = { nope: 1 };
    broken.trainers.route1_lise!.reward = { itemId: 'nope', count: 1 };
    const errors = checkContent(broken).join('\n');
    expect(errors).toMatch(/last trainer must be the arena 1 leader/);
    expect(errors).toMatch(/trainer "nobody" does not exist/);
    expect(errors).toMatch(/restock item "nope"/);
    expect(errors).toMatch(/reward item "nope"/);
  });
});

describe('arena sites, routes and Journal goals (M2d)', () => {
  /** Exact distance in metres from p to the path (local flat projection). */
  const toRoute = (p: [number, number], path: [number, number][]) => {
    const kx = 111_320 * Math.cos((p[1] * Math.PI) / 180);
    let best = Infinity;
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1]!, path[i]!];
      const ax = (a[0] - p[0]) * kx;
      const ay = (a[1] - p[1]) * 110_540;
      const dx = (b[0] - a[0]) * kx;
      const dy = (b[1] - a[1]) * 110_540;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return best;
  };

  it('has 8 arena sites in order, built ones linked to their arena POI', () => {
    expect(content.arenaSites.map((a) => a.arena)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(content.arenaSites.map((a) => a.poi)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `arena${n}`),
    );
  });

  it('P22: 50 routes between zones; the badge path links every arena in order', () => {
    const routes = Object.values(content.routes);
    expect(routes).toHaveLength(50);
    const main = routes.filter((r) => r.kind === 'main');
    // walking only main routes from the start reaches every arena zone
    const open = new Set(['centrum']);
    for (let grew = true; grew;) {
      grew = false;
      for (const r of main)
        if (open.has(r.from) !== open.has(r.to)) {
          open.add(open.has(r.from) ? r.to : r.from);
          grew = true;
        }
    }
    for (const a of content.arenaSites) expect(open.has(a.zone), a.zone).toBe(true);
    // no route like the old 13.6 km Route 7; most arenas have 3 or more routes in
    for (const r of routes) expect(r.lengthM, r.id).toBeLessThan(7000);
    const degree = (z: string) => routes.filter((r) => r.from === z || r.to === z).length;
    expect(content.arenaSites.filter((a) => degree(a.zone) >= 3).length).toBeGreaterThanOrEqual(5);
  });

  it('every route has a route trainer, standing on it (D163)', () => {
    const on = new Set(
      Object.values(content.pois).flatMap((p) =>
        p.kind === 'trainer' && p.route ? [p.route] : [],
      ),
    );
    for (const r of Object.keys(content.routes)) expect(on.has(r), r).toBe(true);
  });

  it('the route trainers stand on a route', () => {
    for (const p of Object.values(content.pois)) {
      if (p.kind !== 'trainer' || p.id === 'trainer_lise') continue;
      const d = Math.min(
        ...Object.values(content.routes).map((r) => toRoute([p.lng, p.lat], r.path)),
      );
      expect(d, p.id).toBeLessThan(10);
    }
  });

  it('every district has finite side goals: explore, catch a type, find the rare', () => {
    for (let d = 1; d <= 8; d++)
      expect(
        content.sideGoals.filter((g) => g.district === d).map((g) => g.kind),
        `district ${d}`,
      ).toEqual(['exploreWild', 'catchType', 'findRare']);
  });
});
