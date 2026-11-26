import { describe, expect, it } from 'vitest';
import { getStats } from '@oml/engine';
import { regions } from '@oml/data';
import {
  CAMPAIGN_KEYS,
  chooseStarter,
  givenIvs,
  loadSave,
  newSave,
  SHINY_RATE,
  startWildBattle,
  wildTraits,
} from '../src';

describe('IVs and shiny creatures', () => {
  it('a spawn gives the same creature every time for a player, another for another player', () => {
    expect(wildTraits('abc', 'spawn-1')).toEqual(wildTraits('abc', 'spawn-1'));
    const many = Array.from({ length: 50 }, (_, i) => JSON.stringify(wildTraits('abc', `s${i}`)));
    expect(new Set(many).size).toBeGreaterThan(40);
    expect(wildTraits('abc', 'spawn-1')).not.toEqual(wildTraits('xyz', 'spawn-1'));
  });

  it('IVs run 0–15 and shiny creatures come about once per SHINY_RATE', () => {
    let shiny = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const t = wildTraits('seed', `s${i}`);
      for (const v of Object.values(t.ivs)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(15);
      }
      if (t.shiny) shiny++;
    }
    expect(shiny / n).toBeGreaterThan(0.7 / SHINY_RATE);
    expect(shiny / n).toBeLessThan(1.3 / SHINY_RATE);
  });

  it('a wild battle and a starter use them; stats follow the IVs', () => {
    const save = chooseStarter({ ...newSave('feed'), onboarding: 'starter' }, 'gnistkat');
    expect(save.team[0]!.ivs).toEqual(givenIvs('feed', 'starter:odense'));
    const spawn = { id: 'x1', speciesId: 'mosling', level: 10, expiresAt: 9e9, district: 1 };
    const battle = startWildBattle(save, spawn, 1).battle!;
    const wild = battle.state.sides[1].team[0]!;
    expect(wild.ivs).toEqual(wildTraits('feed', 'x1').ivs);
    expect(wild.hp).toBe(getStats(wild, regions.odense).hp);
  });

  it('a Glimmer creature met in battle is noted for the field guide', () => {
    const save = chooseStarter({ ...newSave('feed'), onboarding: 'starter' }, 'gnistkat');
    let id = '';
    for (let i = 0; !id; i++) if (wildTraits('feed', `g${i}`).shiny) id = `g${i}`;
    const spawn = { id, speciesId: 'mosling', level: 10, expiresAt: 9e9, district: 1 };
    const after = startWildBattle(save, spawn, 1);
    expect(after.battle!.state.sides[1].team[0]!.shiny).toBe(true);
    expect(after.glimmerSeen).toEqual(['mosling']);
    const plain = { ...spawn, id: 'x1' };
    expect(startWildBattle(save, plain, 1).glimmerSeen).toEqual([]);
  });

  it('v11 saves gain an empty Glimmer list, in parked campaigns too', () => {
    const { glimmerSeen: _a, ...v11 } = newSave('feed');
    const camp = Object.fromEntries(
      CAMPAIGN_KEYS.filter((k) => k !== 'glimmerSeen').map((k) => [k, v11[k as keyof typeof v11]]),
    );
    const r = loadSave({ ...v11, version: 11, campaigns: { svendborg: camp } }, 'x');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.glimmerSeen).toEqual([]);
    expect(r.save.campaigns.svendborg?.glimmerSeen).toEqual([]);
  });
});
