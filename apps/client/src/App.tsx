import { useEffect, useMemo, useState } from 'react';
import type { BattleState } from '@oml/engine';
import { BattleScreen } from './BattleScreen';
import { makeT, type Locale } from './i18n';
import { PlaytestApp } from './playtest/PlaytestApp';
import { SetupScreen } from './SetupScreen';
import { clearBattle, loadBattle, loadLocale, saveBattle, saveLocale } from './storage';

/** `#/dev` opens the developer battle page; everything else is Gate 2 playtest mode. */
function useRoute(): 'dev' | 'playtest' {
  const read = (): 'dev' | 'playtest' =>
    window.location.hash.startsWith('#/dev') ? 'dev' : 'playtest';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onHash = () => setRoute(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

export function App() {
  const [locale, setLocale] = useState<Locale>(loadLocale);
  const t = useMemo(() => makeT(locale), [locale]);
  const route = useRoute();

  const changeLocale = (l: Locale) => {
    setLocale(l);
    saveLocale(l);
    document.documentElement.lang = l;
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  if (route === 'dev') return <DevBattlePage t={t} locale={locale} onLocale={changeLocale} />;
  return <PlaytestApp t={t} locale={locale} onLocale={changeLocale} />;
}

function DevBattlePage({
  t,
  locale,
  onLocale,
}: {
  t: ReturnType<typeof makeT>;
  locale: Locale;
  onLocale: (l: Locale) => void;
}) {
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [saved, setSaved] = useState<BattleState | null>(loadBattle);

  if (battle) {
    return (
      <BattleScreen
        initial={battle}
        t={t}
        onSave={saveBattle}
        onExit={(stillRunning) => {
          if (!stillRunning) clearBattle();
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
      onLocale={onLocale}
      saved={saved}
      onStart={(state) => {
        clearBattle();
        setBattle(state);
      }}
      onResume={() => saved && setBattle(saved)}
    />
  );
}
