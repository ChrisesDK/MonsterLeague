import { useState } from 'react';
import { content } from '@oml/data';
import type { BattleState } from '@oml/engine';
import { LOCALES, type Locale, type Translate } from './i18n';
import { startBattle } from './setup';

interface Props {
  t: Translate;
  locale: Locale;
  onLocale: (l: Locale) => void;
  saved: BattleState | null;
  onStart: (state: BattleState) => void;
  onResume: () => void;
}

const speciesIds = Object.keys(content.species);
const trainerIds = Object.keys(content.trainers);

export function SetupScreen({ t, locale, onLocale, saved, onStart, onResume }: Props) {
  const [player, setPlayer] = useState('species:gnistkat');
  const [playerLevel, setPlayerLevel] = useState(12);
  const [opponent, setOpponent] = useState('trainer:leader_water');
  const [opponentLevel, setOpponentLevel] = useState(8);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));

  const species = (id: string) => t(`species.${id}.name`);
  const trainer = (id: string) => t(`trainer.${id}.name`);
  const clampLevel = (v: string) => Math.max(1, Math.min(100, Number(v) || 1));

  return (
    <main className="setup">
      <header className="setup-header">
        <h1>{t('ui.title')}</h1>
        <p>{t('ui.subtitle')}</p>
        <div className="lang" role="group" aria-label={t('ui.language')}>
          {LOCALES.map((l) => (
            <button key={l} className={l === locale ? 'on' : ''} onClick={() => onLocale(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {saved && (
        <button className="btn primary wide" onClick={onResume}>
          {t('ui.resume')}
        </button>
      )}

      <label className="field">
        <span>{t('ui.yourTeam')}</span>
        <select value={player} onChange={(e) => setPlayer(e.target.value)}>
          <optgroup label={t('ui.yourTeam')}>
            {speciesIds.map((id) => (
              <option key={id} value={`species:${id}`}>
                {t('ui.single', { name: species(id) })}
              </option>
            ))}
          </optgroup>
          <optgroup label={t('ui.opponent')}>
            {trainerIds.map((id) => (
              <option key={id} value={`trainer:${id}`}>
                {t('ui.trainerTeam', { name: trainer(id) })}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {player.startsWith('species:') && (
        <label className="field">
          <span>{t('ui.level')}</span>
          <input
            type="number"
            min={1}
            max={100}
            value={playerLevel}
            onChange={(e) => setPlayerLevel(clampLevel(e.target.value))}
          />
        </label>
      )}

      <label className="field">
        <span>{t('ui.opponent')}</span>
        <select value={opponent} onChange={(e) => setOpponent(e.target.value)}>
          {trainerIds.map((id) => (
            <option key={id} value={`trainer:${id}`}>
              {trainer(id)}
            </option>
          ))}
          {speciesIds.map((id) => (
            <option key={id} value={`wild:${id}`}>
              {t('ui.wild', { name: species(id) })}
            </option>
          ))}
        </select>
      </label>
      {opponent.startsWith('wild:') && (
        <label className="field">
          <span>{t('ui.level')}</span>
          <input
            type="number"
            min={1}
            max={100}
            value={opponentLevel}
            onChange={(e) => setOpponentLevel(clampLevel(e.target.value))}
          />
        </label>
      )}

      <label className="field">
        <span>{t('ui.seed')}</span>
        <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
      </label>

      <button
        className="btn primary wide"
        onClick={() => onStart(startBattle({ player, playerLevel, opponent, opponentLevel, seed }))}
      >
        {t('ui.start')}
      </button>
    </main>
  );
}
