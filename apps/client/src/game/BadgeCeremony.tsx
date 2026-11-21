import { useEffect, type CSSProperties } from 'react';
import { badgeUrl } from '@oml/art';
import { obedienceLevel } from '@oml/game';
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
  onDone,
}: {
  t: Translate;
  arena: number;
  onDone: () => void;
}) {
  const badges = Array.from({ length: arena }, (_, i) => i + 1);
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
      <img className="ceremony-badge" src={badgeUrl(arena)} alt={t(`badge.${arena}.name`)} />
      <ul className="ceremony-list">
        <li>{t('ceremony.obedience', { level: obedienceLevel(badges) })}</li>
        {arena < 8 && <li>{t('ceremony.district', { n: arena + 1 })}</li>}
      </ul>
      <button className="btn primary wide" data-testid="ceremony-done" onClick={onDone}>
        {t('ui.continue')}
      </button>
    </main>
  );
}
