/**
 * Small pieces of a creature's page, shared by the field guide and the Town Map's pocket
 * guide (owner: types as coloured labels, the base stats as bars, the Glimmer switch).
 */
import type { CSSProperties } from 'react';
import type { Dex, Species } from '@oml/data';
import { guideHints } from '@oml/game';
import type { Translate } from '../i18n';

/** Each type as a label in its own colour; seen / caught on its own line below (owner: in
 *  a box beside them it read like a type). */
export function TypeChips({
  s,
  dex,
  t,
  state,
}: {
  s: Species;
  dex: Dex;
  t: Translate;
  state: 'seen' | 'caught';
}) {
  return (
    <div className="type-block">
      <div className="type-chips" data-testid="type-chips">
        {s.types.map((ty) => (
          <span
            key={ty}
            className="type-chip"
            style={{ '--type-color': dex.typeColors[ty] } as CSSProperties}
          >
            {t(`type.${ty}.name`)}
          </span>
        ))}
      </div>
      <p className={`state-line ${state}`} data-testid="state-chip">
        {state === 'caught' ? '✓ ' : ''}
        {t(`guide.${state}`)}
      </p>
    </div>
  );
}

/** Normal / Glimmer: Glimmer greyed out until one of the species was met. */
export function FormSwitch({
  t,
  glimmer,
  seen,
  onGlimmer,
}: {
  t: Translate;
  glimmer: boolean;
  seen: boolean;
  onGlimmer: (on: boolean) => void;
}) {
  return (
    <div className="chip-row guide-forms" role="tablist">
      <button
        role="tab"
        data-testid="guide-form-normal"
        className={`btn choice${glimmer ? '' : ' on'}`}
        aria-selected={!glimmer}
        onClick={() => onGlimmer(false)}
      >
        {t('guide.formNormal')}
      </button>
      <button
        role="tab"
        data-testid="guide-form-glimmer"
        className={`btn choice${glimmer ? ' on' : ''}`}
        aria-selected={glimmer}
        disabled={!seen}
        title={seen ? undefined : t('guide.glimmerUnseen')}
        onClick={() => onGlimmer(true)}
      >
        ✦ {t('ui.shiny')}
      </button>
    </div>
  );
}

/**
 * What the heat map can't show, as short labels (owner: the same in both field guides, no
 * paragraphs): its home destination(s), night or day only, and field-ability layers.
 */
export function HabitatChips({
  speciesId,
  dex,
  t,
  tr,
}: {
  /** The species whose spawn entries count (an evolved form's first stage). */
  speciesId: string;
  dex: Dex;
  t: Translate;
  /** The region's texts (place names). */
  tr: Translate;
}) {
  const hints = guideHints(speciesId, dex);
  if (hints.length === 0) return null;
  const chips: { key: string; text: string }[] = [];
  const homes = [...new Set(hints.filter((h) => h.mainHome).flatMap((h) => h.zones))];
  const others = [...new Set(hints.flatMap((h) => h.zones))].filter((z) => !homes.includes(z));
  // owner: "Lives at" once, then the places
  const places = [...homes, ...others].slice(0, 3);
  const plain = hints.filter((h) => !h.requires);
  const nightOnly = plain.length > 0 && plain.every((h) => h.time === 'night');
  const dayOnly = plain.length > 0 && plain.every((h) => h.time === 'day');
  // owner: "Found at" (at night / by day when so) on its own line, the places below
  const lead = nightOnly
    ? 'guide.cond.foundAtNight'
    : dayOnly
      ? 'guide.cond.foundAtDay'
      : 'guide.cond.foundAt';
  if (places.length === 0) {
    if (nightOnly) chips.push({ key: 'night', text: t('guide.cond.night') });
    if (dayOnly) chips.push({ key: 'day', text: t('guide.cond.day') });
  }
  if (!nightOnly && !dayOnly && plain.some((h) => h.time === 'night'))
    chips.push({ key: 'moreNight', text: t('guide.cond.moreNight') });
  for (const a of [...new Set(hints.flatMap((h) => (h.requires ? [h.requires] : [])))])
    chips.push({
      key: `needs-${a}`,
      text: t(plain.length === 0 ? 'guide.cond.needs' : 'guide.cond.moreWith', {
        ability: t(`fieldAbility.${a}.name`),
      }),
    });
  if (places.length === 0 && chips.length === 0) return null;
  return (
    <div className="habitat" data-testid="habitat-chips">
      {places.length > 0 && (
        <>
          <p className="habitat-label" data-testid="habitat-lead">
            {t(lead)}
          </p>
          <div className="habitat-row">
            {places.map((z) => (
              <span key={z} className="habitat-chip">
                {tr(`zone.${z}.name`)}
              </span>
            ))}
          </div>
        </>
      )}
      {chips.length > 0 && (
        <div className="habitat-row">
          {chips.map((c) => (
            <span key={c.key} className="habitat-chip">
              {c.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
