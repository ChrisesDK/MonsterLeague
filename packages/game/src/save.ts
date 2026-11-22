import type { BattleState, CreatureInstance } from '@oml/engine';
import { StatusSchema } from '@oml/data';
import { z } from 'zod';

/**
 * The player's progress: one versioned object stored on the phone (GDD Data model).
 *
 * Privacy (GDD): the save holds progress only, never a position or a location history.
 * The tutorial creature's position is kept in memory and re-rolled after a reload; used
 * spawns are kept only until they expire (≤ 15 min) and are pruned on every save.
 */
export const SAVE_VERSION = 6;

export type OnboardingStep = 'safety' | 'location' | 'starter' | 'tutorial' | 'done';

export type ActiveBattle =
  | { kind: 'wild'; spawnId: string; expiresAt: number; district: number; state: BattleState }
  | { kind: 'tutorial'; state: BattleState }
  | { kind: 'trainer'; poiId: string; trainerId: string; state: BattleState };

/** A decision the player still has to make after a battle (learn a move, evolve). */
export type PostBattleChoice =
  { kind: 'learn'; uid: string; moveId: string } | { kind: 'evolve'; uid: string; into: string };

export interface Settings {
  sound: boolean;
  speed: 'normal' | 'fast';
  textSize: 'normal' | 'large' | 'larger';
  reduceMotion: boolean;
  language: 'da' | 'en';
  /** 3D buildings on the play map (opt-in; off by default). */
  buildings3d: boolean;
  /** Distance of the fog wall around the player, in metres (1,000–2,000). */
  fogDistance: number;
}

/**
 * Journal progress (M2d). Game progress only, never positions or times: which districts the
 * player has entered, which numbered checkpoints of each route were reached, metres walked in
 * each district's wild areas (capped at the explore goal) and which rest stops were visited.
 */
export interface JournalProgress {
  reached: number[];
  routes: Record<string, number[]>;
  wildMetres: Record<string, number>;
  restStops: string[];
}

export interface SaveGame {
  version: typeof SAVE_VERSION;
  /** Player seed (hex): seeds the player's own randomness, e.g. the tutorial creature. */
  seed: string;
  onboarding: OnboardingStep;
  starter: string | null;
  team: CreatureInstance[];
  storage: CreatureInstance[];
  bag: Record<string, number>;
  /** Arena numbers won. */
  badges: number[];
  defeatedTrainers: string[];
  /** species id → districts it was seen / caught in (field guide). */
  seen: Record<string, number[]>;
  caught: Record<string, number[]>;
  /** Rest-stop POI id → device time (unix seconds) of the last restock. */
  lastRestock: Record<string, number>;
  /** Spawn id → expiry (unix seconds). Pruned when expired. */
  usedSpawns: Record<string, number>;
  /** Field abilities unlocked with the dev toggle (dev builds only). */
  devAbilities: string[];
  battle: ActiveBattle | null;
  pending: PostBattleChoice[];
  nextUid: number;
  settings: Settings;
  journal: JournalProgress;
  /**
   * Creature uid → device time (unix seconds) it was first seen fainted. Fainted creatures
   * recover on their own after 8 hours (owner request after M2d); a rest stop is faster.
   */
  faintedSince: Record<string, number>;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  speed: 'normal',
  textSize: 'normal',
  reduceMotion: false,
  language: 'da',
  buildings3d: false,
  fogDistance: 2000,
};

export function newSave(seed: string, language: Settings['language'] = 'da'): SaveGame {
  return {
    version: SAVE_VERSION,
    seed,
    onboarding: 'safety',
    starter: null,
    team: [],
    storage: [],
    bag: {},
    badges: [],
    defeatedTrainers: [],
    seen: {},
    caught: {},
    lastRestock: {},
    usedSpawns: {},
    devAbilities: [],
    battle: null,
    pending: [],
    nextUid: 1,
    settings: { ...DEFAULT_SETTINGS, language },
    journal: { reached: [], routes: {}, wildMetres: {}, restStops: [] },
    faintedSince: {},
  };
}

// ---------------------------------------------------------------------------
// Validation

const Creature = z
  .object({
    uid: z.string(),
    speciesId: z.string(),
    level: z.number().int().min(1).max(100),
    xp: z.number().int().min(0),
    hp: z.number().int().min(0),
    status: StatusSchema.nullable(),
    statusTurns: z.number().int().min(0),
    moves: z.array(z.object({ moveId: z.string(), pp: z.number().int().min(0) })).max(4),
    nickname: z.string().optional(),
    fieldAbility: z.string().optional(),
  })
  .strict();

const Counts = z.record(z.number().int().min(0));
const Districts = z.record(z.array(z.number().int().min(1).max(8)));
/** Battle states are engine-owned; checked shallowly here (the engine re-validates on use). */
const State = z
  .object({ turn: z.number(), rngState: z.array(z.number()), sides: z.array(z.any()).length(2) })
  .passthrough();

const Battle = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('wild'),
      spawnId: z.string(),
      expiresAt: z.number(),
      district: z.number().int(),
      state: State,
    })
    .strict(),
  z.object({ kind: z.literal('tutorial'), state: State }).strict(),
  z
    .object({ kind: z.literal('trainer'), poiId: z.string(), trainerId: z.string(), state: State })
    .strict(),
]);

export const SaveSchema = z
  .object({
    version: z.literal(SAVE_VERSION),
    seed: z.string().min(1),
    onboarding: z.enum(['safety', 'location', 'starter', 'tutorial', 'done']),
    starter: z.string().nullable(),
    team: z.array(Creature).max(6),
    storage: z.array(Creature),
    bag: Counts,
    badges: z.array(z.number().int().min(1).max(8)),
    defeatedTrainers: z.array(z.string()),
    seen: Districts,
    caught: Districts,
    lastRestock: z.record(z.number()),
    usedSpawns: z.record(z.number()),
    devAbilities: z.array(z.string()),
    battle: Battle.nullable(),
    pending: z.array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('learn'), uid: z.string(), moveId: z.string() }).strict(),
        z.object({ kind: z.literal('evolve'), uid: z.string(), into: z.string() }).strict(),
      ]),
    ),
    nextUid: z.number().int().min(1),
    settings: z
      .object({
        sound: z.boolean(),
        speed: z.enum(['normal', 'fast']),
        textSize: z.enum(['normal', 'large', 'larger']),
        reduceMotion: z.boolean(),
        language: z.enum(['da', 'en']),
        buildings3d: z.boolean(),
        fogDistance: z.number().int().min(1000).max(2000),
      })
      .strict(),
    journal: z
      .object({
        reached: z.array(z.number().int().min(1).max(8)),
        routes: z.record(z.array(z.number().int().min(0))),
        wildMetres: z.record(z.number().min(0)),
        restStops: z.array(z.string()),
      })
      .strict(),
    faintedSince: z.record(z.number()),
  })
  .strict();

// ---------------------------------------------------------------------------
// Migrations

/**
 * v0 = the M2a map's loose localStorage data (no team yet): `usedSpawns` and a saved map
 * battle that used a temporary dev team. Only the used spawns carry over; the dev battle
 * is dropped because its team never belonged to the player.
 */
export interface LegacyV0 {
  version?: 0;
  usedSpawns?: Record<string, number>;
  battle?: unknown;
}

/** One function per version step: migrations[n] turns a version-n save into version n+1. */
export const migrations: Record<number, (old: Record<string, unknown>, seed: string) => unknown> = {
  0: (old, seed) => {
    const used = (old as LegacyV0).usedSpawns;
    const save = newSave(seed);
    if (used && typeof used === 'object') {
      for (const [id, exp] of Object.entries(used)) {
        if (typeof exp === 'number') save.usedSpawns[id] = exp;
      }
    }
    return { ...save, version: 1 };
  },
  /**
   * v1 → v2 (GDD v1.7): districts were renumbered into the new arena order. District 1 and
   * badges are unchanged; the district numbers recorded in the field guide and in an active
   * wild battle move to their new numbers.
   */
  1: (old) => {
    const remap = (n: unknown) => (typeof n === 'number' ? (DISTRICT_V1_TO_V2[n] ?? n) : n);
    const byDistrict = (m: unknown) =>
      m && typeof m === 'object'
        ? Object.fromEntries(
            Object.entries(m as Record<string, unknown>).map(([k, v]) => [
              k,
              Array.isArray(v) ? [...new Set(v.map(remap))].sort() : v,
            ]),
          )
        : m;
    const battle = old.battle as Record<string, unknown> | null | undefined;
    return {
      ...old,
      version: 2,
      seen: byDistrict(old.seen),
      caught: byDistrict(old.caught),
      battle:
        battle && battle.kind === 'wild' ? { ...battle, district: remap(battle.district) } : battle,
    };
  },
  /**
   * v2 → v3 (M2d): Journal progress. Rest stops already used for a restock count as visited;
   * everything else starts empty (the map fills it in as the player walks).
   */
  2: (old) => ({
    ...old,
    version: 3,
    journal: {
      reached: [],
      routes: {},
      wildMetres: {},
      restStops: Object.keys((old.lastRestock as Record<string, number> | undefined) ?? {}).sort(),
    },
  }),
  /** v3 → v4: natural recovery clock for fainted creatures (starts empty; the game fills it). */
  3: (old) => ({ ...old, version: 4, faintedSince: {} }),
  /** v4 → v5: the 3D buildings setting (opt-in, so off for existing players too). */
  4: (old) => ({
    ...old,
    version: 5,
    settings: { ...(old.settings as Record<string, unknown>), buildings3d: false },
  }),
  /** v5 → v6: the fog distance setting (2,000 m, the default). */
  5: (old) => ({
    ...old,
    version: 6,
    settings: { ...(old.settings as Record<string, unknown>), fogDistance: 2000 },
  }),
};

/** GDD v1.7 renumbering, old district → new district (1 and 3 stay). */
export const DISTRICT_V1_TO_V2: Record<number, number> = {
  1: 1,
  2: 4,
  3: 3,
  4: 2,
  5: 8,
  6: 6,
  7: 5,
  8: 7,
};

export type LoadResult =
  { ok: true; save: SaveGame; migrated: boolean } | { ok: false; error: string };

/**
 * Validates a stored save, running every migration from its version up to SAVE_VERSION.
 * `seed` is only used when an old version has no player seed yet. Never throws.
 */
export function loadSave(raw: unknown, seed: string): LoadResult {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'not an object' };
    }
    let data = raw as Record<string, unknown>;
    let version = typeof data.version === 'number' ? data.version : 0;
    if (version > SAVE_VERSION) return { ok: false, error: `save version ${version} is newer` };
    const migrated = version < SAVE_VERSION;
    while (version < SAVE_VERSION) {
      const step = migrations[version];
      if (!step) return { ok: false, error: `no migration from version ${version}` };
      data = step(data, seed) as Record<string, unknown>;
      version++;
    }
    const parsed = SaveSchema.safeParse(data);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
    return { ok: true, save: parsed.data as SaveGame, migrated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Removes expired used-spawn entries (called before every write). */
export function pruneSave(save: SaveGame, nowSeconds: number): SaveGame {
  const usedSpawns: Record<string, number> = {};
  for (const [id, exp] of Object.entries(save.usedSpawns)) {
    if (exp > nowSeconds) usedSpawns[id] = exp;
  }
  return { ...save, usedSpawns };
}
