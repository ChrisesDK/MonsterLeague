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
  save: Pick<SaveGame, 'seen' | 'caught'>;
  region: RegionId;
}) {
  const dex = regions[region];
  const all = Object.values(dex.species);
  const number = (id: string) =>
    `#${String(all.findIndex((s) => s.id === id) + 1).padStart(3, '0')}`;
  const seen = all.filter((s) => save.seen[s.id]?.length || save.caught[s.id]?.length);
  const [open, setOpen] = useState<string | null>(null);
  const at = open ? seen.findIndex((s) => s.id === open) : -1;
  const s = at >= 0 ? seen[at]! : null;

  if (s) {
    const prev = seen[at - 1];
    const next = seen[at + 1];
    const caught = !!save.caught[s.id]?.length;
    return (
      <div className="pocket-guide" data-testid="pocket-entry" data-species={s.id}>
        <div className="pocket-head">
          <Button
            round
            variant="ghost"
            icon="back"
            data-testid="pocket-list"
            aria-label={t('ui.back')}
            onClick={() => setOpen(null)}
          />
          <strong>
            {number(s.id)} {tr(`species.${s.id}.name`)}
          </strong>
        </div>
        <div className="pocket-art">
          <img src={spriteUrl(s.id)} alt="" />
          <p>
            {s.types.map((ty) => t(`type.${ty}.name`)).join(' / ')}
            <br />
            <span className="muted">{t(caught ? 'guide.caught' : 'guide.seen')}</span>
          </p>
        </div>
        <SpawnHeatMap
          regionId={region}
          speciesId={s.id}
          dex={dex}
          label={t('guide.where')}
          emptyLabel={t('guide.notWild')}
        />
        <nav className="pocket-step">
          <Button
            icon="back"
            variant="ghost"
            data-testid="pocket-prev"
            disabled={!prev}
            onClick={() => prev && setOpen(prev.id)}
          >
            {prev ? number(prev.id) : t('guide.prev')}
          </Button>
          <Button
            variant="ghost"
            data-testid="pocket-next"
            disabled={!next}
            onClick={() => next && setOpen(next.id)}
          >
            {next ? number(next.id) : t('guide.next')}
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
              onClick={() => setOpen(x.id)}
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
