import { useState } from 'react';
import type { Translate } from '../i18n';
import { Button } from './components';
import { useInstall } from './install';

/**
 * "Install the game" (owner request): opens the browser's install prompt where there is one,
 * or shows the steps (iPhone and iPad, other browsers). Says so once the game is installed.
 */
export function InstallButton({
  t,
  showInstalled = false,
}: {
  t: Translate;
  showInstalled?: boolean;
}) {
  const { way, install } = useInstall();
  const [steps, setSteps] = useState(false);
  if (way === 'installed')
    return showInstalled ? (
      <p className="muted small" data-testid="install-done">
        {t('install.done')}
      </p>
    ) : null;
  return (
    <div className="install" data-testid="install" data-way={way}>
      <Button
        variant="primary"
        icon="check"
        data-testid="install-button"
        onClick={() => (way === 'prompt' ? void install() : setSteps((s) => !s))}
      >
        {t('install.button')}
      </Button>
      {steps && (
        <p className="small install-steps" data-testid="install-steps">
          {t(way === 'ios' ? 'install.ios' : 'install.manual')}
        </p>
      )}
    </div>
  );
}
