import { useState, type ReactNode } from 'react';
import { isIos } from '../ui/install';
import { InstallButton } from '../ui/InstallButton';
import { spriteUrl } from '@oml/art';
import type { Dex } from '@oml/data';
import type { Translate } from '../i18n';
import { Logo } from '../ui/Logo';

/** D176: the welcome is shown once per phone (a view flag, not game progress). */
const WELCOME_KEY = 'oml.welcome.v1';
export function welcomeSeen(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return true;
  }
}
export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_KEY, '1');
  } catch {
    // storage blocked: it shows again next time
  }
}
/** Running as an installed app (home screen), where the phone keeps the save. */
function installed(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/**
 * D176: the tester guide, at first launch and from Settings: what the game is, what to try,
 * how to keep the save (home screen, export) and how to send feedback.
 */
export function WelcomeScreen({ t, onContinue }: { t: Translate; onContinue: () => void }) {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <main className="setup onboarding" data-testid="welcome">
      <header className="setup-header">
        <Logo name={t('ui.title')} />
        <h1>{t('welcome.title')}</h1>
        <p>{t('welcome.body')}</p>
      </header>
      <h2>{t('welcome.tryTitle')}</h2>
      <ul className="welcome-list">
        <li>{t('welcome.try.walk')}</li>
        <li>{t('welcome.try.travel')}</li>
        <li>{t('welcome.try.journal')}</li>
      </ul>
      <h2>{t('welcome.keepTitle')}</h2>
      <ul className="welcome-list">
        {!installed() && (
          <li data-testid="welcome-install">
            {t(ios ? 'welcome.install.ios' : 'welcome.install.android')}
          </li>
        )}
        <li>{t('welcome.export')}</li>
      </ul>
      <InstallButton t={t} />
      <h2>{t('welcome.feedbackTitle')}</h2>
      <ul className="welcome-list">
        <li>{t('welcome.feedback')}</li>
        <li>{t('welcome.known')}</li>
      </ul>
      <button className="btn primary wide" data-testid="welcome-next" onClick={onContinue}>
        {t('welcome.go')}
      </button>
    </main>
  );
}

export function SafetyScreen({
  t,
  onContinue,
  children,
}: {
  t: Translate;
  onContinue: () => void;
  children?: ReactNode;
}) {
  return (
    <main className="setup onboarding" data-testid="onboarding-safety">
      <header className="setup-header">
        <Logo name={t('ui.title')} />
        <h1>{t('onboarding.safety.title')}</h1>
      </header>
      <ul className="safety-list">
        <li>{t('onboarding.safety.aware')}</li>
        <li>{t('onboarding.safety.stop')}</li>
        <li>{t('onboarding.safety.traffic')}</li>
        <li>{t('onboarding.safety.night')}</li>
      </ul>
      <button className="btn primary wide" data-testid="onboarding-next" onClick={onContinue}>
        {t('onboarding.safety.ok')}
      </button>
      {children}
    </main>
  );
}

/**
 * Where the player is decides the region and its starters (owner: an iPhone tester with
 * location off got Odense's starters in Svendborg). After "Allow" the game waits for a real
 * position before the starter choice; when location is off or not allowed for the site, it
 * says how to turn it on and offers to try again. Outside every playable region the player
 * starts in the default region, as before.
 */
export function LocationScreen({
  t,
  onLocated,
  children,
}: {
  t: Translate;
  /** The player's position was found (only used here to pick the region; never stored). */
  onLocated: (p: { lat: number; lng: number }) => void;
  children?: ReactNode;
}) {
  const [state, setState] = useState<'ask' | 'finding' | 'denied' | 'unavailable'>('ask');
  const locate = () => {
    if (!navigator.geolocation) return setState('unavailable');
    setState('finding');
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => onLocated({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => setState(err.code === 1 ? 'denied' : 'unavailable'),
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
      );
    } catch {
      setState('unavailable');
    }
  };
  const problem = state === 'denied' || state === 'unavailable';
  return (
    <main className="setup onboarding" data-testid="onboarding-location" data-state={state}>
      <header className="setup-header">
        <h1>{t('map.explain.title')}</h1>
        <p>{t('map.explain.body')}</p>
      </header>
      <p className="notice">{t('onboarding.location.save')}</p>
      {state === 'finding' && (
        <p className="notice" role="status" data-testid="location-finding">
          {t('onboarding.location.finding')}
        </p>
      )}
      {problem && (
        <div className="notice warn" role="alert" data-testid="location-problem">
          <p>
            <strong>
              {t(
                state === 'denied'
                  ? 'onboarding.location.denied'
                  : 'onboarding.location.unavailable',
              )}
            </strong>
          </p>
          <p className="small">
            {t(isIos() ? 'onboarding.location.howIos' : 'onboarding.location.how')}
          </p>
        </div>
      )}
      <button
        className="btn primary wide"
        data-testid="onboarding-next"
        disabled={state === 'finding'}
        onClick={locate}
      >
        {t(problem ? 'onboarding.location.retry' : 'map.explain.allow')}
      </button>
      {children}
    </main>
  );
}

export function StarterScreen({
  t,
  dex,
  onPick,
  newRegion = false,
  children,
}: {
  t: Translate;
  /** The campaign's region (P27): each region has its own three starters. */
  dex: Dex;
  onPick: (speciesId: string) => void;
  /** P27: the player has a campaign in another region already (a new region, a new start). */
  newRegion?: boolean;
  children?: ReactNode;
}) {
  return (
    <main className="setup onboarding" data-testid="onboarding-starter">
      <header className="setup-header">
        <h1>{t('onboarding.starter.title')}</h1>
        {newRegion && (
          <p data-testid="onboarding-new-region">
            {t('onboarding.starter.newRegion', {
              region: t(`municipality.${dex.region}.name`),
            })}
          </p>
        )}
        <p>{t('onboarding.starter.body')}</p>
      </header>
      <div className="starter-grid">
        {dex.starters.map((id) => {
          const s = dex.species[id]!;
          return (
            <button
              key={id}
              className="btn starter-card"
              data-testid={`starter-${id}`}
              onClick={() => onPick(id)}
            >
              <img src={spriteUrl(id)} alt="" />
              <strong>{t(`species.${id}.name`)}</strong>
              <span className="muted small">
                {s.types.map((ty) => t(`type.${ty}.name`)).join(' / ')}
              </span>
              <span className="small">{t(`onboarding.starter.${id}`)}</span>
            </button>
          );
        })}
      </div>
      {children}
    </main>
  );
}
