import { useMemo, useState } from 'react';
import type { BattleState } from '@oml/engine';
import { BattleScreen } from './BattleScreen';
import { makeT, type Locale } from './i18n';
import { SetupScreen } from './SetupScreen';
import { clearBattle, loadBattle, loadLocale, saveLocale } from './storage';

export function App() {
  const [locale, setLocale] = useState<Locale>(loadLocale);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [saved, setSaved] = useState<BattleState | null>(loadBattle);
  const t = useMemo(() => makeT(locale), [locale]);

  const changeLocale = (l: Locale) => {
    setLocale(l);
    saveLocale(l);
    document.documentElement.lang = l;
  };

  if (battle) {
    return (
      <BattleScreen
        initial={battle}
        t={t}
        onExit={(stillRunning) => {
          setBattle(null);
          setSaved(stillRunning ? loadBattle() : null);
        }}
      />
    );
  }
  return (
    <SetupScreen
      t={t}
      locale={locale}
      onLocale={changeLocale}
      saved={saved}
      onStart={(state) => {
        clearBattle();
        setBattle(state);
      }}
      onResume={() => saved && setBattle(saved)}
    />
  );
}
