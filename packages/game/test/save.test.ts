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

  it('v0 (M2a localStorage) → v1 keeps used spawns and drops the dev battle', () => {
    const r = loadSave(
      { usedSpawns: { abc: 2_000_000_000, bad: 'x' }, battle: { spawnId: 'abc' } },
      SEED,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migrated).toBe(true);
    expect(r.save.version).toBe(1);
    expect(r.save.seed).toBe(SEED);
    expect(r.save.usedSpawns).toEqual({ abc: 2_000_000_000 });
    expect(r.save.battle).toBeNull();
    expect(r.save.onboarding).toBe('safety');
    expect(SaveSchema.safeParse(r.save).success).toBe(true);
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
