import type { ReactNode } from 'react';
import { spriteUrl } from '@oml/art';
import { content } from '@oml/data';
import type { Translate } from '../i18n';
import { Logo } from '../ui/Logo';

const STARTERS = ['gnistkat', 'aaodder', 'boegling'] as const;

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
        <Logo />
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
      <a className="btn wide link-btn" href="#/playtest">
        {t('map.toPlaytest')}
      </a>
      {children}
    </main>
  );
}

export function StarterScreen({
  t,
  onPick,
  children,
}: {
  t: Translate;
  onPick: (speciesId: string) => void;
  children?: ReactNode;
}) {
  return (
    <main className="setup onboarding" data-testid="onboarding-starter">
      <header className="setup-header">
        <h1>{t('onboarding.starter.title')}</h1>
        <p>{t('onboarding.starter.body')}</p>
      </header>
      <div className="starter-grid">
        {STARTERS.map((id) => {
          const s = content.species[id]!;
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
