/** Shared map marker pieces (play view and Town Map). */

export const START = { lat: 55.3998, lng: 10.3852 }; // Kongens Have

/** The player's map figure: a traveller in a red knitted cap with a satchel (original). */
export const PLAYER_SVG = `<svg viewBox="0 0 44 52" width="44" height="52" aria-hidden="true">
<ellipse cx="22" cy="48" rx="12" ry="3.6" fill="rgba(30,20,10,.25)"/>
<path d="M11 47c0-9 3-17 11-17s11 8 11 17z" fill="#2b6a94" stroke="#2a1f16" stroke-width="1.6"/>
<path d="M14 36l15 9" stroke="#8a5a2b" stroke-width="2.4" stroke-linecap="round"/>
<rect x="26" y="41" width="7" height="6" rx="1.5" fill="#a06a35" stroke="#2a1f16" stroke-width="1.2"/>
<path d="M15 30c4 3 10 3 14 0l-1 4c-4 2-8 2-12 0z" fill="#b8322a" stroke="#2a1f16" stroke-width="1.2"/>
<circle cx="22" cy="20" r="8.5" fill="#f2d4b0" stroke="#2a1f16" stroke-width="1.6"/>
<path d="M13.4 19.5a8.6 8.6 0 0 1 17.2 0c-5-2-12-2-17.2 0z" fill="#b8322a" stroke="#2a1f16" stroke-width="1.4"/>
<circle cx="22" cy="10" r="2.6" fill="#fffaf0" stroke="#2a1f16" stroke-width="1.2"/>
<circle cx="19" cy="22" r="1.1" fill="#2a1f16"/><circle cx="25" cy="22" r="1.1" fill="#2a1f16"/>
</svg>`;

export const STAR_SVG =
  '<svg class="icon" viewBox="0 0 24 24" width="40" height="40" fill="currentColor" stroke="#2a1f16" stroke-width="1.2" stroke-linejoin="round"><path d="M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4l-5.1 2.8L8 13.5 3.7 9.5l5.8-.7Z"/></svg>';

/** A DOM marker whose root MapLibre positions; animations live on `.marker-body` only. */
export function markerElement(
  tag: 'button' | 'div',
  cls: string,
  inner: string | HTMLElement,
): HTMLElement {
  const el = document.createElement(tag);
  el.className = cls;
  const body = document.createElement('div');
  body.className = 'marker-body';
  if (typeof inner === 'string') body.innerHTML = inner;
  else body.appendChild(inner);
  el.appendChild(body);
  return el;
}
