import type { StageStat, Status, TypeId } from '@oml/data';

export type { StageStat, Status, TypeId };

export type SideIndex = 0 | 1;
export type BattleKind = 'wild' | 'trainer' | 'leader';
export type AiTier = BattleKind;
export type BattleResult = 'ongoing' | 'p1' | 'p2' | 'caught' | 'ran';

export interface MoveSlot {
  moveId: string;
  pp: number;
}

export interface CreatureInstance {
  uid: string;
  speciesId: string;
  level: number;
  xp: number;
  hp: number;
  status: Status | null;
  /** Remaining sleep turns (only meaningful while asleep). */
  statusTurns: number;
  moves: MoveSlot[];
  nickname?: string;
}

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export type Stages = Record<StageStat, number>;

export interface Side {
  name?: string;
  team: CreatureInstance[];
  /** Index into `team` of the creature on the field. */
  active: number;
  /** Stat stages of the active creature; reset on switch. */
  stages: Stages;
  /** Bag: item id → count. */
  items: Record<string, number>;
  /** null = controlled by a human (needs explicit replacement choices). */
  ai: AiTier | null;
  gainsXp: boolean;
  needsReplacement: boolean;
  /** Number of items this side has used this battle. */
  itemsUsed: number;
  /** Failed run attempts this battle (each adds 25% to the next attempt). */
  runAttempts: number;
}

export interface BattleState {
  turn: number;
  rngState: number[];
  sides: [Side, Side];
  kind: BattleKind;
  result: BattleResult;
  /** creature uid → uids of opposing creatures that were on the field against it. */
  participation: Record<string, string[]>;
  /** Set when a wild creature was caught: where it goes after the battle. */
  caught?: { creature: CreatureInstance; destination: 'team' | 'storage' };
}

export interface SideConfig {
  name?: string;
  team: CreatureInstance[];
  items?: Record<string, number>;
  ai?: AiTier | null;
  /** Defaults to true for side 0 and false for side 1. */
  gainsXp?: boolean;
}

export interface BattleConfig {
  kind: BattleKind;
  sides: [SideConfig, SideConfig];
}

export type Action =
  | { type: 'move'; index: number }
  | { type: 'switch'; index: number }
  | { type: 'item'; itemId: string; target: number }
  | { type: 'run' }
  | { type: 'catch'; itemId: string }
  /** Only legal for the side that is waiting while the other side replaces a fainted creature. */
  | { type: 'pass' };

type Who = { side: SideIndex; uid: string };

export type BattleEvent =
  | { type: 'turn_start'; turn: number }
  | ({ type: 'move_used'; moveId: string } & Who)
  | ({ type: 'cant_act'; reason: 'sleep' | 'paralysis' } & Who)
  | ({ type: 'miss' } & Who)
  | ({
      type: 'damage';
      amount: number;
      hp: number;
      maxHp: number;
      source: 'move' | 'recoil';
    } & Who)
  | ({ type: 'effectiveness'; multiplier: number } & Who)
  | ({ type: 'crit' } & Who)
  | ({ type: 'status_applied'; status: Status } & Who)
  | ({ type: 'status_cured'; status: Status } & Who)
  | ({ type: 'status_damage'; status: Status; amount: number; hp: number; maxHp: number } & Who)
  | ({ type: 'stat_change'; stat: StageStat; stages: number; stage: number } & Who)
  | ({ type: 'no_effect' } & Who)
  | ({ type: 'heal'; amount: number; hp: number; maxHp: number } & Who)
  | ({ type: 'faint' } & Who)
  | { type: 'switch'; side: SideIndex; fromUid: string; uid: string; index: number }
  | ({ type: 'item_used'; itemId: string } & Who)
  | ({ type: 'catch_attempt'; itemId: string; chance: number; success: boolean } & Who)
  | ({ type: 'caught' } & Who)
  | { type: 'ran'; side: SideIndex }
  | { type: 'run_failed'; side: SideIndex; attempts: number }
  /** The player's team was full: the caught creature went to storage. */
  | ({ type: 'sent_to_storage' } & Who)
  | ({ type: 'xp_gain'; amount: number; xp: number } & Who)
  | ({ type: 'level_up'; level: number; hp: number; maxHp: number } & Who)
  /** `replaced` = the move an AI side forgot to make room (auto-learn). */
  | ({ type: 'move_learned'; moveId: string; replaced?: string } & Who)
  | ({ type: 'move_learn_choice'; moveId: string } & Who)
  | ({ type: 'evolution_ready'; speciesId: string; into: string } & Who)
  | { type: 'needs_replacement'; side: SideIndex }
  | { type: 'battle_end'; result: Exclude<BattleResult, 'ongoing'> };

export interface TurnResult {
  state: BattleState;
  events: BattleEvent[];
}
