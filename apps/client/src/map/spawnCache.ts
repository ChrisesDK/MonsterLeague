import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval';
import type { SpawnList } from './spawnApi';

/**
 * Spawn lists cached in memory and IndexedDB until their window ends, so the map keeps
 * working without a connection for the rest of the window (GDD "On the phone" 5).
 */
let store: UseStore | null = null;
function idb(): UseStore | null {
  try {
    store ??= createStore('oml-spawns', 'lists');
    return store;
  } catch {
    return null;
  }
}

const memory = new Map<string, SpawnList>();
export const cacheKey = (cell: string, window: number) => `${cell}:${window}`;

export async function putList(list: SpawnList): Promise<void> {
  memory.set(cacheKey(list.cell, list.window), list);
  const s = idb();
  if (s) await set(cacheKey(list.cell, list.window), list, s).catch(() => undefined);
}

export async function getList(
  cell: string,
  window: number,
  nowSeconds: number,
): Promise<SpawnList | null> {
  const key = cacheKey(cell, window);
  let list = memory.get(key) ?? null;
  if (!list) {
    const s = idb();
    list = s ? ((await get<SpawnList>(key, s).catch(() => undefined)) ?? null) : null;
    if (list) memory.set(key, list);
  }
  return list && list.expiresAt > nowSeconds ? list : null;
}

/** Removes lists whose window has ended. */
export async function pruneLists(nowSeconds: number): Promise<void> {
  for (const [k, v] of memory) if (v.expiresAt <= nowSeconds) memory.delete(k);
  const s = idb();
  if (!s) return;
  try {
    for (const [k, v] of await entries<string, SpawnList>(s))
      if (v.expiresAt <= nowSeconds) await del(k, s);
  } catch {
    // IndexedDB unavailable (private mode): memory cache only.
  }
}

// Used spawns moved into the save (M2b, packages/game); the old key is migrated once.
