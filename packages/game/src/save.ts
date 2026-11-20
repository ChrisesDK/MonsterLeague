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
export const SAVE_VERSION = 1;

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
  speed: 1 | 2 | 3;
  textSize: 'normal' | 'large' | 'larger';
  reduceMotion: boolean;
  language: 'da' | 'en';
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
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  speed: 1,
  textSize: 'normal',
  reduceMotion: false,
  language: 'da',
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
        speed: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        textSize: z.enum(['normal', 'large', 'larger']),
        reduceMotion: z.boolean(),
        language: z.enum(['da', 'en']),
      })
      .strict(),
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
    return save;
  },
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
