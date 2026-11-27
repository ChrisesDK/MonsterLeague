/**
 * The pocket field guide on the Town Map (owner request): the creatures seen in the region
 * the map shows, three to a row with only a picture, number and name; pressing one turns the
 * sheet into that creature: its picture, types, seen or caught, and a heat map of where it
 * lives, with previous / next through the creatures seen. No written hints (the full field
 * guide in the satchel has those). Unseen creatures are left out, as in the field guide.
 */
import { useState } from 'react';
import { spriteUrl } from '@oml/art';
import { regions, type RegionId } from '@oml/data';
import type { SaveGame } from '@oml/game';
import type { Translate } from '../i18n';
import { Button } from '../ui/components';
import { Icon } from '../ui/icons';
import { SpawnHeatMap } from './SpawnHeatMap';
import { FormSwitch, HabitatChips, TypeChips } from './speciesBits';
import { baseForm } from '@oml/game';

export function PocketGuide({
  t,
  tr,
  save,
  region,
}: {
  t: Translate;
  /** The region's own texts (creature names). */
  tr: Translate;
  /** The campaign of the region shown (its seen and caught lists). */
  save: Pick<SaveGame, 'seen' | 'caught' | 'glimmerSeen'>;
  region: RegionId;
}) {
  const dex = regions[region];
  const all = Object.values(dex.species);
  const number = (id: string) =>
    `#${String(all.findIndex((s) => s.id === id) + 1).padStart(3, '0')}`;
  const seen = all.filter((s) => save.seen[s.id]?.length || save.caught[s.id]?.length);
  const [open, setOpen] = useState<string | null>(null);
  const [glimmer, setGlimmer] = useState(false);
  const openEntry = (id: string | null) => {
    setOpen(id);
    setGlimmer(false);
  };
  const at = open ? seen.findIndex((s) => s.id === open) : -1;
  const s = at >= 0 ? seen[at]! : null;

  if (s) {
    const prev = seen[at - 1];
    const next = seen[at + 1];
    const caught = !!save.caught[s.id]?.length;
    const glimmerSeen = save.glimmerSeen.includes(s.id);
    const showGlimmer = glimmer && glimmerSeen;
    return (
      <div className="pocket-guide pocket-entry" data-testid="pocket-entry" data-species={s.id}>
        <div className="pocket-head">
          <Button
            round
            variant="ghost"
            icon="back"
            data-testid="pocket-list"
            aria-label={t('ui.back')}
            onClick={() => openEntry(null)}
          />
          <strong>
            {number(s.id)} {tr(`species.${s.id}.name`)}
          </strong>
        </div>
        <FormSwitch t={t} glimmer={showGlimmer} seen={glimmerSeen} onGlimmer={setGlimmer} />
        <span className="guide-entry-art pocket-art">
          <img src={spriteUrl(s.id)} alt="" className={showGlimmer ? 'shiny' : ''} />
          {showGlimmer && <span className="shiny-mark">✦</span>}
        </span>
        <TypeChips s={s} dex={dex} t={t} state={caught ? 'caught' : 'seen'} />
        {/* the map close to the bottom, just above the buttons (owner) */}
        <div className="pocket-map">
          <SpawnHeatMap
            regionId={region}
            speciesId={s.id}
            dex={dex}
            label={t('guide.where')}
            emptyLabel={t('guide.notWild')}
            foundAs={(b) => t('guide.foundAs', { name: tr(`species.${b}.name`) })}
            size={[300, 150]}
          />
          <HabitatChips speciesId={baseForm(s.id, dex)} dex={dex} t={t} tr={tr} />
        </div>
        <nav className="pocket-step">
          <Button
            icon="back"
            variant="ghost"
            data-testid="pocket-prev"
            disabled={!prev}
            onClick={() => prev && openEntry(prev.id)}
          >
            {t('guide.prev')}
          </Button>
          <Button
            variant="ghost"
            data-testid="pocket-next"
            disabled={!next}
            onClick={() => next && openEntry(next.id)}
          >
            {t('guide.next')}
            <Icon name="chevron" />
          </Button>
        </nav>
      </div>
    );
  }

  return (
    <div className="pocket-guide" data-testid="pocket-guide">
      {seen.length === 0 ? (
        <p className="muted">{t('townMap.guideEmpty')}</p>
      ) : (
        <div className="pocket-grid">
          {seen.map((x) => (
            <button
              key={x.id}
              type="button"
              className="pocket-card"
              data-testid={`pocket-${x.id}`}
              onClick={() => openEntry(x.id)}
            >
              <img src={spriteUrl(x.id)} alt="" />
              <span className="small muted">{number(x.id)}</span>
              <span className="small">
                {tr(`species.${x.id}.name`)}
                {save.caught[x.id]?.length ? (
                  <span className="pocket-caught" aria-label={t('guide.caught')}>
                    {' '}
                    ●
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
