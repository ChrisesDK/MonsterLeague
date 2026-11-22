import {
  endGate3,
  gate3Csv,
  gate3Json,
  newGate3Session,
  parseGate3,
  recordGate3,
  summarizeGate3,
  type Gate3Event,
  type Gate3Session,
} from '@oml/playtest';
import { describe, expect, it } from 'vitest';
import { formatGate3, loadGate3Files } from '../src/report';

function session(id: string, code: string, events: Gate3Event[], rating: number, comment = '') {
  let s = newGate3Session({
    sessionId: id,
    testerCode: code,
    startedAt: new Date('2026-12-01T10:00:00Z'),
    dark: id.endsWith('n'),
    locale: 'da',
    appVersion: 'test',
  });
  for (const e of events) s = recordGate3(s, e);
  return endGate3(s, new Date('2026-12-01T11:00:00Z'), rating, comment);
}

const walk: Gate3Event[] = [
  { type: 'distance', metres: 1200 },
  { type: 'spawnSeen' },
  { type: 'spawnSeen' },
  { type: 'spawnSeen' },
  { type: 'spawnSeen' },
  { type: 'spawnBattled' },
  { type: 'battle', kind: 'wild', won: true, activeMs: 90_000, turns: 6 },
  { type: 'catch' },
  { type: 'trainerBeaten' },
  { type: 'battle', kind: 'trainer', won: true, activeMs: 150_000, turns: 12 },
  { type: 'restVisit' },
  { type: 'battle', kind: 'leader', won: false, activeMs: 400_000, turns: 33 },
  { type: 'distance', metres: 1300.4 },
];

/** Keys that would be location data. */
const LOCATION_KEY = /^(lat|lng|lon|latitude|longitude|coords?|position|cell|h3|route|place)/i;

describe('Gate 3 sessions', () => {
  const a = session('s1', 'T01', walk, 4, 'Fun, "but" cold, by the lake');
  const b = session('s2n', 'T02', walk.slice(0, 7), 5);

  it('counts events; an ended session no longer changes', () => {
    expect(a.distanceM).toBe(2500);
    expect(a.spawnsSeen).toBe(4);
    expect(a.battlesWon).toBe(2);
    expect(a.battlesLost).toBe(1);
    expect(a.activeMs).toEqual({ wild: 90_000, trainer: 150_000, leader: 400_000 });
    expect(a.leaderTurns).toEqual([33]);
    expect(recordGate3(a, { type: 'catch' })).toBe(a);
  });

  it('round-trips through JSON and CSV', () => {
    expect(parseGate3(gate3Json([a, b], new Date()))).toEqual([a, b]);
    expect(parseGate3(gate3Csv([a, b]))).toEqual([a, b]);
  });

  it('exports contain no location data', () => {
    // a fixed export time: a real clock at hh:mm:55.xxx would match the coordinate pattern
    const at = new Date('2026-05-01T10:20:30.000Z');
    const file = JSON.parse(gate3Json([a, b], at)) as { sessions: Gate3Session[] };
    for (const s of file.sessions)
      for (const k of Object.keys(s)) expect(k).not.toMatch(LOCATION_KEY);
    const header = gate3Csv([a]).split('\n')[0]!.split(',');
    for (const k of header) expect(k).not.toMatch(LOCATION_KEY);
    // only counts and booleans besides ids, times, codes and the free comment
    expect(JSON.stringify(file)).not.toMatch(/55\.\d{3,}|10\.\d{4,}/);
  });

  it('summarises: median distance, metres per spawn, battles per km, ratings, comments', () => {
    const s = summarizeGate3([a, b]);
    expect(s.sessions).toBe(2);
    expect(s.darkSessions).toBe(1);
    expect(s.medianDistanceM).toBe(1850);
    expect(s.metresPerSpawn).toBeCloseTo(3700 / 8);
    expect(s.battlesPerKm).toBeCloseTo(4 / 3.7);
    expect(s.ratings).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 });
    expect(s.comments).toHaveLength(1);
    const text = formatGate3(s, 2);
    expect(text).toMatch(/median per session 1\.85 km/);
    expect(text).toMatch(/Metres per battle-able spawn: 463 m/);
    expect(text).toMatch(/T01.*cold/);
  });

  it('loads files, merges duplicates and reports bad files', () => {
    const r = loadGate3Files([
      { name: 'a.json', text: gate3Json([a], new Date()) },
      { name: 'a.csv', text: gate3Csv([a, b]) },
      { name: 'bad.json', text: '{"nope":1}' },
    ]);
    expect(r.sessions.map((s) => s.sessionId)).toEqual(['s1', 's2n']);
    expect(r.errors).toHaveLength(1);
  });
});
