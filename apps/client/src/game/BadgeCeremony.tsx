import { useEffect, type CSSProperties } from 'react';
import { badgeUrl } from '@oml/art';
import { regions, type RegionId } from '@oml/data';
import { challengeTier, fieldAbilityArena, obedienceLevel } from '@oml/game';
import type { Translate } from '../i18n';
import { buzz } from '../ui/feedback';

/** Paper confetti in the palette's colours (positions fixed, so screenshots are stable). */
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${(i % 7) * 0.12}s`,
  dx: `${((i * 53) % 120) - 60}px`,
  rot: `${360 + ((i * 97) % 360)}deg`,
  colour: ['var(--accent)', 'var(--gold)', 'var(--leaf)', 'var(--fjord)'][i % 4],
}));

/** Shown once when an arena is won: the badge, the new obedience level and the unlock. */
export function BadgeCeremony({
  t,
  arena,
  badges: held,
  region = 'odense',
  onDone,
}: {
  t: Translate;
  arena: number;
  /** All badges held now (P28: in an open region they come in any order). */
  badges?: readonly number[];
  /** P27: the campaign's region (its own badges and arenas). */
  region?: RegionId;
  onDone: () => void;
}) {
  const dex = regions[region];
  const badges = held ?? Array.from({ length: arena }, (_, i) => i + 1);
  const ability = Object.keys(dex.fieldAbilities).find(
    (f) => dex.open && fieldAbilityArena(f, dex) === arena,
  );
  useEffect(() => buzz('badge'), []);
  return (
    <main className="setup ceremony" data-testid="badge-ceremony" data-badge={arena}>
      <div className="confetti" aria-hidden>
        {CONFETTI.map((c, i) => (
          <i
            key={i}
            style={
              {
                left: c.left,
                background: c.colour,
                animationDelay: c.delay,
                '--dx': c.dx,
                '--rot': c.rot,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <header className="setup-header">
        <p className="muted">{t('ceremony.kicker')}</p>
        <h1>{t(`badge.${arena}.name`)}</h1>
      </header>
      <img
        className="ceremony-badge"
        src={badgeUrl(arena, true, region)}
        alt={t(`badge.${arena}.name`)}
      />
      <ul className="ceremony-list">
        <li>{t('ceremony.obedience', { level: obedienceLevel(badges) })}</li>
        {ability && (
          <li data-testid="ceremony-ability">
            {t('ceremony.ability', { ability: t(`fieldAbility.${ability}.name`) })}
          </li>
        )}
        {dex.open && badges.length < 8 && (
          <li data-testid="ceremony-tier">{t('ceremony.tier', { n: challengeTier(badges) })}</li>
        )}
        {!dex.open && arena < 8 && (
          <li>
            {t('ceremony.nextArena', {
              place: t(`arenaSite.${arena + 1}.name`),
              zone: t(`zone.${regions[region].arenaSites[arena]!.zone}.name`),
            })}
          </li>
        )}
      </ul>
      <button className="btn primary wide" data-testid="ceremony-done" onClick={onDone}>
        {t('ui.continue')}
      </button>
    </main>
  );
}
