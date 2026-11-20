import { z } from 'zod';

export const TYPE_IDS = ['folk', 'fire', 'water', 'grove', 'stone', 'storm', 'spirit'] as const;
export const TypeIdSchema = z.enum(TYPE_IDS);
export type TypeId = z.infer<typeof TypeIdSchema>;

export const STATUSES = ['burn', 'poison', 'sleep', 'paralysis'] as const;
export const StatusSchema = z.enum(STATUSES);
export type Status = z.infer<typeof StatusSchema>;

/** Stats that can be raised/lowered in battle (hp has no stage). */
export const StageStatSchema = z.enum(['atk', 'def', 'spd']);
export type StageStat = z.infer<typeof StageStatSchema>;

const id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are lower_snake_case');
const placeholder = z.boolean().optional();

export const EffectivenessSchema = z.union([
  z.literal(0),
  z.literal(0.5),
  z.literal(1),
  z.literal(2),
]);

export const TypesFileSchema = z
  .object({
    types: z.array(
      z.object({ id: TypeIdSchema, color: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict(),
    ),
    chart: z.record(TypeIdSchema, z.record(TypeIdSchema, EffectivenessSchema)),
  })
  .strict();
export type TypesFile = z.infer<typeof TypesFileSchema>;

export const BaseStatsSchema = z
  .object({
    hp: z.number().int().min(1).max(255),
    atk: z.number().int().min(1).max(255),
    def: z.number().int().min(1).max(255),
    spd: z.number().int().min(1).max(255),
  })
  .strict();
export type BaseStats = z.infer<typeof BaseStatsSchema>;

export const SpeciesSchema = z
  .object({
    id,
    types: z.array(TypeIdSchema).min(1).max(2),
    baseStats: BaseStatsSchema,
    /** GDD: catch rate 3–255. */
    catchRate: z.number().int().min(3).max(255),
    baseXp: z.number().int().min(1),
    learnset: z
      .array(z.object({ level: z.number().int().min(1).max(100), moveId: id }).strict())
      .min(4)
      .max(8),
    evolution: z
      .object({ into: id, level: z.number().int().min(2).max(100) })
      .strict()
      .optional(),
    placeholder,
  })
  .strict();
export type Species = z.infer<typeof SpeciesSchema>;

export const MoveEffectSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('status'),
      status: StatusSchema,
      chance: z.number().min(0).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal('stat'),
      target: z.enum(['self', 'target']),
      stat: StageStatSchema,
      stages: z.number().int().min(-6).max(6),
      chance: z.number().min(0).max(100),
    })
    .strict(),
  z.object({ kind: z.literal('heal'), percent: z.number().min(1).max(100) }).strict(),
  z.object({ kind: z.literal('recoil'), percent: z.number().min(1).max(100) }).strict(),
]);
export type MoveEffect = z.infer<typeof MoveEffectSchema>;

export const MoveSchema = z
  .object({
    id,
    type: TypeIdSchema,
    /** 0 = status move. */
    power: z.number().int().min(0).max(250),
    /** null = never misses. */
    accuracy: z.number().int().min(1).max(100).nullable(),
    pp: z.number().int().min(1).max(64),
    priority: z.number().int().min(-1).max(1),
    effects: z.array(MoveEffectSchema),
    /** Ignores the type chart and STAB (used by the out-of-PP fallback move). */
    typeless: z.boolean().optional(),
    placeholder,
  })
  .strict();
export type Move = z.infer<typeof MoveSchema>;

export const ItemSchema = z.discriminatedUnion('kind', [
  z.object({ id, kind: z.literal('heal'), amount: z.number().int().min(1), placeholder }).strict(),
  z.object({ id, kind: z.literal('cure'), placeholder }).strict(),
  z
    .object({ id, kind: z.literal('charm'), catchBonus: z.number().positive(), placeholder })
    .strict(),
  /** Revives a fainted creature at `percent` of max HP (GDD: Revive Leaf, 50%). */
  z
    .object({ id, kind: z.literal('revive'), percent: z.number().min(1).max(100), placeholder })
    .strict(),
]);
export type Item = z.infer<typeof ItemSchema>;

export const TrainerSchema = z
  .object({
    id,
    tier: z.enum(['trainer', 'leader']),
    team: z
      .array(
        z
          .object({
            speciesId: id,
            level: z.number().int().min(1).max(100),
            moves: z.array(id).min(1).max(4).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    items: z.record(id, z.number().int().min(0)).default({}),
    /** Arena number this trainer belongs to (leaders run the arena). */
    arena: z.number().int().min(1).max(8).optional(),
    /** Leader theme type, used by balance tooling to classify match-ups. */
    theme: TypeIdSchema.optional(),
    placeholder,
  })
  .strict();
export type Trainer = z.infer<typeof TrainerSchema>;

/**
 * Balance-tooling preset: the team a typical player is expected to bring to an arena.
 * The starter slot is filled with the chosen starter at `starterLevel`.
 */
export const PlayerTeamSchema = z
  .object({
    id,
    arena: z.number().int().min(1).max(8),
    starterLevel: z.number().int().min(1).max(100),
    team: z
      .array(z.object({ speciesId: id, level: z.number().int().min(1).max(100) }).strict())
      .max(5),
    items: z.record(id, z.number().int().min(0)).default({}),
    placeholder,
  })
  .strict();
export type PlayerTeam = z.infer<typeof PlayerTeamSchema>;

export const SpeciesFileSchema = z.object({ species: z.array(SpeciesSchema) }).strict();
export const MovesFileSchema = z.object({ moves: z.array(MoveSchema) }).strict();
export const ItemsFileSchema = z.object({ items: z.array(ItemSchema) }).strict();
export const TrainersFileSchema = z.object({ trainers: z.array(TrainerSchema) }).strict();
export const PlayerTeamsFileSchema = z.object({ playerTeams: z.array(PlayerTeamSchema) }).strict();

/**
 * GDD "Field abilities": taught to a team member, unlocked by a badge, learnable by
 * creatures of the listed types. Names are i18n keys `fieldAbility.<id>.name`.
 * Effects arrive in M2; this is data only.
 */
export const FieldAbilitySchema = z
  .object({
    id,
    badge: z.number().int().min(1).max(8),
    types: z.array(TypeIdSchema).min(1),
    placeholder,
  })
  .strict();
export type FieldAbility = z.infer<typeof FieldAbilitySchema>;
export const FieldAbilitiesFileSchema = z
  .object({ fieldAbilities: z.array(FieldAbilitySchema) })
  .strict();

/** GDD "Encounters and spawning": biome shares computed per H3 cell by the region builder. */
/** Order matters: it is also the column order of biome shares in region files. */
export const BIOMES = [
  'water',
  'forest',
  'park',
  'meadow',
  'farmland',
  'urban',
  'industrial',
  'historic',
] as const;
export type Biome = (typeof BIOMES)[number];
export const BiomeSchema = z.enum(BIOMES);

/** One spawn-table entry (GDD "Example spawn table entry"). Used from M2 on. */
export const SpawnSchema = z
  .object({
    species: id,
    district: z.number().int().min(1).max(8),
    weight: z.number().positive(),
    biomes: z.record(BiomeSchema, z.number().min(0)),
    time: z.enum(['any', 'day', 'night']),
    /** Field-ability id required to see this spawn (see field-abilities.json). */
    requires: id.optional(),
  })
  .strict();
export type Spawn = z.infer<typeof SpawnSchema>;
export const SpawnsFileSchema = z.object({ spawns: z.array(SpawnSchema) }).strict();

export const I18nSchema = z.record(z.string(), z.string());
export type I18nTable = z.infer<typeof I18nSchema>;

/**
 * Region file built by tools/region-builder (e.g. region.odense.json). Compact on purpose:
 * each cell is `[district, noSpawn 0|1, ...biome shares in percent, in BIOMES order]`.
 */
export const RegionDistrictSchema = z
  .object({
    id: z.number().int().min(1).max(8),
    wildLevels: z.tuple([z.number().int().min(1), z.number().int().max(100)]),
    draft: z.boolean(),
  })
  .strict();
export const RegionFileSchema = z
  .object({
    region: id,
    version: z.literal(1),
    h3Res: z.literal(10),
    coarseRes: z.literal(7),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    biomes: z.array(BiomeSchema).length(BIOMES.length),
    osmTimestamp: z.string(),
    districts: z.array(RegionDistrictSchema).min(1),
    cells: z.record(
      z.string().regex(/^8a[0-9a-f]{13}$/, 'H3 res-10 cell id'),
      z.array(z.number().int().min(0).max(100)).length(2 + BIOMES.length),
    ),
  })
  .strict();
export type RegionFile = z.infer<typeof RegionFileSchema>;
export type RegionDistrict = z.infer<typeof RegionDistrictSchema>;
