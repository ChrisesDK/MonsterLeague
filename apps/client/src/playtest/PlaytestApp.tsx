import { useEffect, useRef, useState } from 'react';
import { Logo } from '../ui/Logo';
import { inReplacementPhase, type Action, type BattleState } from '@oml/engine';
import {
  normaliseTesterCode,
  pauseTimer,
  readTimer,
  restoreTimer,
  resumeTimer,
  startTimer,
  toCsv,
  toJson,
  type LengthAnswer,
  type PlaytestRecord,
} from '@oml/playtest';
import { BattleScreen, type Speed } from '../BattleScreen';
import { LOCALES, type Locale, type Translate } from '../i18n';
import { APP_VERSION } from '../version';
import {
  SESSION_PLAN,
  STARTERS,
  STARTER_SPECIES,
  buildPlaytestBattle,
  countAction,
  type PlanSlot,
  type Starter,
} from './plan';
import {
  deleteAllPlaytestData,
  loadActive,
  loadRecords,
  loadSession,
  saveActive,
  saveRecords,
  saveSession,
  type ActiveBattle,
  type Session,
} from './storage';

interface Props {
  t: Translate;
  locale: Locale;
  onLocale: (l: Locale) => void;
}

type Screen = 'start' | 'menu' | 'battle' | 'rate' | 'export';

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** A battle restored from storage counts time only up to its last save. */
function restoreActive(a: ActiveBattle | null): ActiveBattle | null {
  return a ? { ...a, timer: restoreTimer(a.timer, a.savedAt) } : null;
}

export function PlaytestApp({ t, locale, onLocale }: Props) {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [records, setRecords] = useState<PlaytestRecord[]>(loadRecords);
  const [active, setActiveState] = useState<ActiveBattle | null>(() => restoreActive(loadActive()));
  const [screen, setScreen] = useState<Screen>(session ? 'menu' : 'start');
  const [ratingFor, setRatingFor] = useState<string | null>(null);
  const activeRef = useRef(active);

  const setActive = (a: ActiveBattle | null) => {
    activeRef.current = a;
    setActiveState(a);
    saveActive(a);
  };

  useEffect(() => {
    if (session && session.locale !== locale) onLocale(session.locale);
    // Only on first load: the session remembers the tester's language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Active time: pause while the app is hidden, resume when it comes back.
  useEffect(() => {
    if (screen !== 'battle') return;
    const onVisibility = () => {
      const a = activeRef.current;
      if (!a) return;
      const now = Date.now();
      const timer = document.hidden ? pauseTimer(a.timer, now) : resumeTimer(a.timer, now);
      setActive({ ...a, timer, savedAt: now });
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
    };
  }, [screen]);

  const updateRecords = (next: PlaytestRecord[]) => {
    setRecords(next);
    saveRecords(next);
  };

  // ---- actions ------------------------------------------------------------
  const startSlot = (slot: PlanSlot) => {
    if (!session) return;
    const built = buildPlaytestBattle(slot, session.starter, Math.random);
    const now = Date.now();
    setActive({
      slotId: slot.id,
      attempt:
        records.filter((r) => r.sessionId === session.sessionId && r.battleId === slot.id).length +
        1,
      opponentId: built.opponentId,
      opponentLevel: built.opponentLevel,
      startedAt: new Date(now).toISOString(),
      state: built.state,
      timer: startTimer(now),
      counts: { switches: 0, itemsUsed: 0, catchAttempts: 0 },
      savedAt: now,
    });
    setScreen('battle');
  };

  const resumeActive = () => {
    const a = activeRef.current;
    if (!a) return;
    const now = Date.now();
    setActive({ ...a, timer: resumeTimer(a.timer, now), savedAt: now });
    setScreen('battle');
  };

  const onSave = (state: BattleState) => {
    const a = activeRef.current;
    if (a) setActive({ ...a, state, savedAt: Date.now() });
  };

  const onAction = (action: Action, state: BattleState) => {
    const a = activeRef.current;
    if (!a) return;
    const replacing = inReplacementPhase(state) && state.sides[0].needsReplacement;
    setActive({ ...a, counts: countAction(a.counts, action, replacing) });
  };

  const onExit = (stillRunning: boolean, state: BattleState) => {
    const a = activeRef.current;
    if (!a || !session) return;
    const now = Date.now();
    if (stillRunning) {
      setActive({ ...a, state, timer: pauseTimer(a.timer, now), savedAt: now });
      setScreen('menu');
      return;
    }
    const slot = SESSION_PLAN.find((s) => s.id === a.slotId)!;
    const record: PlaytestRecord = {
      recordId: newId(),
      testerCode: session.testerCode,
      sessionId: session.sessionId,
      battleId: slot.id,
      attempt: a.attempt,
      kind: slot.kind,
      opponentId: a.opponentId,
      opponentLevel: a.opponentLevel,
      starter: session.starter,
      startedAt: a.startedAt,
      endedAt: new Date(now).toISOString(),
      activeMs: readTimer(a.timer, now),
      turns: state.turn,
      result: state.result === 'ongoing' ? 'p2' : state.result,
      ...a.counts,
      speed: session.speed,
      locale,
      appVersion: APP_VERSION,
      rating: null,
      length: null,
      comment: '',
    };
    updateRecords([...records, record]);
    setActive(null);
    setRatingFor(record.recordId);
    setScreen('rate');
  };

  const updateSession = (patch: Partial<Session>) => {
    if (!session) return;
    const next = { ...session, ...patch };
    setSession(next);
    saveSession(next);
  };

  // ---- screens ------------------------------------------------------------
  if (screen === 'battle' && active && session) {
    return (
      <BattleScreen
        key={`${active.slotId}-${active.attempt}-${active.startedAt}`}
        initial={active.state}
        t={t}
        speed={session.speed}
        onSave={onSave}
        onAction={onAction}
        onExit={onExit}
        endLabel={t('ui.continue')}
      />
    );
  }

  if (screen === 'rate' && ratingFor) {
    return (
      <RateScreen
        t={t}
        onSave={(rating, length, comment) => {
          updateRecords(
            records.map((r) => (r.recordId === ratingFor ? { ...r, rating, length, comment } : r)),
          );
          setRatingFor(null);
          setScreen('menu');
        }}
      />
    );
  }

  if (screen === 'export') {
    return (
      <ExportScreen
        t={t}
        records={records}
        testerCode={session?.testerCode ?? null}
        onBack={() => setScreen(session ? 'menu' : 'start')}
        onDelete={() => {
          deleteAllPlaytestData();
          setRecords([]);
          setActive(null);
          setSession(null);
        }}
      />
    );
  }

  if (screen === 'menu' && session) {
    return (
      <main className="setup">
        <header className="setup-header">
          <h1>{t('pt.menu.title')}</h1>
          <p>
            {t('pt.menu.tester', { code: session.testerCode })} ·{' '}
            {t(`species.${STARTER_SPECIES[session.starter]}.name`)}
          </p>
        </header>
        <p className="notice">{t('pt.safety')}</p>
        <p className="muted">{t('pt.menu.hint')}</p>
        <ol className="plan">
          {SESSION_PLAN.map((slot) => {
            const done = records.filter(
              (r) => r.sessionId === session.sessionId && r.battleId === slot.id,
            );
            const inProgress = active?.slotId === slot.id;
            return (
              <li key={slot.id} className="plan-item">
                <div>
                  <strong>{t(`pt.slot.${slot.id}`)}</strong>
                  {slot.optional && <span className="muted"> ({t('pt.optional')})</span>}
                  {done.length > 0 && (
                    <div className="muted small">✓ {t('pt.done', { n: done.length })}</div>
                  )}
                </div>
                {inProgress ? (
                  <button className="btn primary" onClick={resumeActive}>
                    {t('pt.resume')}
                  </button>
                ) : (
                  <button
                    className={`btn${done.length === 0 ? ' primary' : ''}`}
                    disabled={!!active}
                    onClick={() => startSlot(slot)}
                  >
                    {done.length ? t('pt.redo') : t('pt.play')}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        <Choice
          label={t('pt.speed')}
          options={(['normal', 'fast'] as Speed[]).map((s) => ({
            value: s,
            label: t(`pt.speed.${s}`),
          }))}
          value={session.speed}
          onChange={(speed) => updateSession({ speed })}
        />
        <button className="btn wide" onClick={() => setScreen('export')}>
          {t('pt.results')}
        </button>
        <a className="btn wide link-btn" href="#/" data-testid="to-map">
          {t('pt.toMap')}
        </a>
        <button
          className="btn wide"
          onClick={() => {
            setSession(null);
            saveSession(null);
            setActive(null);
            setScreen('start');
          }}
        >
          {t('pt.changeTester')}
        </button>
      </main>
    );
  }

  return (
    <StartScreen
      t={t}
      locale={locale}
      onLocale={onLocale}
      hasResults={records.length > 0}
      onResults={() => setScreen('export')}
      onStart={(testerCode, starter, speed) => {
        const s: Session = { testerCode, sessionId: newId(), starter, speed, locale };
        setSession(s);
        saveSession(s);
        setScreen('menu');
      }}
    />
  );
}

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="choice-row">
        {options.map((o) => (
          <button
            key={o.value}
            className={`btn choice${o.value === value ? ' on' : ''}`}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StartScreen({
  t,
  locale,
  onLocale,
  hasResults,
  onResults,
  onStart,
}: {
  t: Translate;
  locale: Locale;
  onLocale: (l: Locale) => void;
  hasResults: boolean;
  onResults: () => void;
  onStart: (code: string, starter: Starter, speed: Speed) => void;
}) {
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const [starter, setStarter] = useState<Starter>('fire');
  const [speed, setSpeed] = useState<Speed>('normal');
  const normalised = normaliseTesterCode(code);
  return (
    <main className="setup">
      <header className="setup-header">
        <Logo />
        <h1>{t('pt.title')}</h1>
        <p>{t('pt.intro')}</p>
      </header>
      <div className="notice" role="note">
        <strong>{t('pt.safety')}</strong>
        <div>{t('pt.safetyMore')}</div>
      </div>
      <Choice
        label={t('ui.language')}
        options={LOCALES.map((l) => ({ value: l, label: l === 'da' ? 'Dansk' : 'English' }))}
        value={locale}
        onChange={onLocale}
      />
      <label className="field">
        <span>{t('pt.code')}</span>
        <input
          value={code}
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setCode(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-describedby="code-hint"
        />
        <small id="code-hint" className={touched && !normalised ? 'error' : 'muted'}>
          {touched && !normalised ? t('pt.codeInvalid') : t('pt.codeHint')}
        </small>
      </label>
      <Choice
        label={t('pt.starter')}
        options={STARTERS.map((s) => ({
          value: s,
          label: t(`species.${STARTER_SPECIES[s]}.name`),
        }))}
        value={starter}
        onChange={setStarter}
      />
      <Choice
        label={t('pt.speed')}
        options={(['normal', 'fast'] as Speed[]).map((s) => ({
          value: s,
          label: t(`pt.speed.${s}`),
        }))}
        value={speed}
        onChange={setSpeed}
      />
      <button
        className="btn primary wide"
        onClick={() => (normalised ? onStart(normalised, starter, speed) : setTouched(true))}
      >
        {t('pt.begin')}
      </button>
      {hasResults && (
        <button className="btn wide" onClick={onResults}>
          {t('pt.results')}
        </button>
      )}
      <a className="btn wide link-btn" href="#/" data-testid="to-map">
        {t('pt.toMap')}
      </a>
    </main>
  );
}

function RateScreen({
  t,
  onSave,
}: {
  t: Translate;
  onSave: (rating: number, length: LengthAnswer | null, comment: string) => void;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [length, setLength] = useState<LengthAnswer | null>(null);
  const [comment, setComment] = useState('');
  return (
    <main className="setup">
      <h1 className="rate-title">{t('pt.rate.title')}</h1>
      <div className="rating-row" role="group" aria-label={t('pt.rate.title')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={`btn rating${rating === n ? ' on' : ''}`}
            aria-pressed={rating === n}
            aria-label={t('pt.rate.star', { n })}
            onClick={() => setRating(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="rating-legend muted small">
        <span>{t('pt.rate.low')}</span>
        <span>{t('pt.rate.high')}</span>
      </div>
      <div className="field" role="group" aria-label={t('pt.length.q')}>
        <span>{t('pt.length.q')}</span>
        <div className="choice-row">
          {(['too_long', 'about_right', 'too_short'] as LengthAnswer[]).map((l) => (
            <button
              key={l}
              className={`btn choice${length === l ? ' on' : ''}`}
              aria-pressed={length === l}
              onClick={() => setLength(length === l ? null : l)}
            >
              {t(`pt.length.${l}`)}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>{t('pt.comment')}</span>
        <textarea
          rows={3}
          maxLength={500}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
      <button
        className="btn primary wide"
        disabled={rating === null}
        onClick={() => rating !== null && onSave(rating, length, comment.trim())}
      >
        {t('pt.save')}
      </button>
    </main>
  );
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ExportScreen({
  t,
  records,
  testerCode,
  onBack,
  onDelete,
}: {
  t: Translate;
  records: PlaytestRecord[];
  testerCode: string | null;
  onBack: () => void;
  onDelete: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const date = new Date().toISOString().slice(0, 10);
  const base = `oml-gate2-${testerCode ?? 'all'}-${date}`;
  const json = () => toJson(records, new Date());
  const csv = () => toCsv(records);

  const share = async () => {
    try {
      const files = [
        new File([json()], `${base}.json`, { type: 'application/json' }),
        new File([csv()], `${base}.csv`, { type: 'text/csv' }),
      ];
      if (navigator.canShare?.({ files })) await navigator.share({ files, title: base });
      else if (navigator.share) await navigator.share({ title: base, text: json() });
      else throw new Error('no share');
      setStatus(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setStatus(t('pt.export.failed'));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json());
      setStatus(t('pt.export.copied'));
    } catch {
      setStatus(t('pt.export.failed'));
    }
  };

  return (
    <main className="setup">
      <header className="setup-header">
        <h1>{t('pt.results')}</h1>
        <p>{t('pt.export.count', { n: records.length })}</p>
      </header>
      <p className="muted small">{t('pt.export.privacy')}</p>
      <button className="btn primary wide" disabled={records.length === 0} onClick={share}>
        {t('pt.export.share')}
      </button>
      <button
        className="btn wide"
        disabled={records.length === 0}
        onClick={() => download(`${base}.json`, json(), 'application/json')}
      >
        {t('pt.export.downloadJson')}
      </button>
      <button
        className="btn wide"
        disabled={records.length === 0}
        onClick={() => download(`${base}.csv`, csv(), 'text/csv')}
      >
        {t('pt.export.downloadCsv')}
      </button>
      <button className="btn wide" disabled={records.length === 0} onClick={copy}>
        {t('pt.export.copy')}
      </button>
      {status && (
        <p className="muted" role="status">
          {status}
        </p>
      )}
      <button
        className={`btn wide${confirming ? ' danger' : ''}`}
        onClick={() => {
          if (!confirming) return setConfirming(true);
          onDelete();
          setConfirming(false);
          setStatus(t('pt.deleted'));
        }}
      >
        {confirming ? t('pt.deleteConfirm') : t('pt.delete')}
      </button>
      <button className="btn wide" onClick={onBack}>
        {t('ui.back')}
      </button>
    </main>
  );
}
