import { useEffect, useMemo, useRef, useState } from 'react';
import { coarseCellsAround } from './geo';
import {
  fetchSpawnList,
  serviceUrl,
  type ApiSpawn,
  type SpawnList,
  type WindowParam,
} from './spawnApi';
import { getList, pruneLists, putList } from './spawnCache';

export type SpawnStatus = 'not-configured' | 'waiting' | 'loading' | 'ok' | 'cached' | 'no-signal';

const WINDOW_S = 900;
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Current 15-minute window, re-evaluated every few seconds. */
export function useWindow(): number {
  const [w, setW] = useState(() => Math.floor(nowSeconds() / WINDOW_S));
  useEffect(() => {
    const id = setInterval(() => setW(Math.floor(nowSeconds() / WINDOW_S)), 5000);
    return () => clearInterval(id);
  }, []);
  return w;
}

/**
 * Spawns of the current window around the player: fetches the player's res-7 cell (plus a
 * neighbour near an edge) for the current and next window, caches them until they expire,
 * and falls back to the cache without a connection.
 */
export function useSpawns(position: { lat: number; lng: number } | null): {
  spawns: ApiSpawn[];
  status: SpawnStatus;
  window: number;
} {
  const base = serviceUrl();
  const window = useWindow();
  const [lists, setLists] = useState<Map<string, SpawnList>>(new Map());
  const [status, setStatus] = useState<SpawnStatus>(base ? 'waiting' : 'not-configured');
  const cellsKey = position ? coarseCellsAround(position).sort().join(',') : '';
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!base || !cellsKey) return;
    let alive = true;
    const cells = cellsKey.split(',');
    const now = nowSeconds();
    void pruneLists(now);
    (async () => {
      let anyFetched = false;
      let anyCached = false;
      let anyMissing = false;
      for (const cell of cells) {
        for (const [param, w] of [
          ['current', window],
          ['next', window + 1],
        ] as [WindowParam, number][]) {
          const key = `${cell}:${w}`;
          const cached = await getList(cell, w, now);
          if (cached) {
            anyCached = true;
            if (alive) setLists((m) => (m.get(key) === cached ? m : new Map(m).set(key, cached)));
            continue;
          }
          if (inFlight.current.has(key)) continue;
          inFlight.current.add(key);
          if (alive && param === 'current') setStatus((s) => (s === 'ok' ? s : 'loading'));
          try {
            const list = await fetchSpawnList(base, cell, param);
            await putList(list);
            anyFetched = true;
            if (alive) setLists((m) => new Map(m).set(`${list.cell}:${list.window}`, list));
          } catch {
            if (param === 'current') anyMissing = true;
          } finally {
            inFlight.current.delete(key);
          }
        }
      }
      if (!alive) return;
      if (anyFetched) setStatus('ok');
      else if (anyMissing) setStatus(anyCached ? 'cached' : 'no-signal');
      else if (anyCached)
        setStatus((s) => (s === 'no-signal' ? 'cached' : s === 'loading' ? 'ok' : s));
    })();
    return () => {
      alive = false;
    };
  }, [base, cellsKey, window]);

  const spawns = useMemo(() => {
    const out: ApiSpawn[] = [];
    for (const [key, list] of lists) {
      if (list.window === window && cellsKey.includes(key.split(':')[0]!)) out.push(...list.spawns);
    }
    return out;
  }, [lists, window, cellsKey]);

  return { spawns, status: position || !base ? status : 'waiting', window };
}
