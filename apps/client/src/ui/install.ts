/**
 * Install the game as an app (owner: testers played in the browser because they didn't find
 * the browser's own "install" item). Chrome, Edge and Android offer an install prompt the page
 * may open itself (`beforeinstallprompt`); iPhone and iPad have none, so the game shows the
 * two steps there. Nothing is shown once the game runs as an installed app.
 */
import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // the game offers it with its own button
    deferred = e as InstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    changed();
  });
}

export function isInstalled(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export const isIos = (): boolean =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac with touch
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export type InstallWay = 'prompt' | 'ios' | 'manual' | 'installed';

/** How this browser installs the game, kept up to date. */
export function useInstall(): { way: InstallWay; install: () => Promise<boolean> } {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  const way: InstallWay = isInstalled()
    ? 'installed'
    : deferred
      ? 'prompt'
      : isIos()
        ? 'ios'
        : 'manual';
  const install = async () => {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    changed();
    return outcome === 'accepted';
  };
  return { way, install };
}
