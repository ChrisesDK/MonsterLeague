import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { content } from '@oml/data';
import { createCreature } from '@oml/engine';
import { latLngToCell } from 'h3-js';
import {
  chooseStarter,
  naturalRecovery,
  noteFainted,
  teachFieldAbility,
  type SaveGame,
} from '@oml/game';
import { recordGate3, type Gate3Event, type Gate3Session } from '@oml/playtest';
import type { Locale, Translate } from '../i18n';
import { MapScreen } from '../map/MapScreen';
import { START } from '../map/markers';
import { useNight } from '../ui/night';
import { SimLocation } from '../map/location';
import type { ApiSpawn } from '../map/spawnApi';
import { ChoiceModal } from './ChoiceModal';
import { BadgeCeremony } from './BadgeCeremony';
import { Gate3Panel, loadGate3, saveGate3 } from './Gate3';
import { LocationScreen, SafetyScreen, StarterScreen } from './Onboarding';
import { Screens, type ScreenId } from './Screens';
import { loadGame, startOver, writeGame, type Loaded } from './store';

interface Props {
  t: Translate;
  locale: Locale;
  onLocale: (l: Locale) => void;
  devTools: boolean;
}

/** Dev hooks (dev tools only) for the end-to-end test and manual testing. */
export interface OmlDev {
  save: () => SaveGame | null;
  skipOnboarding: (starter?: string) => void;
  setTeamLevel: (level: number) => void;
  setTeamHp: (hp: number) => void;
  grantAbility: (id: string) => void;
  teach: (id: string, uid?: string) => void;
  addCreature: (speciesId: string, level: number) => void;
  /** Adds a fake spawn to the map (dev only; lets tests run without the spawn service). */
  injectSpawn: (s: {
    speciesId: string;
    lat: number;
    lng: number;
    district: number;
    rarity?: 'common' | 'rare';
    levelRoll?: number;
    requires?: string;
  }) => string;
  setFast: () => void;
  setBadges: (badges: number[]) => void;
  sim: () => SimLocation | null;
}

function applySettingsToDocument(save: SaveGame | null, night: boolean) {
  const root = document.documentElement;
  root.dataset.textSize = save?.settings.textSize ?? 'normal';
  root.dataset.reduceMotion = save?.settings.reduceMotion ? 'true' : 'false';
  // GDD v1.9: night style after sunset (the whole game, not only the map).
  root.dataset.theme = night ? 'night' : 'day';
}

export function GameApp({ t, locale, onLocale, devTools }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [save, setSave] = useState<SaveGame | null>(null);
  const saveRef = useRef<SaveGame | null>(null);
  const [screen, setScreen] = useState<ScreenId | null>(null);
  const [ceremony, setCeremony] = useState<number | null>(null);
  const [gate3, setGate3] = useState<Gate3Session | null>(loadGate3);
  const sim = useMemo(() => (devTools ? new SimLocation(START) : null), [devTools]);
  const [devSpawns, setDevSpawns] = useState<ApiSpawn[]>([]);

  useEffect(() => {
    let alive = true;
    void loadGame(locale).then((r) => {
      if (!alive) return;
      setLoaded(r);
      if (r.kind === 'ok') {
        saveRef.current = r.save;
        setSave(r.save);
      }
    });
    return () => {
      alive = false;
    };
    // load once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Applies a change and autosaves it (every change is a meaningful event). */
  const update = useCallback((fn: (s: SaveGame) => SaveGame) => {
    const cur = saveRef.current;
    if (!cur) return;
    const next = fn(cur);
    if (next === cur) return;
    saveRef.current = next;
    setSave(next);
    void writeGame(next);
  }, []);

  // Fainted creatures recover by themselves after 8 hours: keep the clock in step with the
  // team and check once a minute (nothing is saved when nothing changes).
  useEffect(() => {
    const tick = () =>
      update(
        (s) =>
          naturalRecovery(
            noteFainted(s, Math.floor(Date.now() / 1000)),
            Math.floor(Date.now() / 1000),
          ).save,
      );
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [update, save?.team, save?.storage]);

  // Language and display settings follow the save.
  const night = useNight();
  useEffect(() => {
    applySettingsToDocument(save, night);
    if (save && save.settings.language !== locale) onLocale(save.settings.language);
  }, [save, locale, onLocale, night]);

  const onGate3 = useCallback((e: Gate3Event) => {
    setGate3((cur) => {
      if (!cur || cur.endedAt) return cur;
      const next = recordGate3(cur, e);
      saveGate3(next);
      return next;
    });
  }, []);

  // Dev hooks.
  useEffect(() => {
    if (!devTools) return;
    const all = (s: SaveGame, f: (c: SaveGame['team'][number]) => SaveGame['team'][number]) => ({
      ...s,
      team: s.team.map(f),
    });
    const dev: OmlDev = {
      save: () => saveRef.current,
      skipOnboarding: (starter = 'gnistkat') =>
        update((s) => ({
          ...(s.starter ? s : chooseStarter(s, starter)),
          onboarding: 'done',
        })),
      setTeamLevel: (level) =>
        update((s) =>
          all(s, (c) => ({
            ...createCreature(c.speciesId, level, c.uid),
            ...(c.fieldAbility ? { fieldAbility: c.fieldAbility } : {}),
          })),
        ),
      setTeamHp: (hp) => update((s) => all(s, (c) => ({ ...c, hp }))),
      grantAbility: (id) =>
        update((s) =>
          s.devAbilities.includes(id) ? s : { ...s, devAbilities: [...s.devAbilities, id] },
        ),
      teach: (id, uid) =>
        update((s) => {
          const target =
            s.team.find((c) => c.uid === uid) ??
            s.team.find((c) =>
              content.species[c.speciesId]?.types.some((ty) =>
                content.fieldAbilities[id]?.types.includes(ty),
              ),
            );
          if (!target) return s;
          return teachFieldAbility(s, target.uid, id, target.moves.length >= 4 ? 0 : null);
        }),
      addCreature: (speciesId, level) =>
        update((s) => {
          const c = createCreature(speciesId, level, `p${s.nextUid}`);
          const next = { ...s, nextUid: s.nextUid + 1 };
          return s.team.length < 6
            ? { ...next, team: [...s.team, c] }
            : { ...next, storage: [...s.storage, c] };
        }),
      injectSpawn: ({ speciesId, lat, lng, district, rarity, levelRoll, requires }) => {
        const id = `dev${Date.now().toString(16)}${Math.floor(Math.random() * 1e6)}`;
        const now = Math.floor(Date.now() / 1000);
        setDevSpawns((list) => [
          ...list,
          {
            id,
            speciesId,
            rarity: rarity ?? 'common',
            levelRoll: levelRoll ?? 0.5,
            district,
            lat,
            lng,
            cellId: latLngToCell(lat, lng, 10),
            requires: requires ?? null,
            window: Math.floor(now / 900),
            expiresAt: now + 900,
          },
        ]);
        return id;
      },
      setFast: () => update((s) => ({ ...s, settings: { ...s.settings, speed: 'fast' } })),
      setBadges: (badges) => update((s) => ({ ...s, badges })),
      sim: () => sim,
    };
    (window as unknown as { __omlDev?: OmlDev }).__omlDev = dev;
    return () => {
      delete (window as unknown as { __omlDev?: OmlDev }).__omlDev;
    };
  }, [devTools, update, sim]);

  // Dev tools only: let automated checks drive the simulator (never in the player map).
  useEffect(() => {
    if (!sim) return;
    (window as unknown as { __omlSim?: SimLocation }).__omlSim = sim;
    return () => {
      delete (window as unknown as { __omlSim?: SimLocation }).__omlSim;
    };
  }, [sim]);

  if (!loaded) return <main className="setup" aria-busy="true" />;

  if (loaded.kind === 'corrupt' && !save) {
    return (
      <main className="setup">
        <header className="setup-header">
          <h1>{t('save.corrupt.title')}</h1>
          <p>{t('save.corrupt.body')}</p>
        </header>
        <button
          className="btn primary wide"
          data-testid="start-over"
          onClick={() =>
            void startOver(locale).then((s) => {
              saveRef.current = s;
              setSave(s);
            })
          }
        >
          {t('save.corrupt.startOver')}
        </button>
      </main>
    );
  }
  if (!save) return null;

  const devSkip = devTools ? (
    <button
      className="btn wide"
      data-testid="dev-skip-onboarding"
      onClick={() => (window as unknown as { __omlDev: OmlDev }).__omlDev.skipOnboarding()}
    >
      {t('dev.skipOnboarding')}
    </button>
  ) : null;

  if (save.onboarding === 'safety') {
    return (
      <SafetyScreen t={t} onContinue={() => update((s) => ({ ...s, onboarding: 'location' }))}>
        {devSkip}
      </SafetyScreen>
    );
  }
  if (save.onboarding === 'location') {
    return (
      <LocationScreen t={t} onAllow={() => update((s) => ({ ...s, onboarding: 'starter' }))}>
        {devSkip}
      </LocationScreen>
    );
  }
  if (save.onboarding === 'starter') {
    return (
      <StarterScreen t={t} onPick={(id) => update((s) => chooseStarter(s, id))}>
        {devSkip}
      </StarterScreen>
    );
  }

  if (ceremony !== null) {
    return <BadgeCeremony t={t} arena={ceremony} onDone={() => setCeremony(null)} />;
  }

  return (
    <>
      <MapScreen
        t={t}
        devTools={devTools}
        save={save}
        update={update}
        onMenu={() => setScreen('menu')}
        onJournal={() => setScreen('journal')}
        night={night}
        onBadge={setCeremony}
        onGate3={gate3 && !gate3.endedAt ? onGate3 : undefined}
        sim={sim}
        devSpawns={devTools ? devSpawns : undefined}
        covered={!!screen}
      />
      {save.pending.length > 0 && !save.battle && !screen && (
        <ChoiceModal t={t} save={save} update={update} />
      )}
      {/* Menu screens lie over the map, which stays alive underneath: closing the menu
          doesn't rebuild the map, restart the GPS or reload the buildings. */}
      {screen && (
        <div className="screen-overlay">
          <Screens
            t={t}
            screen={screen}
            onScreen={setScreen}
            save={save}
            update={update}
            devTools={devTools}
            gate3={<Gate3Panel t={t} session={gate3} onSession={setGate3} locale={locale} />}
            onClose={() => setScreen(null)}
          />
        </div>
      )}
    </>
  );
}
