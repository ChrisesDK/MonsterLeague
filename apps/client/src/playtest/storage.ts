import type { BattleState } from '@oml/engine';
import type { ActiveTimer, PlaytestRecord } from '@oml/playtest';
import type { Locale } from '../i18n';
import type { Speed } from '../BattleScreen';
import type { ActionCounts, Starter } from './plan';

/** One tester's session on this phone. */
export interface Session {
  testerCode: string;
  sessionId: string;
  starter: Starter;
  speed: Speed;
  locale: Locale;
}

/** A battle in progress (paused or interrupted), so it can be resumed exactly. */
export interface ActiveBattle {
  slotId: string;
  attempt: number;
  opponentId: string;
  opponentLevel: number | null;
  startedAt: string;
  state: BattleState;
  timer: ActiveTimer;
  counts: ActionCounts;
  savedAt: number;
}

const KEYS = {
  session: 'oml.playtest.session.v1',
  records: 'oml.playtest.records.v1',
  active: 'oml.playtest.active.v1',
} as const;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the session keeps working in memory.
  }
}

export const loadSession = () => read<Session>(KEYS.session);
export const saveSession = (s: Session | null) => write(KEYS.session, s);
export const loadRecords = () => read<PlaytestRecord[]>(KEYS.records) ?? [];
export const saveRecords = (r: PlaytestRecord[]) => write(KEYS.records, r);
export const loadActive = () => read<ActiveBattle>(KEYS.active);
export const saveActive = (a: ActiveBattle | null) => write(KEYS.active, a);

/** "Delete my results": records, the session and any battle in progress. */
export function deleteAllPlaytestData(): void {
  write(KEYS.records, null);
  write(KEYS.session, null);
  write(KEYS.active, null);
}
