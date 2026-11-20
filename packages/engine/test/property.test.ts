import fc from 'fast-check';
import { content } from '@oml/data';
import { describe, expect, it } from 'vitest';
import {
  chooseAiAction,
  createBattle,
  createCreature,
  getLegalActions,
  getMaxHp,
  resolveTurn,
  type Action,
  type AiTier,
  type BattleConfig,
  type BattleKind,
  type BattleState,
} from '../src/index';
import { Rng, seedRng } from '../src/rng';

const speciesIds = Object.keys(content.species);

const creatureArb = fc.record({
  speciesId: fc.constantFrom(...speciesIds),
  level: fc.integer({ min: 1, max: 60 }),
});

const configArb = fc
  .record({
    kind: fc.constantFrom<BattleKind>('wild', 'trainer', 'leader'),
    a: fc.array(creatureArb, { minLength: 1, maxLength: 3 }),
    b: fc.array(creatureArb, { minLength: 1, maxLength: 3 }),
    humanA: fc.boolean(),
    seed: fc.integer(),
    policySeed: fc.integer(),
  })
  .map(({ kind, a, b, humanA, seed, policySeed }) => {
    const team = (list: typeof a, prefix: string) =>
      list.map((c, i) => createCreature(c.speciesId, c.level, `${prefix}${i}`));
    const config: BattleConfig = {
      kind,
      sides: [
        {
          team: team(a, 'a'),
          items: { small_tonic: 2, clear_drops: 1, basic_charm: 3 },
          ai: humanA ? null : kind,
        },
        {
          team: team(kind === 'wild' ? b.slice(0, 1) : b, 'b'),
          items: { large_tonic: 2 },
          ai: kind,
        },
      ],
    };
    return { config, seed, policySeed };
  });

type Policy = (state: BattleState, side: 0 | 1, rng: Rng) => Action;
const randomPolicy: Policy = (state, side, rng) => rng.pick(getLegalActions(state, side));
const aiPolicy: Policy = (state, side) => chooseAiAction(state, side, state.kind as AiTier);

function play(
  config: BattleConfig,
  seed: number,
  policySeed: number,
  policy: Policy,
  check?: (s: BattleState) => void,
) {
  let state = createBattle(config, seed);
  const rng = new Rng(seedRng(policySeed));
  const log: Action[][] = [];
  let steps = 0;
  while (state.result === 'ongoing') {
    const actions: [Action, Action] = [policy(state, 0, rng), policy(state, 1, rng)];
    log.push(actions);
    state = resolveTurn(state, actions).state;
    check?.(state);
    if (++steps > 2000) throw new Error('battle did not terminate');
  }
  return { state, log };
}

const hpInBounds = (s: BattleState) => {
  for (const side of s.sides)
    for (const c of side.team) {
      expect(c.hp).toBeGreaterThanOrEqual(0);
      expect(c.hp).toBeLessThanOrEqual(getMaxHp(c));
      expect(Number.isInteger(c.hp)).toBe(true);
    }
};

describe('engine properties', () => {
  it('random legal actions never throw and HP stays within 0..max', () => {
    fc.assert(
      fc.property(configArb, ({ config, seed, policySeed }) => {
        play(config, seed, policySeed, randomPolicy, hpInBounds);
      }),
      { numRuns: 150 },
    );
  });

  it('a battle always ends within 500 turns (random and AI policies)', () => {
    fc.assert(
      fc.property(configArb, fc.boolean(), ({ config, seed, policySeed }, useAi) => {
        const { state } = play(config, seed, policySeed, useAi ? aiPolicy : randomPolicy);
        expect(state.turn).toBeLessThanOrEqual(500);
        expect(state.result).not.toBe('ongoing');
      }),
      { numRuns: 150 },
    );
  });

  it('same seed + actions give identical results (determinism)', () => {
    fc.assert(
      fc.property(configArb, ({ config, seed, policySeed }) => {
        const first = play(config, seed, policySeed, randomPolicy);
        let state = createBattle(config, seed);
        const events: unknown[] = [];
        for (const actions of first.log) {
          const r = resolveTurn(state, actions as [Action, Action]);
          events.push(r.events);
          state = r.state;
        }
        expect(state).toEqual(first.state);
        // And once more to compare events.
        let again = createBattle(config, seed);
        const events2: unknown[] = [];
        for (const actions of first.log) {
          const r = resolveTurn(again, actions as [Action, Action]);
          events2.push(r.events);
          again = r.state;
        }
        expect(events2).toEqual(events);
      }),
      { numRuns: 60 },
    );
  });

  it('resolveTurn never mutates its input and state survives JSON round-trips', () => {
    fc.assert(
      fc.property(configArb, ({ config, seed, policySeed }) => {
        let state = createBattle(config, seed);
        const rng = new Rng(seedRng(policySeed));
        for (let i = 0; i < 30 && state.result === 'ongoing'; i++) {
          const snapshot = JSON.stringify(state);
          const actions: [Action, Action] = [
            randomPolicy(state, 0, rng),
            randomPolicy(state, 1, rng),
          ];
          const a = resolveTurn(state, actions);
          expect(JSON.stringify(state)).toBe(snapshot);
          const b = resolveTurn(JSON.parse(snapshot) as BattleState, actions);
          expect(b).toEqual(a);
          state = a.state;
        }
      }),
      { numRuns: 60 },
    );
  });
});
