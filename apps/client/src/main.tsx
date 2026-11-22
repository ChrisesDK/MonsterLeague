import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { NIGHT, PAPER } from './map/style';
import './ui/tokens.css';
import './ui/components.css';
import './styles.css';

/**
 * The phone's top bar (<meta name="theme-color">) is the map's building colour (owner):
 * beige by day, dark grey at night, on every screen. Android can't show it see-through
 * (Chrome ignores transparency in theme-color); on iPhone the installed app's status bar
 * is see-through instead (apple-mobile-web-app-status-bar-style in index.html).
 */
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const colour =
    document.documentElement.dataset.theme === 'night' ? NIGHT.building : PAPER.building;
  if (meta && meta.getAttribute('content') !== colour) meta.setAttribute('content', colour);
}
syncThemeColor();
new MutationObserver(syncThemeColor).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
