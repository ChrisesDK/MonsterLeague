import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BattleState } from '@oml/engine';
import { BattleScreen } from './BattleScreen';
import { makeT, type Locale } from './i18n';
import { PlaytestApp } from './playtest/PlaytestApp';
import { SetupScreen } from './SetupScreen';
import { clearBattle, loadBattle, loadLocale, saveBattle, saveLocale } from './storage';
import { installBackGuard } from './ui/backGuard';
import { Modal } from './ui/components';

// The map pulls in MapLibre; load it only when a map route is opened.
const GameApp = lazy(() => import('./game/GameApp').then((m) => ({ default: m.GameApp })));
const BiomeDebug = lazy(() => import('./map/BiomeDebug').then((m) => ({ default: m.BiomeDebug })));

type Route = 'map' | 'playtest' | 'dev' | 'dev-map' | 'dev-biomes';

/**
 * Hash routes: #/ map game · #/playtest Gate 2 playtest · #/dev battle test page ·
 * #/dev/map map with GPS simulator · #/dev/biomes biome debug view.
 */
export function routeOf(hash: string): Route {
  const h = hash.replace(/^#/, '');
  if (h.startsWith('/playtest')) return 'playtest';
  if (h.startsWith('/dev/map')) return 'dev-map';
  if (h.startsWith('/dev/biomes')) return 'dev-biomes';
  if (h.startsWith('/dev')) return 'dev';
  return 'map';
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => routeOf(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(routeOf(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

export function App() {
  const [locale, setLocale] = useState<Locale>(loadLocale);
  const t = useMemo(() => makeT(locale), [locale]);
  const route = useRoute();

  const changeLocale = useCallback((l: Locale) => {
    setLocale(l);
    saveLocale(l);
    document.documentElement.lang = l;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <>
      <Routes route={route} t={t} locale={locale} onLocale={changeLocale} />
      <LeaveGuard t={t} />
    </>
  );
}

/** Asks before a back gesture leaves the site or closes the installed app (backGuard.ts). */
function LeaveGuard({ t }: { t: ReturnType<typeof makeT> }) {
  const [asking, setAsking] = useState(false);
  const guard = useRef<ReturnType<typeof installBackGuard> | null>(null);
  useEffect(() => {
    let forceInstalled = false;
    try {
      // E2E only: run the installed-app version in a normal browser tab
      forceInstalled = localStorage.getItem('oml.e2e.installed') === '1';
    } catch {
      // storage blocked
    }
    const g = installBackGuard(window, () => setAsking(true), {
      onCannotLeave: () => setAsking(false),
      forceInstalled,
    });
    guard.current = g;
    document.documentElement.dataset.backGuard = g.mode;
    return () => g.dispose();
  }, []);
  if (!asking) return null;
  return (
    <Modal
      title={t('leave.title')}
      testId="leave-guard"
      className="leave-guard"
      actions={
        <>
          <button
            className="btn primary wide"
            data-testid="leave-stay"
            autoFocus
            onClick={() => {
              guard.current?.stay();
              setAsking(false);
            }}
          >
            {t('leave.stay')}
          </button>
          <button
            className="btn wide"
            data-testid="leave-go"
            onClick={() => guard.current?.leave()}
          >
            {t('leave.leave')}
          </button>
        </>
      }
    >
      <p>{t('leave.body')}</p>
    </Modal>
  );
}

function Routes({
  route,
  t,
  locale,
  onLocale: changeLocale,
}: {
  route: Route;
  t: ReturnType<typeof makeT>;
  locale: Locale;
  onLocale: (l: Locale) => void;
}) {
  if (route === 'playtest') return <PlaytestApp t={t} locale={locale} onLocale={changeLocale} />;
  if (route === 'dev') return <DevBattlePage t={t} locale={locale} onLocale={changeLocale} />;
  return (
    <Suspense fallback={<main className="setup" />}>
      {route === 'dev-biomes' ? (
        <BiomeDebug t={t} />
      ) : (
        <GameApp
          key={route}
          t={t}
          locale={locale}
          onLocale={changeLocale}
          devTools={route === 'dev-map' || import.meta.env.DEV}
        />
      )}
    </Suspense>
  );
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
