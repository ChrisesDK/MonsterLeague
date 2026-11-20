import { content, type Dex } from '@oml/data';
import {
  createBattle,
  createCreature,
  type BattleConfig,
  type BattleState,
  type SideConfig,
} from '@oml/engine';

/** `species:<id>` or `trainer:<id>` for the player; `wild:<id>` or `trainer:<id>` for the opponent. */
export interface SetupChoice {
  player: string;
  playerLevel: number;
  opponent: string;
  opponentLevel: number;
  seed: number;
}

export const PLAYER_BAG: Record<string, number> = {
  small_tonic: 3,
  large_tonic: 1,
  clear_drops: 2,
  basic_charm: 5,
  good_charm: 2,
  great_charm: 1,
  revive_leaf: 1,
};

function trainerSide(
  id: string,
  prefix: string,
  dex: Dex,
): SideConfig & { tier: 'trainer' | 'leader' } {
  const trainer = dex.trainers[id];
  if (!trainer) throw new Error(`Unknown trainer ${id}`);
  return {
    name: trainer.id,
    tier: trainer.tier,
    team: trainer.team.map((m, i) =>
      createCreature(m.speciesId, m.level, `${prefix}${i}`, dex, m.moves ? { moves: m.moves } : {}),
    ),
    items: { ...trainer.items },
  };
}

export function buildConfig(choice: SetupChoice, dex: Dex = content): BattleConfig {
  const [pKind, pId = ''] = choice.player.split(':');
  const [oKind, oId = ''] = choice.opponent.split(':');

  const player: SideConfig =
    pKind === 'trainer'
      ? { team: trainerSide(pId, 'p', dex).team }
      : { team: [createCreature(pId, choice.playerLevel, 'p0', dex)] };
  player.items = { ...PLAYER_BAG };
  player.ai = null;

  if (oKind === 'wild') {
    return {
      kind: 'wild',
      sides: [player, { team: [createCreature(oId, choice.opponentLevel, 'o0', dex)], ai: 'wild' }],
    };
  }
  const { tier, ...opponent } = trainerSide(oId, 'o', dex);
  return { kind: tier, sides: [player, { ...opponent, ai: tier }] };
}

export function startBattle(choice: SetupChoice, dex: Dex = content): BattleState {
  return createBattle(buildConfig(choice, dex), choice.seed, dex);
}
