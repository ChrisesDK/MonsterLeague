import { describe, expect, it } from 'vitest';
import {
  chooseStarter,
  loadSave,
  migrations,
  newSave,
  pruneSave,
  SAVE_VERSION,
  SaveSchema,
  startWildBattle,
  isDistrictUnlocked,
} from '../src/index';

const SEED = '0123456789abcdef0123456789abcdef';

describe('save versions and migrations', () => {
  it('a new save validates and round-trips through JSON', () => {
    const save = chooseStarter(newSave(SEED), 'gnistkat');
    const r = loadSave(JSON.parse(JSON.stringify(save)), 'other');
    expect(r).toEqual({ ok: true, save, migrated: false });
  });

  it('has one migration per older version', () => {
    for (let v = 0; v < SAVE_VERSION; v++) expect(typeof migrations[v]).toBe('function');
  });

  it('v0 (M2a localStorage) → current keeps used spawns and drops the dev battle', () => {
    const r = loadSave(
      { usedSpawns: { abc: 2_000_000_000, bad: 'x' }, battle: { spawnId: 'abc' } },
      SEED,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migrated).toBe(true);
    expect(r.save.version).toBe(SAVE_VERSION);
    expect(r.save.seed).toBe(SEED);
    expect(r.save.usedSpawns).toEqual({ abc: 2_000_000_000 });
    expect(r.save.battle).toBeNull();
    expect(r.save.onboarding).toBe('safety');
    expect(SaveSchema.safeParse(r.save).success).toBe(true);
  });

  it('v1 → v2 (GDD v1.7) renumbers districts in the field guide and an active wild battle', () => {
    const v2 = chooseStarter(newSave(SEED), 'gnistkat');
    const v1 = {
      ...v2,
      version: 1,
      badges: [1],
      seen: { torvdue: [1, 2], brokrabbe: [4], kulingmaage: [5] },
      caught: { grimaelling: [2] },
      battle: {
        kind: 'wild',
        spawnId: 'x',
        expiresAt: 2e9,
        district: 2,
        state: startWildBattle(
          v2,
          { id: 'x', speciesId: 'torvdue', level: 4, expiresAt: 2e9, district: 2 },
          1,
        ).battle!.state,
      },
    };
    const r = loadSave(JSON.parse(JSON.stringify(v1)), 'other');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migrated).toBe(true);
    expect(r.save.version).toBe(SAVE_VERSION);
    // old 2 (Munkemose) → 4, old 4 (cathedral) → 2, old 5 (harbour) → 8
    expect(r.save.seen).toEqual({ torvdue: [1, 4], brokrabbe: [2], kulingmaage: [8] });
    expect(r.save.caught).toEqual({ grimaelling: [4] });
    expect(r.save.battle?.kind === 'wild' && r.save.battle.district).toBe(4);
    // badge 1 is unchanged and now opens the cathedral district (2)
    expect(r.save.badges).toEqual([1]);
    expect(isDistrictUnlocked(r.save.badges, 2)).toBe(true);
    expect(isDistrictUnlocked(r.save.badges, 3)).toBe(false);
  });

  it('a v0 save migrates through every version', () => {
    const r = loadSave({ usedSpawns: { a: 2e9 } }, SEED);
    expect(r.ok && r.save.version).toBe(SAVE_VERSION);
  });

  it('v2 → v3 (M2d) adds Journal progress; rest stops used for a restock count as visited', () => {
    const cur = chooseStarter(newSave(SEED), 'gnistkat');
    const { journal: _j, faintedSince: _f, ...rest } = cur;
    const v2 = { ...rest, version: 2, lastRestock: { rest_library: 1_700_000_000 } };
    const r = loadSave(JSON.parse(JSON.stringify(v2)), 'other');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migrated).toBe(true);
    expect(r.save.version).toBe(SAVE_VERSION);
    expect(r.save.faintedSince).toEqual({});
    expect(r.save.journal).toEqual({
      reached: [],
      routes: {},
      wildMetres: {},
      restStops: ['rest_library'],
    });
  });

  it('v4 → v5 adds the 3D buildings setting, off', () => {
    const cur = chooseStarter(newSave(SEED), 'gnistkat');
    const { buildings3d: _b, fogDistance: _f, ...settings } = cur.settings;
    const v4 = { ...cur, version: 4, settings };
    const r = loadSave(JSON.parse(JSON.stringify(v4)), 'other');
    expect(r.ok && r.save.settings.buildings3d).toBe(false);
    expect(r.ok && r.save.version).toBe(SAVE_VERSION);
  });

  it('v5 → v6 adds the fog distance setting (2,000 m, then limited to 1,200 m by v7)', () => {
    const cur = chooseStarter(newSave(SEED), 'gnistkat');
    const { fogDistance: _f, ...settings } = cur.settings;
    const v5 = { ...cur, version: 5, settings };
    const v6 = migrations[5]!(JSON.parse(JSON.stringify(v5)), 'other') as {
      settings: { fogDistance: number };
    };
    expect(v6.settings.fogDistance).toBe(2000);
    const r = loadSave(JSON.parse(JSON.stringify(v5)), 'other');
    expect(r.ok && r.save.settings.fogDistance).toBe(1200);
    expect(r.ok && r.save.version).toBe(SAVE_VERSION);
  });

  it('v7 → v8 adds the Vibration setting: off only if reduce motion was on', () => {
    const cur = chooseStarter(newSave(SEED), 'gnistkat');
    const { vibration: _v, ...settings } = cur.settings;
    for (const reduceMotion of [false, true]) {
      const v7 = { ...cur, version: 7, settings: { ...settings, reduceMotion } };
      const r = loadSave(JSON.parse(JSON.stringify(v7)), 'other');
      expect(r.ok && r.save.settings.vibration).toBe(!reduceMotion);
      expect(r.ok && r.save.settings.reduceMotion).toBe(reduceMotion);
      expect(r.ok && r.save.version).toBe(SAVE_VERSION);
    }
  });

  it('v6 → v7 limits the fog to 1,200 m and keeps nearer settings', () => {
    const cur = chooseStarter(newSave(SEED), 'gnistkat');
    for (const [d, want] of [
      [2000, 1200],
      [1500, 1200],
      [1100, 1100],
      [1000, 1000],
    ] as const) {
      const v6 = { ...cur, version: 6, settings: { ...cur.settings, fogDistance: d } };
      const r = loadSave(JSON.parse(JSON.stringify(v6)), 'other');
      expect(r.ok && r.save.settings.fogDistance, `from ${d}`).toBe(want);
    }
  });

  it('the fog distance stays within 800–1,400 m', () => {
    const cur = chooseStarter(newSave(SEED), 'gnistkat');
    for (const [d, ok] of [
      [799, false],
      [800, true],
      [1200, true],
      [1400, true],
      [1401, false],
    ] as const)
      expect(
        SaveSchema.safeParse({ ...cur, settings: { ...cur.settings, fogDistance: d } }).success,
      ).toBe(ok);
  });

  it('reports corrupt or newer saves instead of throwing', () => {
    expect(loadSave(null, SEED).ok).toBe(false);
    expect(loadSave('{', SEED).ok).toBe(false);
    expect(loadSave([1, 2], SEED).ok).toBe(false);
    expect(loadSave({ version: 99 }, SEED).ok).toBe(false);
    const save = newSave(SEED) as unknown as Record<string, unknown>;
    expect(loadSave({ ...save, team: 'nope' }, SEED).ok).toBe(false);
    expect(loadSave({ ...save, extra: 1 }, SEED).ok).toBe(false);
  });

  it('prunes expired used spawns', () => {
    const save = { ...newSave(SEED), usedSpawns: { a: 100, b: 200 } };
    expect(pruneSave(save, 150).usedSpawns).toEqual({ b: 200 });
  });
});

/** Keys and values that would be location data. */
function findLocation(value: unknown, path = '$'): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) value.forEach((v, i) => hits.push(...findLocation(v, `${path}[${i}]`)));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (/^(lat|lng|lon|latitude|longitude|coords?|position|accuracy|cellId|h3)/i.test(k))
        hits.push(`${path}.${k}`);
      hits.push(...findLocation(v, `${path}.${k}`));
    }
  } else if (typeof value === 'string' && /^8[0-9a-f]{14}$/.test(value)) {
    hits.push(`${path} (H3 cell)`);
  }
  return hits;
}

describe('privacy: the save holds no location data', () => {
  it('a save with a wild battle in progress has no coordinates or cells', () => {
    let save = chooseStarter(newSave(SEED), 'aaodder');
    save = startWildBattle(
      save,
      { id: 'deadbeefcafebabe', speciesId: 'torvdue', level: 4, expiresAt: 2e9, district: 1 },
      7,
    );
    expect(findLocation(save)).toEqual([]);
    // the scanner itself works
    expect(findLocation({ a: { lat: 1 }, b: '871f04d71ffffff' })).toHaveLength(2);
  });
});
