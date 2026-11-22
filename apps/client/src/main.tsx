import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './ui/tokens.css';
import './ui/components.css';
import './styles.css';

/**
 * The phone's top bar and navigation bar follow the paper colour of the current theme
 * (cream by day, navy at night), set in <meta name="theme-color">.
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
