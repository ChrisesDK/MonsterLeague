import { describe, expect, it } from 'vitest';
import { summarize, toCsv, toJson, type PlaytestRecord } from '@oml/playtest';
import { formatDuration, formatSummary, loadFiles } from '../src/report';

const rec = (
  id: string,
  kind: PlaytestRecord['kind'],
  activeMs: number,
  rating: number | null,
): PlaytestRecord => ({
  recordId: id,
  testerCode: 'T01',
  sessionId: 's1',
  battleId: `${kind}1`,
  attempt: 1,
  kind,
  opponentId: 'x',
  opponentLevel: null,
  starter: 'water',
  startedAt: '2026-11-21T10:00:00.000Z',
  endedAt: '2026-11-21T10:05:00.000Z',
  activeMs,
  turns: 10,
  result: 'p1',
  switches: 0,
  itemsUsed: 0,
  catchAttempts: 0,
  speed: 'fast',
  locale: 'en',
  appVersion: 'dev',
  rating,
  length: rating === 1 ? 'too_long' : 'about_right',
  comment: rating === 1 ? 'boring' : '',
});

describe('gate2 report', () => {
  it('merges JSON and CSV exports, dedupes, and reports bad files', () => {
    const a = [rec('a', 'wild', 60_000, 5), rec('b', 'leader', 600_000, 1)];
    const { records, errors } = loadFiles([
      { name: 't01.json', text: toJson(a, new Date()) },
      { name: 't01.csv', text: toCsv(a) },
      { name: 't02.csv', text: toCsv([rec('c', 'trainer', 120_000, 4)]) },
      { name: 'broken.json', text: '{nope' },
    ]);
    expect(records.map((r) => r.recordId).sort()).toEqual(['a', 'b', 'c']);
    expect(errors).toHaveLength(1);
    const text = formatSummary(summarize(records), 3);
    expect(text).toMatch(/wild\s+1:00\s+\(< 2:00\) ✓/);
    expect(text).toMatch(/leader\s+10:00\s+\(< 8:00\) ✗/);
    expect(text).toMatch(/too long 1 · about right 2 · too short 0/);
    expect(text).toMatch(/\[T01 leader1 ★1\] boring/);
  });

  it('formats durations', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(125_400)).toBe('2:05');
  });
});
