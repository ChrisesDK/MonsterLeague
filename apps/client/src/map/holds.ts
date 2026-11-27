/**
 * The personal hold (owner: a creature seen with five minutes left still vanished on the
 * walk there). A creature that comes within SHOW_RADIUS_M (it appears on the map) is held for
 * this player for HOLD_SECONDS from that moment, even past its shared life; it is let go when
 * the player is more than RELEASE_M away, when its hold runs out, or once it was battled (the
 * map leaves used spawns out anyway). At most MAX_HOLDS at a time: the oldest go first.
 *
 * Only on the phone: in memory and in the spawn cache (IndexedDB, like the spawn lists, which
 * hold creature positions, never the player's). Never in the save, never sent. Other players
 * see the shared creatures as before; a hold only lengthens a creature for this player.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createStore, get, set, type UseStore } from 'idb-keyval';
import type { RegionId } from '@oml/data';
import { distanceM } from '@oml/game';
import { SHOW_RADIUS_M } from './geo';
import type { ApiSpawn } from './spawnApi';

export const HOLD_SECONDS = 30 * 60;
/** Owner: walked well away (twice the 200 m a creature is drawn at) lets the hold go. */
export const RELEASE_M = 400;
export const MAX_HOLDS = 10;

export interface Hold {
  spawn: ApiSpawn;
  region: RegionId;
  /** When it first came within reach of the map (unix seconds). */
  since: number;
  /** Held until (unix seconds). */
  until: number;
}

/**
 * The holds after a look at the map: new ones for spawns now within SHOW_RADIUS_M, minus
 * those run out, too far away or of another region; the newest MAX_HOLDS. Same array when
 * nothing changed.
 */
export function updateHolds(
  holds: readonly Hold[],
  spawns: readonly ApiSpawn[],
  at: { lat: number; lng: number } | null,
  region: RegionId,
  now: number,
): readonly Hold[] {
  let changed = false;
  let next = holds.filter((h) => {
    const keep =
      h.region === region && h.until > now && (!at || distanceM(at, h.spawn) <= RELEASE_M);
    if (!keep) changed = true;
    return keep;
  });
  if (at) {
    const held = new Set(next.map((h) => h.spawn.id));
    for (const s of spawns) {
      if (held.has(s.id) || s.expiresAt <= now || distanceM(at, s) > SHOW_RADIUS_M) continue;
      next = [...next, { spawn: s, region, since: now, until: now + HOLD_SECONDS }];
      held.add(s.id);
      changed = true;
    }
  }
  if (next.length > MAX_HOLDS) {
    next = [...next].sort((a, b) => b.since - a.since).slice(0, MAX_HOLDS);
    changed = true;
  }
  return changed ? next : holds;
}

/** The spawns to show: the shared ones plus those held, each living at least to its hold. */
export function withHolds(spawns: readonly ApiSpawn[], holds: readonly Hold[]): ApiSpawn[] {
  const byId = new Map(spawns.map((s) => [s.id, s]));
  for (const h of holds) {
    const s = byId.get(h.spawn.id) ?? h.spawn;
    byId.set(s.id, { ...s, expiresAt: Math.max(s.expiresAt, h.until) });
  }
  return [...byId.values()];
}

let store: UseStore | null = null;
function idb(): UseStore | null {
  try {
    store ??= createStore('oml-holds', 'holds');
    return store;
  } catch {
    return null;
  }
}
const KEY = 'holds';

/** The shared spawns plus this player's held ones (see above). */
export function useHeldSpawns(
  spawns: readonly ApiSpawn[],
  position: { lat: number; lng: number } | null,
  region: RegionId,
): ApiSpawn[] {
  const [holds, setHolds] = useState<readonly Hold[]>([]);
  const loaded = useRef(false);
  // the holds survive closing the app (a walk with the phone in a pocket)
  useEffect(() => {
    const s = idb();
    if (!s) {
      loaded.current = true;
      return;
    }
    void get<Hold[]>(KEY, s)
      .then((h) => {
        if (h?.length) setHolds((cur) => (cur.length ? cur : h));
      })
      .catch(() => undefined)
      .finally(() => (loaded.current = true));
  }, []);
  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    setHolds((cur) => updateHolds(cur, spawns, position, region, now));
  }, [spawns, position, region]);
  useEffect(() => {
    const s = idb();
    if (s && loaded.current) void set(KEY, holds, s).catch(() => undefined);
  }, [holds]);
  return useMemo(() => withHolds(spawns, holds), [spawns, holds]);
}
