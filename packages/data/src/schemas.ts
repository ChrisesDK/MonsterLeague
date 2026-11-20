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
    catchRate: z.number().int().min(1).max(255),
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
    placeholder,
  })
  .strict();
export type Trainer = z.infer<typeof TrainerSchema>;

export const SpeciesFileSchema = z.object({ species: z.array(SpeciesSchema) }).strict();
export const MovesFileSchema = z.object({ moves: z.array(MoveSchema) }).strict();
export const ItemsFileSchema = z.object({ items: z.array(ItemSchema) }).strict();
export const TrainersFileSchema = z.object({ trainers: z.array(TrainerSchema) }).strict();

export const I18nSchema = z.record(z.string(), z.string());
export type I18nTable = z.infer<typeof I18nSchema>;
