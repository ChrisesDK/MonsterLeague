import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './ui/tokens.css';
import './ui/components.css';
import './styles.css';

/**
 * The phone's top bar (<meta name="theme-color">) is the menu's paper colour (owner: the
 * menu then looks like it fills the whole screen): cream by day, navy at night, on every
 * screen. Android can't show it see-through (Chrome ignores transparency in theme-color);
 * on iPhone the installed app's status bar is see-through instead
 * (apple-mobile-web-app-status-bar-style in index.html).
 */
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
  if (meta && paper && meta.getAttribute('content') !== paper) meta.setAttribute('content', paper);
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
