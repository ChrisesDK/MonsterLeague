import { useEffect } from 'react';
import { answerPending, type SaveGame } from '@oml/game';
import { creatureName } from '../eventText';
import type { Translate } from '../i18n';

/** Learn-move and evolve questions from the save; each answer is saved at once. */
export function ChoiceModal({
  t,
  save,
  update,
}: {
  t: Translate;
  save: SaveGame;
  update: (fn: (s: SaveGame) => SaveGame) => void;
}) {
  const choice = save.pending[0];
  const creature = choice && [...save.team, ...save.storage].find((c) => c.uid === choice.uid);
  useEffect(() => {
    // the creature is gone: drop the question
    if (choice && !creature) update((s) => ({ ...s, pending: s.pending.slice(1) }));
  }, [choice, creature, update]);
  if (!choice || !creature) return null;
  const answer = (v: number | boolean | null) => update((s) => answerPending(s, v));
  const name = creatureName(creature, t);
  if (choice.kind === 'learn') {
    const move = t(`move.${choice.moveId}.name`);
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="choice-title">
        <div className="modal-card" data-testid="choice-learn">
          <h2 id="choice-title">{t('ui.learn.title', { name, move })}</h2>
          <p className="muted">{t('ui.learn.prompt')}</p>
          {creature.moves.map((m, i) => (
            <button key={m.moveId} className="btn list-btn" onClick={() => answer(i)}>
              {t('ui.learn.forget', { move: t(`move.${m.moveId}.name`) })}
            </button>
          ))}
          <button className="btn" data-testid="choice-skip" onClick={() => answer(null)}>
            {t('ui.learn.skip', { move })}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="choice-title">
      <div className="modal-card" data-testid="choice-evolve">
        <h2 id="choice-title">
          {t('ui.evolve.title', { name, into: t(`species.${choice.into}.name`) })}
        </h2>
        <button className="btn primary" onClick={() => answer(true)}>
          {t('ui.evolve.yes')}
        </button>
        <button className="btn" data-testid="choice-skip" onClick={() => answer(false)}>
          {t('ui.evolve.no')}
        </button>
      </div>
    </div>
  );
}
