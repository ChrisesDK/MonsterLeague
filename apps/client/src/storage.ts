import type { BattleState } from '@oml/engine';
import type { Locale } from './i18n';

const BATTLE_KEY = 'oml.battle.v1';
const LOCALE_KEY = 'oml.locale';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function saveBattle(state: BattleState): void {
  safe(() => localStorage.setItem(BATTLE_KEY, JSON.stringify(state)), undefined);
}

export function loadBattle(): BattleState | null {
  return safe(() => {
    const raw = localStorage.getItem(BATTLE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as BattleState;
    return state.result === 'ongoing' && Array.isArray(state.sides) ? state : null;
  }, null);
}

export function clearBattle(): void {
  safe(() => localStorage.removeItem(BATTLE_KEY), undefined);
}

export function loadLocale(): Locale {
  return safe(() => (localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'da'), 'da');
}

export function saveLocale(locale: Locale): void {
  safe(() => localStorage.setItem(LOCALE_KEY, locale), undefined);
}
