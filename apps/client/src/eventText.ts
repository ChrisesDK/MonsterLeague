import type { BattleEvent, BattleState, CreatureInstance } from '@oml/engine';
import type { Translate } from './i18n';

export function creatureName(
  c: Pick<CreatureInstance, 'speciesId' | 'nickname'>,
  t: Translate,
): string {
  return c.nickname ?? t(`species.${c.speciesId}.name`);
}

/** One line of log text for an event, or null for events that only drive animation. */
export function eventText(event: BattleEvent, state: BattleState, t: Translate): string | null {
  const nameOf = (uid: string): string => {
    for (const side of state.sides) {
      const c = side.team.find((x) => x.uid === uid);
      if (c) return creatureName(c, t);
    }
    return uid;
  };
  switch (event.type) {
    case 'turn_start':
      return null;
    case 'move_used':
      return t('event.move_used', {
        name: nameOf(event.uid),
        move: t(`move.${event.moveId}.name`),
      });
    case 'cant_act':
      return t(`event.cant_act.${event.reason}`, { name: nameOf(event.uid) });
    case 'miss':
      return t('event.miss', { name: nameOf(event.uid) });
    case 'damage':
      return event.source === 'recoil'
        ? t('event.recoil', { name: nameOf(event.uid) })
        : t('event.damage', { name: nameOf(event.uid), amount: event.amount });
    case 'effectiveness':
      if (event.multiplier === 0) return t('event.effectiveness.0', { name: nameOf(event.uid) });
      return t(event.multiplier < 1 ? 'event.effectiveness.low' : 'event.effectiveness.high');
    case 'crit':
      return t('event.crit');
    case 'status_applied':
      return t('event.status_applied', {
        name: nameOf(event.uid),
        status: t(`status.${event.status}`),
      });
    case 'status_cured':
      return t('event.status_cured', {
        name: nameOf(event.uid),
        status: t(`status.${event.status}`),
      });
    case 'status_damage':
      return t('event.status_damage', {
        name: nameOf(event.uid),
        status: t(`status.${event.status}`),
      });
    case 'stat_change': {
      const dir = event.stages > 0 ? 'up' : event.stages < 0 ? 'down' : 'none';
      return t(`event.stat_change.${dir}`, {
        name: nameOf(event.uid),
        stat: t(`stat.${event.stat}`),
      });
    }
    case 'no_effect':
      return t('event.no_effect');
    case 'heal':
      return t('event.heal', { name: nameOf(event.uid), amount: event.amount });
    case 'faint':
      return t('event.faint', { name: nameOf(event.uid) });
    case 'switch':
      return t('event.switch', { name: nameOf(event.uid) });
    case 'item_used':
      return t('event.item_used', {
        item: t(`item.${event.itemId}.name`),
        name: nameOf(event.uid),
      });
    case 'catch_attempt': {
      const offer = t('event.catch_attempt', {
        item: t(`item.${event.itemId}.name`),
        chance: Math.round(event.chance * 100),
      });
      return event.success
        ? offer
        : `${offer} ${t('event.catch_failed', { name: nameOf(event.uid) })}`;
    }
    case 'caught':
      return t('event.caught', { name: nameOf(event.uid) });
    case 'ran':
      return t('event.ran');
    case 'xp_gain':
      return t('event.xp_gain', { name: nameOf(event.uid), amount: event.amount });
    case 'level_up':
      return t('event.level_up', { name: nameOf(event.uid), level: event.level });
    case 'move_learned':
      return t('event.move_learned', {
        name: nameOf(event.uid),
        move: t(`move.${event.moveId}.name`),
      });
    case 'move_learn_choice':
      return t('event.move_learn_choice', {
        name: nameOf(event.uid),
        move: t(`move.${event.moveId}.name`),
      });
    case 'evolution_ready':
      return t('event.evolution_ready', { name: nameOf(event.uid) });
    case 'needs_replacement':
      return event.side === 0 ? t('event.needs_replacement') : null;
    case 'battle_end':
      return t(`ui.result.${event.result}`);
  }
}
