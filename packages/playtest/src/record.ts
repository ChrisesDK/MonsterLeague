import { z } from 'zod';

/** Export file format id and version. Bump the version on any breaking field change. */
export const EXPORT_FORMAT = 'oml-gate2';
export const EXPORT_VERSION = 1;

export const BattleKindSchema = z.enum(['wild', 'trainer', 'leader']);
export const LengthAnswerSchema = z.enum(['too_long', 'about_right', 'too_short']);
export type LengthAnswer = z.infer<typeof LengthAnswerSchema>;

/**
 * One finished battle in a Gate 2 playtest session. No names, emails or location data:
 * the tester is identified only by a short code they choose (e.g. "T03").
 */
export const PlaytestRecordSchema = z
  .object({
    recordId: z.string().min(1),
    testerCode: z.string().min(1).max(12),
    sessionId: z.string().min(1),
    /** Slot in the session plan, e.g. "wild1", "leader1". */
    battleId: z.string().min(1),
    /** 1 for the first try of a slot, 2+ for redos. */
    attempt: z.number().int().min(1),
    kind: BattleKindSchema,
    /** Species id (wild) or trainer id. */
    opponentId: z.string().min(1),
    opponentLevel: z.number().int().min(1).nullable(),
    starter: z.enum(['fire', 'water', 'grove']),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    /** Time the battle screen was actually in use (pauses and background excluded). */
    activeMs: z.number().int().min(0),
    turns: z.number().int().min(0),
    result: z.enum(['p1', 'p2', 'caught', 'ran']),
    switches: z.number().int().min(0),
    itemsUsed: z.number().int().min(0),
    catchAttempts: z.number().int().min(0),
    speed: z.enum(['normal', 'fast']),
    locale: z.enum(['da', 'en']),
    appVersion: z.string().min(1),
    rating: z.number().int().min(1).max(5).nullable(),
    length: LengthAnswerSchema.nullable(),
    comment: z.string().max(500),
  })
  .strict();
export type PlaytestRecord = z.infer<typeof PlaytestRecordSchema>;
export type BattleKind = z.infer<typeof BattleKindSchema>;

export const ExportFileSchema = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    version: z.literal(EXPORT_VERSION),
    exportedAt: z.string().datetime(),
    records: z.array(PlaytestRecordSchema),
  })
  .strict();
export type ExportFile = z.infer<typeof ExportFileSchema>;

/** Tester codes: 1–12 letters (incl. Æ Ø Å), digits, "-" or "_" (so no names with spaces, no emails). */
export const TESTER_CODE = /^[A-Za-z0-9ÆØÅæøå_-]{1,12}$/;
export function normaliseTesterCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return TESTER_CODE.test(code) ? code : null;
}
