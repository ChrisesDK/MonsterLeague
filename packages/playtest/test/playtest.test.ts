import { describe, expect, it } from 'vitest';
import {
  CSV_COLUMNS,
  mergeRecords,
  normaliseTesterCode,
  parseCsv,
  parseExport,
  pauseTimer,
  readTimer,
  restoreTimer,
  resumeTimer,
  startTimer,
  summarize,
  toCsv,
  toJson,
  type PlaytestRecord,
} from '../src/index';

const base: PlaytestRecord = {
  recordId: 'r1',
  testerCode: 'T03',
  sessionId: 's1',
  battleId: 'wild1',
  attempt: 1,
  kind: 'wild',
  opponentId: 'torvdue',
  opponentLevel: 9,
  starter: 'fire',
  startedAt: '2026-11-21T10:00:00.000Z',
  endedAt: '2026-11-21T10:03:00.000Z',
  activeMs: 95_000,
  turns: 7,
  result: 'p1',
  switches: 1,
  itemsUsed: 0,
  catchAttempts: 2,
  speed: 'normal',
  locale: 'da',
  appVersion: 'abc1234',
  rating: 4,
  length: 'about_right',
  comment: '',
};

describe('active timer', () => {
  it('excludes paused time', () => {
    let t = startTimer(1_000);
    expect(readTimer(t, 6_000)).toBe(5_000);
    t = pauseTimer(t, 6_000); // 5 s active
    expect(readTimer(t, 60_000)).toBe(5_000); // backgrounded for 54 s
    t = resumeTimer(t, 60_000);
    t = pauseTimer(t, 63_000); // +3 s
    expect(readTimer(t, 999_999)).toBe(8_000);
  });

  it('pause/resume are idempotent and never negative', () => {
    const t = startTimer(10_000);
    expect(resumeTimer(t, 20_000)).toBe(t);
    const p = pauseTimer(t, 12_000);
    expect(pauseTimer(p, 50_000)).toBe(p);
    expect(readTimer(startTimer(5_000), 1_000)).toBe(0); // clock went backwards
  });

  it('restoring a timer saved while running counts only up to the save', () => {
    const t = startTimer(0);
    const restored = restoreTimer(t, 30_000);
    expect(restored.runningSince).toBe(null);
    expect(readTimer(restored, 10_000_000)).toBe(30_000);
  });
});

describe('tester codes', () => {
  it('accepts short codes and rejects names/emails', () => {
    expect(normaliseTesterCode(' t03 ')).toBe('T03');
    expect(normaliseTesterCode('Anna Jensen')).toBe(null);
    expect(normaliseTesterCode('a@b.dk')).toBe(null);
    expect(normaliseTesterCode('')).toBe(null);
    expect(normaliseTesterCode('X'.repeat(13))).toBe(null);
  });
});

describe('export format', () => {
  const tricky: PlaytestRecord = {
    ...base,
    recordId: 'r2',
    kind: 'leader',
    opponentId: 'leader_folk',
    opponentLevel: null,
    rating: null,
    length: null,
    comment: 'Sjovt, men "lidt" langt,\nmed linjeskift',
  };
  const formula: PlaytestRecord = { ...base, recordId: 'r3', comment: '=HYPERLINK("x")' };

  it('JSON has a format header and round-trips', () => {
    const json = toJson([base, tricky], new Date('2026-11-21T12:00:00Z'));
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe('oml-gate2');
    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBe('2026-11-21T12:00:00.000Z');
    expect(parseExport(json)).toEqual([base, tricky]);
  });

  it('CSV has a fixed header, escapes quotes/commas/newlines and round-trips', () => {
    const csv = toCsv([base, tricky]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(csv).toContain('"Sjovt, men ""lidt"" langt,\nmed linjeskift"');
    expect(lines[1]).toBe(
      'r1,T03,s1,wild1,1,wild,torvdue,9,fire,2026-11-21T10:00:00.000Z,2026-11-21T10:03:00.000Z,95000,7,p1,1,0,2,normal,da,abc1234,4,about_right,',
    );
    expect(parseExport(csv)).toEqual([base, tricky]);
  });

  it('guards spreadsheet formulas in free text and restores them on import', () => {
    const csv = toCsv([formula]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(parseExport(csv)[0]!.comment).toBe('=HYPERLINK("x")');
  });

  it('never contains location fields', () => {
    const keys = Object.keys(JSON.parse(toJson([base], new Date())).records[0]);
    expect(keys.some((k) => /lat|lng|lon|location|coord|gps|position/i.test(k))).toBe(false);
  });

  it('rejects malformed files', () => {
    expect(() => parseExport('{"format":"other"}')).toThrow();
    expect(() => parseExport(`${CSV_COLUMNS.join(',')}\r\nonly,a,few`)).toThrow(/CSV row 2/);
    expect(parseCsv('a,b\r\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseExport('')).toEqual([]);
  });
});

describe('summary', () => {
  it('merges duplicates and reports medians, ratings and length answers', () => {
    const records: PlaytestRecord[] = [
      base,
      {
        ...base,
        recordId: 'r2',
        activeMs: 150_000,
        rating: 5,
        length: 'too_long',
        testerCode: 'T04',
        sessionId: 's2',
      },
      {
        ...base,
        recordId: 'r3',
        kind: 'leader',
        activeMs: 400_000,
        rating: 3,
        length: 'too_long',
        comment: 'long',
      },
      { ...base, recordId: 'r4', kind: 'trainer', activeMs: 100_000, rating: null, length: null },
    ];
    const merged = mergeRecords([records, [records[0]!]]);
    expect(merged).toHaveLength(4);
    const s = summarize(merged);
    expect(s.testers).toBe(2);
    expect(s.sessions).toBe(2);
    expect(s.byKind.wild.medianActiveMs).toBe(122_500);
    expect(s.byKind.wild.withinTarget).toBe(false); // 2:02 > 2:00
    expect(s.byKind.leader.withinTarget).toBe(true);
    expect(s.byKind.trainer.medianRating).toBe(null);
    expect(s.ratings).toEqual({ 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 });
    expect(s.unrated).toBe(1);
    expect(s.meanRating).toBe(4);
    expect(s.length).toEqual({ too_long: 2, about_right: 1, too_short: 0 });
    expect(s.comments).toEqual([
      { testerCode: 'T03', battleId: 'wild1', rating: 3, comment: 'long' },
    ]);
    expect(summarize([]).byKind.wild.medianActiveMs).toBe(null);
  });
});
