import { useEffect, useState } from 'react';
import { spriteUrl } from '@oml/art';
import { answerPending, type SaveGame } from '@oml/game';
import { buzz } from '../ui/feedback';
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
  /** Evolution plays a short morph before the answer is saved (skipped with reduce motion). */
  const [evolving, setEvolving] = useState<{ from: string; into: string } | null>(null);
  const creature = choice && [...save.team, ...save.storage].find((c) => c.uid === choice.uid);
  useEffect(() => {
    // the creature is gone: drop the question
    if (choice && !creature) update((s) => ({ ...s, pending: s.pending.slice(1) }));
  }, [choice, creature, update]);
  if (evolving) {
    return (
      <div className="modal evolve-modal" role="dialog" aria-modal="true" data-testid="evolving">
        <div className="evolve-stage" aria-hidden>
          <img className="evolve-from" src={spriteUrl(evolving.from)} alt="" />
          <img className="evolve-into" src={spriteUrl(evolving.into)} alt="" />
        </div>
      </div>
    );
  }
  if (!choice || !creature) return null;
  const answer = (v: number | boolean | null) => update((s) => answerPending(s, v));
  const evolve = () => {
    if (choice.kind !== 'evolve') return;
    if (save.settings.reduceMotion) return answer(true);
    setEvolving({ from: creature.speciesId, into: choice.into });
    buzz('evolve');
    setTimeout(() => {
      answer(true);
      setEvolving(null);
    }, 2200);
  };
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
        <button className="btn primary" onClick={evolve}>
          {t('ui.evolve.yes')}
        </button>
        <button className="btn" data-testid="choice-skip" onClick={() => answer(false)}>
          {t('ui.evolve.no')}
        </button>
      </div>
    </div>
  );
}
