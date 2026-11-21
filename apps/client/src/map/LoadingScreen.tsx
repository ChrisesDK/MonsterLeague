import type { Translate } from '../i18n';
import { Icon } from '../ui/icons';

/**
 * Shown while the play view finds the player's position and builds the town (map tiles and
 * 3D buildings around the player). Two steps, each ticked off when done.
 */
export function LoadingScreen({
  t,
  located,
  built,
  leaving,
}: {
  t: Translate;
  located: boolean;
  built: boolean;
  /** Fading out (both steps done). */
  leaving: boolean;
}) {
  const step = (done: boolean, active: boolean, label: string, id: string) => (
    <li className={`loading-step${done ? ' done' : active ? ' active' : ''}`} data-step={id}>
      <span className="loading-mark" aria-hidden>
        {done ? <Icon name="check" size={18} /> : <span className="loading-dot" />}
      </span>
      {label}
    </li>
  );
  return (
    <div
      className={`loading-screen${leaving ? ' leaving' : ''}`}
      data-testid="loading-screen"
      role="status"
      aria-live="polite"
    >
      <div className="loading-lantern" aria-hidden>
        <Icon name="lantern" size={72} />
      </div>
      <h1>{t('loading.title')}</h1>
      <ul className="loading-steps">
        {step(located, !located, t('loading.locating'), 'locate')}
        {step(built, located && !built, t('loading.building'), 'build')}
      </ul>
    </div>
  );
}
