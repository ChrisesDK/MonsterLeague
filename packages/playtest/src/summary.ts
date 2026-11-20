import type { BattleKind, LengthAnswer, PlaytestRecord } from './record';

/** Gate 2 real-time targets per battle kind (GDD "Development plan"). */
export const TIME_TARGET_MS: Record<BattleKind, number> = {
  wild: 2 * 60_000,
  trainer: 3 * 60_000,
  leader: 8 * 60_000,
};
export const RATING_TARGET = 4;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface KindSummary {
  battles: number;
  medianActiveMs: number | null;
  targetMs: number;
  withinTarget: boolean | null;
  medianTurns: number | null;
  medianRating: number | null;
  length: Record<LengthAnswer, number>;
}

export interface Gate2Summary {
  records: number;
  testers: number;
  sessions: number;
  byKind: Record<BattleKind, KindSummary>;
  ratings: Record<1 | 2 | 3 | 4 | 5, number>;
  unrated: number;
  meanRating: number | null;
  medianRating: number | null;
  length: Record<LengthAnswer, number>;
  comments: { testerCode: string; battleId: string; rating: number | null; comment: string }[];
}

/** Drops duplicate records (the same file exported twice, or JSON + CSV of one session). */
export function mergeRecords(groups: readonly (readonly PlaytestRecord[])[]): PlaytestRecord[] {
  const byId = new Map<string, PlaytestRecord>();
  for (const group of groups) for (const r of group) byId.set(r.recordId, r);
  return [...byId.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

const emptyLength = (): Record<LengthAnswer, number> => ({
  too_long: 0,
  about_right: 0,
  too_short: 0,
});

export function summarize(records: readonly PlaytestRecord[]): Gate2Summary {
  const kinds: BattleKind[] = ['wild', 'trainer', 'leader'];
  const byKind = {} as Record<BattleKind, KindSummary>;
  for (const kind of kinds) {
    const rs = records.filter((r) => r.kind === kind);
    const med = median(rs.map((r) => r.activeMs));
    const length = emptyLength();
    for (const r of rs) if (r.length) length[r.length]++;
    byKind[kind] = {
      battles: rs.length,
      medianActiveMs: med,
      targetMs: TIME_TARGET_MS[kind],
      withinTarget: med === null ? null : med <= TIME_TARGET_MS[kind],
      medianTurns: median(rs.map((r) => r.turns)),
      medianRating: median(rs.flatMap((r) => (r.rating === null ? [] : [r.rating]))),
      length,
    };
  }
  const ratings = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Gate2Summary['ratings'];
  const rated = records.flatMap((r) => (r.rating === null ? [] : [r.rating]));
  for (const r of rated) ratings[r as 1 | 2 | 3 | 4 | 5]++;
  const length = emptyLength();
  for (const r of records) if (r.length) length[r.length]++;
  return {
    records: records.length,
    testers: new Set(records.map((r) => r.testerCode)).size,
    sessions: new Set(records.map((r) => r.sessionId)).size,
    byKind,
    ratings,
    unrated: records.length - rated.length,
    meanRating: rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null,
    medianRating: median(rated),
    length,
    comments: records
      .filter((r) => r.comment.trim() !== '')
      .map((r) => ({
        testerCode: r.testerCode,
        battleId: r.battleId,
        rating: r.rating,
        comment: r.comment,
      })),
  };
}
