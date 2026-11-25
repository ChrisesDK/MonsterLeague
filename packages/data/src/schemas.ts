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

/** How rare a creature is in the wild (roster v2, D167); the spawn tables follow it. */
export const SpeciesRaritySchema = z.enum(['common', 'uncommon', 'rare', 'veryRare']);
export type SpeciesRarity = z.infer<typeof SpeciesRaritySchema>;

export const SpeciesSchema = z
  .object({
    id,
    types: z.array(TypeIdSchema).min(1).max(2),
    rarity: SpeciesRaritySchema,
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
    /** Art colours [body, accent] (M2d); without them the art uses the type colours. */
    colors: z
      .tuple([z.string().regex(/^#[0-9a-f]{6}$/), z.string().regex(/^#[0-9a-f]{6}$/)])
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

/**
 * Market fields (D165): what an item costs in skilling at a market (sold back for half), and
 * the badge a market needs before it sells it. No price = not sold at markets.
 */
const market = {
  price: z.number().int().min(1).optional(),
  marketBadge: z.number().int().min(1).max(8).optional(),
};
export const ItemSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id,
      kind: z.literal('heal'),
      amount: z.number().int().min(1),
      ...market,
      placeholder,
    })
    .strict(),
  z.object({ id, kind: z.literal('cure'), ...market, placeholder }).strict(),
  z
    .object({
      id,
      kind: z.literal('charm'),
      catchBonus: z.number().positive(),
      ...market,
      placeholder,
    })
    .strict(),
  /** Revives a fainted creature at `percent` of max HP (GDD: Revive Leaf, 50%). */
  z
    .object({
      id,
      kind: z.literal('revive'),
      percent: z.number().min(1).max(100),
      ...market,
      placeholder,
    })
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
    /** Item given once when the player wins (GDD: trainers give a reward item). */
    reward: z
      .object({ itemId: id, count: z.number().int().min(1) })
      .strict()
      .optional(),
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
    /**
     * GDD v1.7: common creatures can be battled everywhere at the player's own level band;
     * rare ones (and field-ability layers) use the district's band and lock with it.
     */
    rarity: z.enum(['common', 'rare']),
    biomes: z.record(BiomeSchema, z.number().min(0)),
    time: z.enum(['any', 'day', 'night']),
    /** Field-ability id required to see this spawn (see field-abilities.json). */
    requires: id.optional(),
    /** D167: spawns only in destinations (nature in forest, field and lake zones). */
    destinationOnly: z.boolean().optional(),
  })
  .strict();
export type Spawn = z.infer<typeof SpawnSchema>;
export const SpawnsFileSchema = z.object({ spawns: z.array(SpawnSchema) }).strict();

export const I18nSchema = z.record(z.string(), z.string());
export type I18nTable = z.infer<typeof I18nSchema>;

/**
 * Region file built by tools/region-builder (e.g. region.odense.json). Compact on purpose:
 * each cell is `[district, zone, flags, ...biome shares in percent, in BIOMES order,
 * blockedMask?]`; `zone` indexes the file's `zones` list (v4, GDD P22). The optional last
 * column is a bit mask over the cell's 49 res-12 child positions (in `cellToChildren` order)
 * where no spawn may be placed (GDD P10, P11).
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
    /** Content hash of cells + districts (12 hex), written by the region builder. */
    dataVersion: z.string().regex(/^[0-9a-f]{12}$/),
    /**
     * 4 (P22): column 1 is the zone index, column 2 a bit field: 1 noSpawn, 2 wild, 4 water
     * edge, 8 route (3 had no zone column).
     */
    version: z.literal(4),
    h3Res: z.literal(10),
    coarseRes: z.literal(7),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    biomes: z.array(BiomeSchema).length(BIOMES.length),
    osmTimestamp: z.string(),
    districts: z.array(RegionDistrictSchema).min(1),
    /** Zone ids; a cell's zone column is an index into this list. */
    zones: z.array(id).min(1),
    cells: z.record(
      z.string().regex(/^8a[0-9a-f]{13}$/, 'H3 res-10 cell id'),
      z
        .array(z.number().int().min(0))
        .min(3 + BIOMES.length)
        .max(4 + BIOMES.length)
        .refine(
          (row) =>
            row.slice(0, 3 + BIOMES.length).every((v) => v <= 100) &&
            (row.length === 3 + BIOMES.length || row[3 + BIOMES.length]! < 2 ** 49),
          'district, zone, flags and shares ≤ 100; blocked mask < 2^49',
        ),
    ),
  })
  .strict();
export type RegionFile = z.infer<typeof RegionFileSchema>;

/** region.<id>.version.json: what the client expects the spawn service to be running. */
export const RegionVersionFileSchema = z
  .object({ region: id, dataVersion: z.string().regex(/^[0-9a-f]{12}$/) })
  .strict();
export type RegionDistrict = z.infer<typeof RegionDistrictSchema>;

/**
 * Points of interest (GDD "Arenas, trainers, rest stops"): fixed, hand-placed, each with an
 * interaction radius. Names are i18n keys `poi.<id>.name`. `verified` = checked on site.
 */
const poiBase = {
  id,
  district: z.number().int().min(1).max(8),
  /** The zone the POI stands in (P22): trainers and arenas lock with it. */
  zone: id,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  verified: z.boolean(),
  /** Short note on why this spot was chosen (public, step-free, …). */
  note: z.string().optional(),
};
export const PoiSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...poiBase,
      kind: z.literal('arena'),
      radius: z.literal(80),
      arena: z.number().int().min(1).max(8),
      /** Junior trainers first, the leader last. */
      trainers: z.array(id).min(2),
    })
    .strict(),
  z
    .object({
      ...poiBase,
      kind: z.literal('trainer'),
      radius: z.literal(50),
      trainer: id,
      /** The route the trainer stands on (route trainers, D163). */
      route: id.optional(),
    })
    .strict(),
  /** A market (D165): buy items for skilling and sell them back for half. */
  z.object({ ...poiBase, kind: z.literal('market'), radius: z.literal(40) }).strict(),
  z
    .object({
      ...poiBase,
      kind: z.literal('restStop'),
      radius: z.literal(40),
      /** Free restock once per hour (GDD), data-driven. */
      restock: z.record(id, z.number().int().min(1)),
    })
    .strict(),
]);
export type Poi = z.infer<typeof PoiSchema>;
export const PoisFileSchema = z.object({ region: id, pois: z.array(PoiSchema) }).strict();
export type PoisFile = z.infer<typeof PoisFileSchema>;

/**
 * Arena sites (M2d, GDD "World" table): where each district's arena stands, for routes, the
 * Town Map and the Journal. Built arenas also have an arena POI; `poi` links it. Names are
 * i18n keys `arenaSite.<arena>.name`.
 */
export const ArenaSiteSchema = z
  .object({
    arena: z.number().int().min(1).max(8),
    district: z.number().int().min(1).max(8),
    /** The arena's zone (P22). */
    zone: id,
    /** Arena theme type; null = mixed. */
    type: TypeIdSchema.nullable(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    /** The arena POI once the arena is built (null until then). */
    poi: id.nullable(),
    note: z.string().optional(),
  })
  .strict();
export type ArenaSite = z.infer<typeof ArenaSiteSchema>;
export const ArenasFileSchema = z
  .object({ region: id, arenas: z.array(ArenaSiteSchema).length(8) })
  .strict();

/**
 * Zones (GDD P22): the region is split into zones around arenas, towns and wild or water
 * destinations. A zone opens when the player finishes a route that ends in it; the start
 * zone is open from the beginning. Each zone belongs to one district (its level band and
 * spawn table). Names are i18n keys `zone.<id>.name`.
 */
export const ZoneSchema = z
  .object({
    id,
    kind: z.enum(['arena', 'town', 'wild', 'water']),
    district: z.number().int().min(1).max(8),
    /** Centre: cells belong to the nearest zone centre. */
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    /** The arena in this zone (kind 'arena'). */
    arena: z.number().int().min(1).max(8).optional(),
    /** Open from the start (exactly one zone). */
    start: z.boolean().optional(),
    /** What the Town Map shows for a destination (D165): what the zone mostly is. */
    icon: z.enum(['forest', 'field', 'lake', 'town']).optional(),
  })
  .strict();
export type Zone = z.infer<typeof ZoneSchema>;
export const ZonesFileSchema = z
  .object({
    region: id,
    /** Level bands per district (GDD World table). */
    districts: z
      .array(
        z
          .object({
            id: z.number().int().min(1).max(8),
            wildLevels: z.tuple([z.number().int().min(1), z.number().int().max(100)]),
          })
          .strict(),
      )
      .length(8),
    zones: z.array(ZoneSchema).min(1),
  })
  .strict();
export type ZonesFile = z.infer<typeof ZonesFileSchema>;

/**
 * Routes (GDD P22): numbered walking routes between two zones along real footpaths, built by
 * `pnpm routes:build` from the OSM foot network. Walking a whole route (it fills in like a
 * progress bar) opens the zones at both ends. `main` routes make up the shortest way from
 * arena to arena, `alt` routes are other ways between the same places and `explore`
 * routes lead to a destination. Names are i18n keys `route.<id>.name`. `path` is
 * [lng, lat] (6 decimals).
 */
export const RouteSchema = z
  .object({
    id,
    number: z.number().int().min(1).max(99),
    from: id,
    to: id,
    kind: z.enum(['main', 'alt', 'explore']),
    lengthM: z.number().int().positive(),
    /** Share of the length that runs through wild-area cells, 0–1. */
    wildShare: z.number().min(0).max(1),
    path: z.array(z.tuple([z.number(), z.number()])).min(2),
  })
  .strict();
export type Route = z.infer<typeof RouteSchema>;
export const RoutesFileSchema = z.object({ region: id, routes: z.array(RouteSchema) }).strict();

/**
 * Journal side goals (M2d, GDD "Journal"): finite, per district, never daily. Their text
 * comes from one template per kind (`goal.<kind>`). exploreWild: walk `metres` inside the
 * district's wild areas; catchType: catch a creature of `type` there; findRare: meet
 * `species` there (a battle with it).
 */
export const SideGoalSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id,
      district: z.number().int().min(1).max(8),
      kind: z.literal('exploreWild'),
      metres: z.number().int().min(50),
    })
    .strict(),
  z
    .object({
      id,
      district: z.number().int().min(1).max(8),
      kind: z.literal('catchType'),
      type: TypeIdSchema,
    })
    .strict(),
  z
    .object({
      id,
      district: z.number().int().min(1).max(8),
      kind: z.literal('findRare'),
      species: id,
    })
    .strict(),
]);
export type SideGoal = z.infer<typeof SideGoalSchema>;
export const GoalsFileSchema = z.object({ sideGoals: z.array(SideGoalSchema) }).strict();
