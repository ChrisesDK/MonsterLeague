import { content, type Dex } from '@oml/data';
import {
  getMaxHp,
  type BattleEvent,
  type BattleState,
  type CreatureInstance,
  type SideIndex,
  type Status,
} from '@oml/engine';

/** What the battle screen shows for one side's active creature. */
export interface CreatureView {
  uid: string;
  speciesId: string;
  nickname?: string;
  level: number;
  hp: number;
  maxHp: number;
  status: Status | null;
  fainted: boolean;
  caught: boolean;
  shiny: boolean;
}

export type BattleView = [CreatureView, CreatureView];

function toView(c: CreatureInstance, dex: Dex): CreatureView {
  return {
    uid: c.uid,
    speciesId: c.speciesId,
    ...(c.nickname ? { nickname: c.nickname } : {}),
    level: c.level,
    hp: c.hp,
    maxHp: getMaxHp(c, dex),
    status: c.status,
    fainted: c.hp <= 0,
    caught: false,
    shiny: c.shiny === true,
  };
}

export function viewFromState(state: BattleState, dex: Dex = content): BattleView {
  return [0, 1].map((i) => {
    const side = state.sides[i as SideIndex];
    return toView(side.team[side.active]!, dex);
  }) as BattleView;
}

/**
 * Applies one engine event to the displayed view. It only copies values the engine put in
 * the event (HP, status, level…); it never calculates battle outcomes itself.
 * `teamState` is the state *before* the turn, used to look up creatures that switch in.
 */
export function applyEvent(
  view: BattleView,
  event: BattleEvent,
  teamState: BattleState,
  dex: Dex = content,
): BattleView {
  const next = [{ ...view[0] }, { ...view[1] }] as BattleView;
  const target = 'side' in event && 'uid' in event ? next[event.side] : null;
  const matches = target !== null && 'uid' in event && target.uid === event.uid;
  switch (event.type) {
    case 'damage':
    case 'status_damage':
    case 'heal':
      if (matches) {
        target.hp = event.hp;
        target.maxHp = event.maxHp;
        target.fainted = event.hp <= 0;
      }
      break;
    case 'level_up':
      if (matches) {
        target.level = event.level;
        target.hp = event.hp;
        target.maxHp = event.maxHp;
      }
      break;
    case 'status_applied':
      if (matches) target.status = event.status;
      break;
    case 'status_cured':
      if (matches) target.status = null;
      break;
    case 'faint':
      if (matches) target.fainted = true;
      break;
    case 'caught':
      if (matches) target.caught = true;
      break;
    case 'switch': {
      const creature = teamState.sides[event.side].team.find((c) => c.uid === event.uid);
      if (creature) next[event.side] = toView(creature, dex);
      break;
    }
    default:
      break;
  }
  return next;
}
