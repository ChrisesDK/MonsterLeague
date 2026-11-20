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
    expect(Object.keys(content.items)).toHaveLength(6);
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
