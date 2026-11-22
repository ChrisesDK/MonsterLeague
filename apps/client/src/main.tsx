import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './ui/tokens.css';
import './ui/components.css';
import './styles.css';

/**
 * The phone's top bar (<meta name="theme-color">) takes the colour of what is right below
 * it, so it doesn't border the game with a solid band: the sky while the map shows (the map
 * sets `--bar-top`), otherwise the paper colour of the current theme (cream by day, navy at
 * night). Android ignores transparency in theme-color, so blending is the closest to a
 * see-through bar there; on iPhone the installed app's status bar is see-through
 * (apple-mobile-web-app-status-bar-style in index.html).
 */
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const css = getComputedStyle(document.documentElement);
  const colour = (
    document.documentElement.style.getPropertyValue('--bar-top') || css.getPropertyValue('--paper')
  ).trim();
  if (meta && colour && meta.getAttribute('content') !== colour)
    meta.setAttribute('content', colour);
}
syncThemeColor();
new MutationObserver(syncThemeColor).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme', 'style'],
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
