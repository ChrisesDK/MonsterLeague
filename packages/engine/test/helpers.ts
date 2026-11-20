import { content, type Dex, type Move } from '@oml/data';
import {
  createBattle,
  createCreature,
  resolveTurn,
  type Action,
  type BattleKind,
  type BattleState,
  type CreatureInstance,
  type SideConfig,
} from '../src/index';
import { clone } from '../src/util';

const testMoves: Move[] = [
  { id: 't_strike', type: 'folk', power: 40, accuracy: null, pp: 30, priority: 0, effects: [] },
  { id: 't_big', type: 'folk', power: 250, accuracy: null, pp: 30, priority: 0, effects: [] },
  { id: 't_miss', type: 'folk', power: 40, accuracy: 1, pp: 30, priority: 0, effects: [] },
  { id: 't_half', type: 'folk', power: 40, accuracy: 50, pp: 30, priority: 0, effects: [] },
  { id: 't_quick', type: 'folk', power: 10, accuracy: null, pp: 30, priority: 1, effects: [] },
  { id: 't_slow', type: 'folk', power: 10, accuracy: null, pp: 30, priority: -1, effects: [] },
  {
    id: 't_wait',
    type: 'folk',
    power: 0,
    accuracy: null,
    pp: 30,
    priority: 0,
    effects: [{ kind: 'stat', target: 'self', stat: 'def', stages: 0, chance: 100 }],
  },
  {
    id: 't_burn',
    type: 'fire',
    power: 0,
    accuracy: null,
    pp: 30,
    priority: 0,
    effects: [{ kind: 'status', status: 'burn', chance: 100 }],
  },
  {
    id: 't_poison',
    type: 'spirit',
    power: 0,
    accuracy: null,
    pp: 30,
    priority: 0,
    effects: [{ kind: 'status', status: 'poison', chance: 100 }],
  },
  {
    id: 't_sleep',
    type: 'folk',
    power: 0,
    accuracy: null,
    pp: 30,
    priority: 1,
    effects: [{ kind: 'status', status: 'sleep', chance: 100 }],
  },
  {
    id: 't_para',
    type: 'storm',
    power: 0,
    accuracy: null,
    pp: 30,
    priority: 1,
    effects: [{ kind: 'status', status: 'paralysis', chance: 100 }],
  },
  {
    id: 't_atk_up',
    type: 'fire',
    power: 0,
    accuracy: null,
    pp: 30,
    priority: 0,
    effects: [{ kind: 'stat', target: 'self', stat: 'atk', stages: 2, chance: 100 }],
  },
  {
    id: 't_spd_down',
    type: 'folk',
    power: 0,
    accuracy: null,
    pp: 30,
    priority: 0,
    effects: [{ kind: 'stat', target: 'target', stat: 'spd', stages: -6, chance: 100 }],
  },
  {
    id: 't_heal',
    type: 'folk',
    power: 0,
    accuracy: null,
    pp: 30,
    priority: 0,
    effects: [{ kind: 'heal', percent: 50 }],
  },
  {
    id: 't_recoil',
    type: 'folk',
    power: 80,
    accuracy: null,
    pp: 30,
    priority: 0,
    effects: [{ kind: 'recoil', percent: 50 }],
  },
  { id: 't_one_pp', type: 'folk', power: 40, accuracy: null, pp: 1, priority: 0, effects: [] },
  { id: 't_fire', type: 'fire', power: 40, accuracy: null, pp: 30, priority: 0, effects: [] },
];

/** Default content plus deterministic test-only moves. */
export const dex: Dex = (() => {
  const d = clone(content);
  for (const m of testMoves) d.moves[m.id] = m;
  return d;
})();

let uidCounter = 0;
export function mk(
  speciesId: string,
  level: number,
  moves: string[] = ['t_strike'],
  patch: Partial<CreatureInstance> = {},
): CreatureInstance {
  uidCounter += 1;
  return {
    ...createCreature(speciesId, level, `${speciesId}#${uidCounter}`, dex, { moves }),
    ...patch,
  };
}

export function battle(
  a: CreatureInstance[] | SideConfig,
  b: CreatureInstance[] | SideConfig,
  kind: BattleKind = 'trainer',
  seed = 1,
): BattleState {
  const side = (x: CreatureInstance[] | SideConfig, ai: SideConfig['ai']): SideConfig =>
    Array.isArray(x) ? { team: x, ai } : x;
  return createBattle({ kind, sides: [side(a, null), side(b, kind)] }, seed, dex);
}

export const move = (index = 0): Action => ({ type: 'move', index });
export const sw = (index: number): Action => ({ type: 'switch', index });
export const pass: Action = { type: 'pass' };

export function turn(state: BattleState, a: Action, b: Action) {
  return resolveTurn(state, [a, b], dex);
}

/** Runs `fn` for seeds 1..n and returns the results. */
export function seeds<T>(n: number, fn: (seed: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => fn(i + 1));
}
