import { badgeUrl } from '@oml/art';
import { obedienceLevel } from '@oml/game';
import type { Translate } from '../i18n';

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
  return (
    <main className="setup ceremony" data-testid="badge-ceremony" data-badge={arena}>
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
