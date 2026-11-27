import { describe, expect, it } from 'vitest';
import { HOLD_SECONDS, MAX_HOLDS, RELEASE_M, updateHolds, withHolds } from '../src/map/holds';
import type { ApiSpawn } from '../src/map/spawnApi';

const HERE = { lat: 55.4, lng: 10.39 };
const north = (m: number) => ({ lat: HERE.lat + m / 110_540, lng: HERE.lng });
const spawn = (id: string, m: number, expiresAt: number): ApiSpawn => ({
  id,
  speciesId: 'mosbille',
  rarity: 'common',
  levelRoll: 0.5,
  district: 1,
  cellId: 'x',
  ...north(m),
  requires: null,
  window: 0,
  expiresAt,
});

describe('personal hold (owner: a creature seen should wait for the walk there)', () => {
  const now = 1_000_000;
  it('holds what comes within 200 m, for 30 minutes, even past its shared life', () => {
    const near = spawn('near', 150, now + 300); // 5 minutes left
    const far = spawn('far', 400, now + 300);
    const holds = updateHolds([], [near, far], HERE, 'odense', now);
    expect(holds.map((h) => h.spawn.id)).toEqual(['near']);
    // the shared list dropped it: still shown, living to the end of the hold
    const later = now + 20 * 60;
    const kept = updateHolds(holds, [], HERE, 'odense', later);
    const shown = withHolds([], kept);
    expect(shown.map((s) => s.id)).toEqual(['near']);
    expect(shown[0]!.expiresAt).toBe(now + HOLD_SECONDS);
    // and gone when the hold runs out
    expect(updateHolds(kept, [], HERE, 'odense', now + HOLD_SECONDS + 1)).toEqual([]);
  });
  it('lets go when the player is far away, or in another region', () => {
    const holds = updateHolds([], [spawn('a', 100, now + 900)], HERE, 'odense', now);
    expect(updateHolds(holds, [], north(100 + RELEASE_M + 50), 'odense', now + 60)).toEqual([]);
    expect(updateHolds(holds, [], HERE, 'svendborg', now + 60)).toEqual([]);
  });
  it('keeps at most MAX_HOLDS, the newest; same array when nothing changes', () => {
    let holds = updateHolds([], [], HERE, 'odense', now);
    for (let i = 0; i < MAX_HOLDS + 3; i++)
      holds = updateHolds(holds, [spawn(`s${i}`, 50, now + 3600)], HERE, 'odense', now + i);
    expect(holds).toHaveLength(MAX_HOLDS);
    expect(holds.some((h) => h.spawn.id === 's0')).toBe(false);
    expect(updateHolds(holds, [], HERE, 'odense', now + 20)).toBe(holds);
  });
});
