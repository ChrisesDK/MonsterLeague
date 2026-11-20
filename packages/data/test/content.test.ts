import { describe, expect, it } from 'vitest';
import { checkContent, checkI18n, content, i18n, parseContent, rawContent } from '../src/index';

describe('content', () => {
  it('parses and passes all cross-reference checks', () => {
    expect(checkContent(content)).toEqual([]);
    expect(checkI18n(content, i18n)).toEqual([]);
  });

  it('has the expected placeholder content sizes', () => {
    expect(content.typeIds).toHaveLength(7);
    expect(Object.keys(content.species)).toHaveLength(15);
    expect(Object.keys(content.moves).length).toBeGreaterThanOrEqual(30);
    expect(Object.keys(content.items)).toHaveLength(7);
    expect(Object.keys(content.trainers)).toHaveLength(4);
    expect(Object.keys(content.playerTeams)).toHaveLength(2);
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
    broken.spawns.push({ species: 'ghost', district: 1, weight: 1, biomes: {}, time: 'any' });
    const errors = checkContent(broken).join('\n');
    expect(errors).toMatch(/level 51 above the Odense cap 50/);
    expect(errors).toMatch(/player team arena2: level 51/);
    expect(errors).toMatch(/spawn 0: species "ghost"/);
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
