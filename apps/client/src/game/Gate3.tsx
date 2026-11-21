import { useState } from 'react';
import {
  endGate3,
  gate3Csv,
  gate3Json,
  newGate3Session,
  normaliseTesterCode,
  type Gate3Session,
} from '@oml/playtest';
import { isNight } from '@oml/spawn';
import type { Locale, Translate } from '../i18n';
import { APP_VERSION } from '../version';
import { shareOrDownload } from './store';

/**
 * Gate 3 walk sessions, opt-in. Stored on the phone (localStorage) until the tester shares
 * them. Counts only: no coordinates, cells or place names (see packages/playtest gate3).
 */
const KEY = 'oml.gate3.v1';
/** Odense centre, for "after dark": never the player's position. */
const ODENSE = { lat: 55.396, lng: 10.386 };

export function loadAllGate3(): Gate3Session[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as Gate3Session[]) : [];
  } catch {
    return [];
  }
}

function writeAll(all: Gate3Session[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/** The running (or last, not yet rated) session. */
export function loadGate3(): Gate3Session | null {
  const all = loadAllGate3();
  const last = all[all.length - 1];
  return last && (!last.endedAt || last.rating === null) ? last : null;
}

export function saveGate3(s: Gate3Session) {
  const all = loadAllGate3().filter((x) => x.sessionId !== s.sessionId);
  writeAll([...all, s]);
}

function randomId(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function Gate3Panel({
  t,
  session,
  onSession,
  locale,
}: {
  t: Translate;
  session: Gate3Session | null;
  onSession: (s: Gate3Session | null) => void;
  locale: Locale;
}) {
  const [code, setCode] = useState('');
  const [ending, setEnding] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const all = loadAllGate3();
  const done = all.filter((s) => s.endedAt);

  const start = () => {
    const testerCode = normaliseTesterCode(code);
    if (!testerCode) return;
    const s = newGate3Session({
      sessionId: randomId(),
      testerCode,
      startedAt: new Date(),
      dark: isNight(Math.floor(Date.now() / 1000), ODENSE.lat, ODENSE.lng),
      locale,
      appVersion: APP_VERSION,
    });
    saveGate3(s);
    onSession(s);
  };

  const finish = () => {
    if (!session) return;
    const s = endGate3(session, new Date(), rating, comment);
    saveGate3(s);
    onSession(null);
    setEnding(false);
    setRating(null);
    setComment('');
  };

  const share = (kind: 'json' | 'csv') => {
    const stamp = new Date().toISOString().slice(0, 10);
    const file =
      kind === 'json'
        ? new File([gate3Json(done, new Date())], `oml-gate3-${stamp}.json`, {
            type: 'application/json',
          })
        : new File([gate3Csv(done)], `oml-gate3-${stamp}.csv`, { type: 'text/csv' });
    void shareOrDownload(file);
  };

  return (
    <section className="panel-section" data-testid="gate3-panel">
      <h2>{t('gate3.title')}</h2>
      <p className="muted small">{t('gate3.body')}</p>
      {!session && (
        <div className="row">
          <label className="field">
            <span>{t('gate3.code')}</span>
            <input
              value={code}
              maxLength={12}
              data-testid="gate3-code"
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="btn primary" disabled={!normaliseTesterCode(code)} onClick={start}>
            {t('gate3.start')}
          </button>
        </div>
      )}
      {session && !ending && (
        <>
          <p className="small" data-testid="gate3-running">
            {t('gate3.running', {
              code: session.testerCode,
              km: (session.distanceM / 1000).toFixed(2),
              battles: session.battlesWon + session.battlesLost,
            })}
          </p>
          <button className="btn primary wide" onClick={() => setEnding(true)}>
            {t('gate3.end')}
          </button>
        </>
      )}
      {session && ending && (
        <>
          <p>{t('gate3.rate')}</p>
          <div className="rating-row">
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                className={`btn rating${rating === r ? ' on' : ''}`}
                aria-pressed={rating === r}
                onClick={() => setRating(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <label className="field">
            <span>{t('gate3.comment')}</span>
            <textarea
              value={comment}
              maxLength={1000}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <button className="btn primary wide" disabled={rating === null} onClick={finish}>
            {t('gate3.save')}
          </button>
        </>
      )}
      <p className="muted small">{t('gate3.count', { n: done.length })}</p>
      <div className="row">
        <button className="btn" disabled={done.length === 0} onClick={() => share('json')}>
          {t('gate3.shareJson')}
        </button>
        <button className="btn" disabled={done.length === 0} onClick={() => share('csv')}>
          {t('gate3.shareCsv')}
        </button>
      </div>
    </section>
  );
}
