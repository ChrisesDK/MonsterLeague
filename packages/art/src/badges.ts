/**
 * Badge art (P27, owner request: every badge a different design). Each region has its own
 * eight badges; each badge has its own outline, colour and emblem from its arena's place.
 * 64×64 viewBox, original drawings (A1 placeholder style: ink lines on paper colours).
 */

const INK = '#2a1f16';
const PAPER = '#fffaf0';
const EMPTY = '#d8ccb8';
const EMPTY_INK = '#b5a891';

export type BadgeRegion = 'odense' | 'svendborg';
export const BADGE_REGIONS: readonly BadgeRegion[] = ['odense', 'svendborg'];

const poly = (n: number, r: number, rot = 0, cx = 32, cy = 32) =>
  Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * Math.PI * 2;
    return `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');

/** Outlines: each badge's own shape (fill and stroke set by the caller). */
const SHAPE = {
  roundSquare: () => `<rect x="6" y="6" width="52" height="52" rx="13"/>`,
  hexagon: () => `<polygon points="${poly(6, 29, -Math.PI / 2)}"/>`,
  shield: () => `<path d="M32 4 L57 12 V31 C57 46 46 55 32 61 C18 55 7 46 7 31 V12 Z"/>`,
  leaf: () => `<path d="M32 3 C53 13 60 37 32 61 C4 37 11 13 32 3 Z"/>`,
  diamond: () => `<path d="M32 2 L62 32 L32 62 L2 32 Z"/>`,
  house: () => `<path d="M32 3 L61 26 V60 H3 V26 Z"/>`,
  rosette: () =>
    Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<circle cx="${(32 + Math.cos(a) * 21).toFixed(2)}" cy="${(32 + Math.sin(a) * 21).toFixed(2)}" r="8"/>`;
    }).join('') + `<circle cx="32" cy="32" r="22"/>`,
  star: () => {
    const pts = Array.from({ length: 16 }, (_, i) => {
      const a = -Math.PI / 2 + (i / 16) * Math.PI * 2;
      const r = i % 2 === 0 ? 30 : 21;
      return `${(32 + Math.cos(a) * r).toFixed(2)},${(32 + Math.sin(a) * r).toFixed(2)}`;
    });
    return `<polygon points="${pts.join(' ')}"/>`;
  },
  octagon: () => `<polygon points="${poly(8, 29, Math.PI / 8)}"/>`,
  flame: () =>
    `<path d="M32 2 C44 17 58 27 56 42 C54 56 42 62 32 62 C22 62 10 56 8 42 C6 27 20 17 32 2 Z"/>`,
  waveCircle: () => {
    const pts = Array.from({ length: 72 }, (_, i) => {
      const a = (i / 72) * Math.PI * 2;
      const r = 27 + 2.6 * Math.sin(a * 12);
      return `${(32 + Math.cos(a) * r).toFixed(2)},${(32 + Math.sin(a) * r).toFixed(2)}`;
    });
    return `<polygon points="${pts.join(' ')}"/>`;
  },
  wheel: () =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      const x = 32 + Math.cos(a) * 27;
      const y = 32 + Math.sin(a) * 27;
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.5"/>`;
    }).join('') + `<circle cx="32" cy="32" r="24"/>`,
  cog: () => {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2;
      for (const [da, r] of [
        [0, 23],
        [0.06, 29],
        [0.25, 29],
        [0.31, 23],
      ] as const) {
        const a = a0 + da * ((Math.PI * 2) / 10) * 1.6;
        pts.push(`${(32 + Math.cos(a) * r).toFixed(2)},${(32 + Math.sin(a) * r).toFixed(2)}`);
      }
    }
    return `<polygon points="${pts.join(' ')}"/>`;
  },
  coin: () => `<circle cx="32" cy="32" r="28"/>`,
  banner: () => `<path d="M8 4 H56 V60 L32 50 L8 60 Z"/>`,
  trefoil: () =>
    `<circle cx="32" cy="17" r="15"/><circle cx="18" cy="40" r="15"/><circle cx="46" cy="40" r="15"/><circle cx="32" cy="34" r="16"/>`,
} as const;
type Shape = keyof typeof SHAPE;

/** Emblems drawn on a paper disc in the middle (stroke INK, fill `c` = the badge colour). */
const EMBLEM: Record<string, (c: string) => string> = {
  crown: (c) =>
    `<path d="M20 39 L18 25 L25.5 31 L32 21 L38.5 31 L46 25 L44 39 Z" fill="${c}"/><path d="M20 43 H44"/><circle cx="32" cy="21" r="2" fill="${PAPER}"/>`,
  mound: (c) =>
    `<path d="M14 44 Q32 28 50 44 Z" fill="${c}"/><path d="M27 35 V22 H29.5 V25 H31 V22 H33 V25 H34.5 V22 H37 V35" fill="${PAPER}"/>`,
  fjord: (c) =>
    `<path d="M21 34 Q27 24 35 31 Q39 27 43 34 Z" fill="${c}"/><path d="M16 39 q4 -3 8 0 t8 0 t8 0 t8 0 M18 45 q4 -3 8 0 t8 0 t8 0" fill="none"/>`,
  tree: (c) =>
    `<path d="M32 48 V36" /><circle cx="32" cy="27" r="9" fill="${c}"/><circle cx="24" cy="31" r="6" fill="${c}"/><circle cx="40" cy="31" r="6" fill="${c}"/><path d="M26 48 H38"/>`,
  snail: (c) =>
    `<path d="M16 44 H46 Q50 44 49 40" fill="none"/><path d="M32 42 C20 42 19 26 31 25 C40 24 42 36 34 37 C28 38 28 30 32 30" fill="${c}"/><path d="M45 40 L47 31 M47 31 l-1.5 -2 M47 31 l2 -1.5" fill="none"/>`,
  anvil: (c) =>
    `<path d="M17 30 H43 C43 34 39 36 35 36 V41 H40 V45 H22 V41 H27 V36 H22 C19 36 17 33 17 30 Z" fill="${c}"/><path d="M44 18 l3 -3 M48 24 h4 M41 15 v-4" fill="none"/>`,
  paw: (c) =>
    `<ellipse cx="32" cy="38" rx="8.5" ry="7" fill="${c}"/><circle cx="22" cy="29" r="3.6" fill="${c}"/><circle cx="28" cy="23" r="3.6" fill="${c}"/><circle cx="36" cy="23" r="3.6" fill="${c}"/><circle cx="42" cy="29" r="3.6" fill="${c}"/>`,
  bolt: (c) =>
    `<path d="M14 46 Q32 34 50 46" fill="none"/><path d="M35 15 L25 32 H32 L28 44 L41 26 H34 Z" fill="${c}"/>`,
  lantern: (c) =>
    `<path d="M27 18 H37 M32 14 V18 M25 22 H39 L37 44 H27 Z" fill="${PAPER}"/><path d="M32 27 C36 31 35 36 32 38 C29 36 28 31 32 27 Z" fill="${c}"/><path d="M24 44 H40"/>`,
  bonfire: (c) =>
    `<path d="M20 46 L44 38 M20 38 L44 46" /><path d="M32 16 C38 24 41 29 39 35 C37 40 27 40 25 35 C23 29 28 25 30 20 C31 24 33 25 32 16 Z" fill="${c}"/>`,
  island: (c) =>
    `<path d="M19 38 Q26 22 32 28 Q38 22 45 38 Z" fill="${c}"/><path d="M14 42 q4 -3 8 0 t8 0 t8 0 t8 0 t4 0" fill="none"/><circle cx="40" cy="19" r="3.5" fill="${PAPER}"/>`,
  anchor: (c) =>
    `<circle cx="32" cy="18" r="3" fill="${PAPER}"/><path d="M32 21 V45 M25 27 H39" /><path d="M19 37 C21 46 43 46 45 37 L41 39 M19 37 L23 39" fill="none"/><circle cx="32" cy="45" r="2" fill="${c}"/>`,
  palace: (c) =>
    `<path d="M15 45 V33 H22 V29 H42 V33 H49 V45 Z" fill="${c}"/><path d="M27 29 C27 21 37 21 37 29" fill="${PAPER}"/><path d="M32 21 V16 M19 38 V41 M25 34 V41 M32 34 V45 M39 34 V41 M45 38 V41" fill="none"/>`,
  windmill: (c) =>
    `<path d="M27 46 L29 30 H35 L37 46 Z" fill="${c}"/><path d="M32 28 L20 16 M32 28 L44 16 M32 28 L20 40 M32 28 L44 40" fill="none"/><circle cx="32" cy="28" r="2.5" fill="${PAPER}"/>`,
  oakleaf: (c) =>
    `<path d="M32 15 C36 18 34 21 38 22 C42 23 39 27 42 29 C45 32 40 34 41 37 C42 41 36 40 34 43 L32 47 L30 43 C28 40 22 41 23 37 C24 34 19 32 22 29 C25 27 22 23 26 22 C30 21 28 18 32 15 Z" fill="${c}"/><path d="M32 22 V48" fill="none"/>`,
  bracteate: (c) =>
    `<circle cx="32" cy="32" r="14" fill="${c}"/><circle cx="32" cy="32" r="9" fill="none"/><circle cx="32" cy="32" r="3" fill="${PAPER}"/>` +
    Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<circle cx="${(32 + Math.cos(a) * 11.5).toFixed(2)}" cy="${(32 + Math.sin(a) * 11.5).toFixed(2)}" r="0.9" fill="${INK}"/>`;
    }).join(''),
};

interface BadgeDesign {
  shape: Shape;
  colour: string;
  emblem: keyof typeof EMBLEM;
}

/** Arena 1–8 per region (themes in the GDD's arena tables). */
export const BADGES: Record<BadgeRegion, BadgeDesign[]> = {
  odense: [
    { shape: 'roundSquare', colour: '#c8553d', emblem: 'crown' }, // Kongens Have, Folk
    { shape: 'hexagon', colour: '#8a8f98', emblem: 'mound' }, // Næsbyhoved castle mound, Stone
    { shape: 'shield', colour: '#3d8fb8', emblem: 'fjord' }, // Stige Ø, Water
    { shape: 'leaf', colour: '#5a9a4f', emblem: 'tree' }, // H.C. Andersen Skoven, Grove
    { shape: 'diamond', colour: '#9b6bc2', emblem: 'snail' }, // Hollufgård / Sneglehøjen, Spirit
    { shape: 'house', colour: '#d9772e', emblem: 'anvil' }, // Den Fynske Landsby, Fire
    { shape: 'rosette', colour: '#b07a3a', emblem: 'paw' }, // Odense Zoo, Mixed
    { shape: 'star', colour: '#d3b02f', emblem: 'bolt' }, // Tusindårsskoven, Storm
  ],
  svendborg: [
    { shape: 'octagon', colour: '#7c5cb0', emblem: 'lantern' }, // old harbour, Spirit
    { shape: 'flame', colour: '#d0582e', emblem: 'bonfire' }, // Christiansminde, Fire
    { shape: 'waveCircle', colour: '#2f86b0', emblem: 'island' }, // Thurø, Water
    { shape: 'wheel', colour: '#c9a23a', emblem: 'anchor' }, // Troense, Storm
    { shape: 'banner', colour: '#b8433b', emblem: 'palace' }, // Valdemars Slot, Folk
    { shape: 'cog', colour: '#7d756a', emblem: 'windmill' }, // Egebjerg Mølle, Stone
    { shape: 'trefoil', colour: '#3f8a58', emblem: 'oakleaf' }, // Hvidkilde, Grove
    { shape: 'coin', colour: '#d8a52a', emblem: 'bracteate' }, // Gudme gold, Mixed
  ],
};

/** A badge (64×64). `earned` false = the empty slot: the same outline, greyed. */
export function badgeSvg(arena: number, earned = true, region: BadgeRegion = 'odense'): string {
  const d = BADGES[region][(arena - 1) % 8]!;
  const colour = earned ? d.colour : EMPTY;
  const ink = earned ? INK : EMPTY_INK;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">`,
    `<g fill="${colour}" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round">${SHAPE[d.shape]()}</g>`,
    `<circle cx="32" cy="32" r="18" fill="${PAPER}" stroke="${ink}" stroke-width="2"/>`,
    `<g stroke="${ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">${EMBLEM[d.emblem]!(earned ? colour : EMPTY)}</g>`,
    `</svg>`,
  ].join('');
}
