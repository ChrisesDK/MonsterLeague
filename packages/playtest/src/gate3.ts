import { z } from 'zod';
import { median } from './summary';
import type { BattleKind } from './record';

/**
 * Gate 3 (district walk test): one opt-in test session per walk. Counts only: the distance
 * is summed on the phone from GPS steps and stored as a single number of metres. No
 * coordinates, cells, place names or times of day beyond start/end are recorded.
 */
export const GATE3_FORMAT = 'oml-gate3';
export const GATE3_VERSION = 1;

const ByKind = z
  .object({
    wild: z.number().int().min(0),
    trainer: z.number().int().min(0),
    leader: z.number().int().min(0),
  })
  .strict();

export const Gate3SessionSchema = z
  .object({
    sessionId: z.string().min(1),
    testerCode: z.string().min(1).max(12),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime().nullable(),
    /** Started after sunset (from the region centre's sun times, not the player's position). */
    dark: z.boolean(),
    distanceM: z.number().int().min(0),
    spawnsSeen: z.number().int().min(0),
    spawnsBattled: z.number().int().min(0),
    catches: z.number().int().min(0),
    trainersBeaten: z.number().int().min(0),
    restStopVisits: z.number().int().min(0),
    battlesWon: z.number().int().min(0),
    battlesLost: z.number().int().min(0),
    /** Active battle time (pauses and background excluded) by battle kind. */
    activeMs: ByKind,
    battles: ByKind,
    /** Turn count of every leader battle (GDD open question: 30–40 turns outdoors?). */
    leaderTurns: z.array(z.number().int().min(0)),
    rating: z.number().int().min(1).max(5).nullable(),
    comment: z.string().max(1000),
    locale: z.enum(['da', 'en']),
    appVersion: z.string().min(1),
  })
  .strict();
export type Gate3Session = z.infer<typeof Gate3SessionSchema>;

export const Gate3FileSchema = z
  .object({
    format: z.literal(GATE3_FORMAT),
    version: z.literal(GATE3_VERSION),
    exportedAt: z.string().datetime(),
    sessions: z.array(Gate3SessionSchema),
  })
  .strict();
export type Gate3File = z.infer<typeof Gate3FileSchema>;

export type Gate3Event =
  | { type: 'distance'; metres: number }
  | { type: 'spawnSeen' }
  | { type: 'spawnBattled' }
  | { type: 'catch' }
  | { type: 'trainerBeaten' }
  | { type: 'restVisit' }
  | { type: 'battle'; kind: BattleKind; won: boolean; activeMs: number; turns: number };

export function newGate3Session(input: {
  sessionId: string;
  testerCode: string;
  startedAt: Date;
  dark: boolean;
  locale: 'da' | 'en';
  appVersion: string;
}): Gate3Session {
  return {
    sessionId: input.sessionId,
    testerCode: input.testerCode,
    startedAt: input.startedAt.toISOString(),
    endedAt: null,
    dark: input.dark,
    distanceM: 0,
    spawnsSeen: 0,
    spawnsBattled: 0,
    catches: 0,
    trainersBeaten: 0,
    restStopVisits: 0,
    battlesWon: 0,
    battlesLost: 0,
    activeMs: { wild: 0, trainer: 0, leader: 0 },
    battles: { wild: 0, trainer: 0, leader: 0 },
    leaderTurns: [],
    rating: null,
    comment: '',
    locale: input.locale,
    appVersion: input.appVersion,
  };
}

/** Pure reducer: counts one game event into the session. Ended sessions don't change. */
export function recordGate3(s: Gate3Session, e: Gate3Event): Gate3Session {
  if (s.endedAt) return s;
  switch (e.type) {
    case 'distance':
      return { ...s, distanceM: s.distanceM + Math.max(0, Math.round(e.metres)) };
    case 'spawnSeen':
      return { ...s, spawnsSeen: s.spawnsSeen + 1 };
    case 'spawnBattled':
      return { ...s, spawnsBattled: s.spawnsBattled + 1 };
    case 'catch':
      return { ...s, catches: s.catches + 1 };
    case 'trainerBeaten':
      return { ...s, trainersBeaten: s.trainersBeaten + 1 };
    case 'restVisit':
      return { ...s, restStopVisits: s.restStopVisits + 1 };
    case 'battle':
      return {
        ...s,
        battlesWon: s.battlesWon + (e.won ? 1 : 0),
        battlesLost: s.battlesLost + (e.won ? 0 : 1),
        activeMs: { ...s.activeMs, [e.kind]: s.activeMs[e.kind] + Math.round(e.activeMs) },
        battles: { ...s.battles, [e.kind]: s.battles[e.kind] + 1 },
        leaderTurns: e.kind === 'leader' ? [...s.leaderTurns, e.turns] : s.leaderTurns,
      };
  }
}

export function endGate3(
  s: Gate3Session,
  at: Date,
  rating: number | null,
  comment: string,
): Gate3Session {
  return {
    ...s,
    endedAt: s.endedAt ?? at.toISOString(),
    rating: rating === null ? null : Math.max(1, Math.min(5, Math.round(rating))),
    comment: comment.trim().slice(0, 1000),
  };
}

// ---------------------------------------------------------------------------
// Export

export const GATE3_CSV_COLUMNS = [
  'sessionId',
  'testerCode',
  'startedAt',
  'endedAt',
  'dark',
  'distanceM',
  'spawnsSeen',
  'spawnsBattled',
  'catches',
  'trainersBeaten',
  'restStopVisits',
  'battlesWon',
  'battlesLost',
  'activeMsWild',
  'activeMsTrainer',
  'activeMsLeader',
  'battlesWild',
  'battlesTrainer',
  'battlesLeader',
  'leaderTurns',
  'rating',
  'comment',
  'locale',
  'appVersion',
] as const;

export function gate3Json(sessions: readonly Gate3Session[], exportedAt: Date): string {
  const file: Gate3File = {
    format: GATE3_FORMAT,
    version: GATE3_VERSION,
    exportedAt: exportedAt.toISOString(),
    sessions: [...sessions],
  };
  return JSON.stringify(file, null, 2);
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function gate3Csv(sessions: readonly Gate3Session[]): string {
  const rows = sessions.map((s) =>
    [
      s.sessionId,
      s.testerCode,
      s.startedAt,
      s.endedAt,
      s.dark,
      s.distanceM,
      s.spawnsSeen,
      s.spawnsBattled,
      s.catches,
      s.trainersBeaten,
      s.restStopVisits,
      s.battlesWon,
      s.battlesLost,
      s.activeMs.wild,
      s.activeMs.trainer,
      s.activeMs.leader,
      s.battles.wild,
      s.battles.trainer,
      s.battles.leader,
      s.leaderTurns.join(' '),
      s.rating,
      s.comment,
      s.locale,
      s.appVersion,
    ]
      .map(csvCell)
      .join(','),
  );
  return [GATE3_CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x !== ''));
}

/** Reads an exported Gate 3 .json or .csv file (validated). */
export function parseGate3(text: string): Gate3Session[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return Gate3FileSchema.parse(JSON.parse(trimmed)).sessions;
  const [header, ...rows] = parseCsvRows(trimmed);
  if (!header || header.join(',') !== GATE3_CSV_COLUMNS.join(','))
    throw new Error('Not a Gate 3 CSV export');
  return rows.map((r) => {
    const v = Object.fromEntries(GATE3_CSV_COLUMNS.map((k, i) => [k, r[i] ?? '']));
    const n = (k: string) => Number(v[k]);
    return Gate3SessionSchema.parse({
      sessionId: v.sessionId,
      testerCode: v.testerCode,
      startedAt: v.startedAt,
      endedAt: v.endedAt || null,
      dark: v.dark === 'true',
      distanceM: n('distanceM'),
      spawnsSeen: n('spawnsSeen'),
      spawnsBattled: n('spawnsBattled'),
      catches: n('catches'),
      trainersBeaten: n('trainersBeaten'),
      restStopVisits: n('restStopVisits'),
      battlesWon: n('battlesWon'),
      battlesLost: n('battlesLost'),
      activeMs: {
        wild: n('activeMsWild'),
        trainer: n('activeMsTrainer'),
        leader: n('activeMsLeader'),
      },
      battles: { wild: n('battlesWild'), trainer: n('battlesTrainer'), leader: n('battlesLeader') },
      leaderTurns: v.leaderTurns ? v.leaderTurns!.split(' ').map(Number) : [],
      rating: v.rating ? Number(v.rating) : null,
      comment: v.comment,
      locale: v.locale,
      appVersion: v.appVersion,
    });
  });
}

// ---------------------------------------------------------------------------
// Report

/** GDD density targets (metres walked per battle-able spawn). */
export const DENSITY_TARGET_M = { green: [150, 300], streets: [300, 500] } as const;
export const GATE3_RATING_TARGET = 4;

export interface Gate3Summary {
  sessions: number;
  testers: number;
  darkSessions: number;
  totalDistanceM: number;
  medianDistanceM: number | null;
  /** Total metres walked per battle-able spawn seen (all sessions together). */
  metresPerSpawn: number | null;
  battlesPerKm: number | null;
  catchesPerKm: number | null;
  ratings: Record<1 | 2 | 3 | 4 | 5, number>;
  medianRating: number | null;
  medianLeaderTurns: number | null;
  medianActiveMs: Record<BattleKind, number | null>;
  comments: { testerCode: string; rating: number | null; dark: boolean; comment: string }[];
}

export function mergeGate3(groups: readonly (readonly Gate3Session[])[]): Gate3Session[] {
  const byId = new Map<string, Gate3Session>();
  for (const g of groups)
    for (const s of g) {
      const prev = byId.get(s.sessionId);
      // keep the most complete copy (an ended session over a running one)
      if (!prev || (!prev.endedAt && s.endedAt) || s.distanceM > prev.distanceM)
        byId.set(s.sessionId, s);
    }
  return [...byId.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function summarizeGate3(sessions: readonly Gate3Session[]): Gate3Summary {
  const total = sessions.reduce((a, s) => a + s.distanceM, 0);
  const seen = sessions.reduce((a, s) => a + s.spawnsSeen, 0);
  const battles = sessions.reduce((a, s) => a + s.battlesWon + s.battlesLost, 0);
  const catches = sessions.reduce((a, s) => a + s.catches, 0);
  const ratings = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Gate3Summary['ratings'];
  for (const s of sessions) if (s.rating) ratings[s.rating as 1 | 2 | 3 | 4 | 5]++;
  const perKind = (k: BattleKind) =>
    median(sessions.filter((s) => s.battles[k] > 0).map((s) => s.activeMs[k] / s.battles[k]));
  return {
    sessions: sessions.length,
    testers: new Set(sessions.map((s) => s.testerCode)).size,
    darkSessions: sessions.filter((s) => s.dark).length,
    totalDistanceM: total,
    medianDistanceM: median(sessions.map((s) => s.distanceM)),
    metresPerSpawn: seen > 0 ? total / seen : null,
    battlesPerKm: total > 0 ? battles / (total / 1000) : null,
    catchesPerKm: total > 0 ? catches / (total / 1000) : null,
    ratings,
    medianRating: median(sessions.flatMap((s) => (s.rating ? [s.rating] : []))),
    medianLeaderTurns: median(sessions.flatMap((s) => s.leaderTurns)),
    medianActiveMs: {
      wild: perKind('wild'),
      trainer: perKind('trainer'),
      leader: perKind('leader'),
    },
    comments: sessions
      .filter((s) => s.comment)
      .map((s) => ({
        testerCode: s.testerCode,
        rating: s.rating,
        dark: s.dark,
        comment: s.comment,
      })),
  };
}
