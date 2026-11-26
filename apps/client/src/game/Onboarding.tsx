import type { ReactNode } from 'react';
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

export function LocationScreen({
  t,
  onAllow,
  children,
}: {
  t: Translate;
  onAllow: () => void;
  children?: ReactNode;
}) {
  const allow = () => {
    // Ask for permission now (the map subscribes afterwards); go on either way, the map
    // explains what to do if it was denied.
    try {
      navigator.geolocation?.getCurrentPosition(
        () => undefined,
        () => undefined,
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    } catch {
      // not supported
    }
    onAllow();
  };
  return (
    <main className="setup onboarding" data-testid="onboarding-location">
      <header className="setup-header">
        <h1>{t('map.explain.title')}</h1>
        <p>{t('map.explain.body')}</p>
      </header>
      <p className="notice">{t('onboarding.location.save')}</p>
      <button className="btn primary wide" data-testid="onboarding-next" onClick={allow}>
        {t('map.explain.allow')}
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
