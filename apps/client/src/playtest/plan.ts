import { content, type Dex } from '@oml/data';
import { createBattle, createCreature, type BattleState, type SideConfig } from '@oml/engine';
import type { BattleKind } from '@oml/playtest';

export type Starter = 'fire' | 'water' | 'grove';
export const STARTERS: Starter[] = ['fire', 'water', 'grove'];
export const STARTER_SPECIES: Record<Starter, string> = {
  fire: 'gnistkat',
  water: 'aaodder',
  grove: 'boegling',
};

export interface PlanSlot {
  id: string;
  kind: BattleKind;
  /** Arena whose expected player team the tester uses. */
  arena: number;
  trainerId?: string;
  optional?: boolean;
}

/** Recommended Gate 2 order: 2 wild, 1 route trainer, arena 1 leader, (optional) arena 2 leader. */
export const SESSION_PLAN: PlanSlot[] = [
  { id: 'wild1', kind: 'wild', arena: 1 },
  { id: 'wild2', kind: 'wild', arena: 1 },
  { id: 'trainer1', kind: 'trainer', arena: 1, trainerId: 'trainer_fisher' },
  { id: 'leader1', kind: 'leader', arena: 1, trainerId: 'leader_folk' },
  { id: 'leader2', kind: 'leader', arena: 2, trainerId: 'leader_water', optional: true },
];

export const WILD_LEVELS: [number, number] = [8, 10];
/** Extra charms so wild battles can test catching (GDD rest-stop restock: 5 Basic Charms). */
export const PLAYTEST_CHARMS = { basic_charm: 5 };

/**
 * Species a tester can meet in the wild: everything except starter lines (catch rate 45)
 * and rares (30), i.e. catch rate ≥ 100: the commons and biome specials.
 */
export function wildPool(dex: Dex = content): string[] {
  return Object.values(dex.species)
    .filter((s) => s.catchRate >= 100)
    .map((s) => s.id);
}

export interface PlaytestBattle {
  state: BattleState;
  opponentId: string;
  opponentLevel: number | null;
}

/** Player side: the arena's expected player team with the tester's starter first. */
export function playerSide(arena: number, starter: Starter, dex: Dex = content): SideConfig {
  const preset = Object.values(dex.playerTeams).find((p) => p.arena === arena);
  if (!preset) throw new Error(`No player-team preset for arena ${arena}`);
  const members = [
    { speciesId: STARTER_SPECIES[starter], level: preset.starterLevel },
    ...preset.team,
  ];
  return {
    team: members.map((m, i) => createCreature(m.speciesId, m.level, `p${i}`, dex)),
    items: { ...preset.items, ...PLAYTEST_CHARMS },
    ai: null,
  };
}

/** Builds one playtest battle. `random` (0..1) picks the wild species, level and seed. */
export function buildPlaytestBattle(
  slot: PlanSlot,
  starter: Starter,
  random: () => number,
  dex: Dex = content,
): PlaytestBattle {
  const player = playerSide(slot.arena, starter, dex);
  const seed = Math.floor(random() * 2 ** 31);
  if (slot.kind === 'wild') {
    const pool = wildPool(dex);
    const speciesId = pool[Math.floor(random() * pool.length)]!;
    const [lo, hi] = WILD_LEVELS;
    const level = lo + Math.floor(random() * (hi - lo + 1));
    const state = createBattle(
      {
        kind: 'wild',
        sides: [player, { team: [createCreature(speciesId, level, 'w0', dex)], ai: 'wild' }],
      },
      seed,
      dex,
    );
    return { state, opponentId: speciesId, opponentLevel: level };
  }
  const trainer = dex.trainers[slot.trainerId ?? ''];
  if (!trainer) throw new Error(`Unknown trainer ${slot.trainerId}`);
  const opponent: SideConfig = {
    name: trainer.id,
    team: trainer.team.map((m, i) =>
      createCreature(m.speciesId, m.level, `o${i}`, dex, m.moves ? { moves: m.moves } : {}),
    ),
    items: { ...trainer.items },
    ai: trainer.tier,
  };
  const state = createBattle({ kind: trainer.tier, sides: [player, opponent] }, seed, dex);
  return { state, opponentId: trainer.id, opponentLevel: null };
}

/** Counts a player action into the per-battle counters (forced replacements are not switches). */
export interface ActionCounts {
  switches: number;
  itemsUsed: number;
  catchAttempts: number;
}

export function countAction(
  counts: ActionCounts,
  action: { type: string },
  replacing: boolean,
): ActionCounts {
  if (action.type === 'switch' && !replacing) return { ...counts, switches: counts.switches + 1 };
  if (action.type === 'item') return { ...counts, itemsUsed: counts.itemsUsed + 1 };
  if (action.type === 'catch') return { ...counts, catchAttempts: counts.catchAttempts + 1 };
  return counts;
}
