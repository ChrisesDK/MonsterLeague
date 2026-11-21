/**
 * A1 placeholder creature art (GDD "Creature art pipeline"): one original SVG per species,
 * generated from code. Everything is chosen deterministically from the species id, its
 * types and its stage, so the same species always looks the same. Simple, friendly shapes
 * with a paper-cut outline; no resemblance to any existing franchise creature is intended
 * or derived (no reference images or names are used).
 */

export interface CreatureArtInput {
  id: string;
  /** Type colours, primary first (from types.json). */
  colors: string[];
  /** Marker ring colour (the main type's colour); defaults to the first colour. */
  ring?: string;
  types: string[];
  /** Base stat total (bigger creatures for bigger totals). */
  bst: number;
  /** 1 = first stage, 2 = evolved. */
  stage: 1 | 2;
}

const INK = '#3b2a20';
const PAPER = '#fbf4e6';

function hash32(text: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32) seeded from the species id. */
function picker(id: string) {
  let a = hash32(id);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!,
    range: (lo: number, hi: number) => lo + next() * (hi - lo),
  };
}

function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (c: number) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))
      .toString(16)
      .padStart(2, '0');
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

type Shape = 'round' | 'pear' | 'bean' | 'tall' | 'wide' | 'drop';

/** Body outline as a closed cubic path around (cx, cy) with half-width w, half-height h. */
function bodyPath(shape: Shape, cx: number, cy: number, w: number, h: number): string {
  // Control-point factors per shape: [top width, bottom width, top lift, bottom drop].
  const f: Record<Shape, [number, number, number, number]> = {
    round: [1, 1, 1, 1],
    pear: [0.78, 1.12, 1.02, 0.95],
    bean: [0.95, 1.05, 1.08, 0.9],
    tall: [0.92, 0.98, 1.05, 1],
    wide: [1.05, 1.08, 0.92, 0.95],
    drop: [0.6, 1.1, 1.18, 0.92],
  };
  const [tw, bw, tl, bd] = f[shape];
  const k = 0.56;
  const top = cy - h * tl;
  const bottom = cy + h * bd;
  return [
    `M${r1(cx)} ${r1(top)}`,
    `C${r1(cx + w * tw * k)} ${r1(top)} ${r1(cx + w * tw)} ${r1(cy - h * k)} ${r1(cx + w * ((tw + bw) / 2))} ${r1(cy)}`,
    `C${r1(cx + w * bw)} ${r1(cy + h * k)} ${r1(cx + w * bw * k)} ${r1(bottom)} ${r1(cx)} ${r1(bottom)}`,
    `C${r1(cx - w * bw * k)} ${r1(bottom)} ${r1(cx - w * bw)} ${r1(cy + h * k)} ${r1(cx - w * ((tw + bw) / 2))} ${r1(cy)}`,
    `C${r1(cx - w * tw)} ${r1(cy - h * k)} ${r1(cx - w * tw * k)} ${r1(top)} ${r1(cx)} ${r1(top)}Z`,
  ].join(' ');
}

/** Type-flavoured features drawn behind (back) or on top of (front) the body. */
function features(
  type: string,
  p: ReturnType<typeof picker>,
  g: { cx: number; cy: number; w: number; h: number; top: number },
  fill: string,
  dark: string,
): { back: string[]; front: string[] } {
  const back: string[] = [];
  const front: string[] = [];
  const { cx, cy, w, h, top } = g;
  const stroke = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  switch (type) {
    case 'fire': {
      const s = p.range(0.8, 1.1);
      back.push(
        `<path d="M${cx - 10 * s} ${top + 6} C${cx - 16 * s} ${top - 10 * s} ${cx - 4 * s} ${top - 14 * s} ${cx} ${top - 26 * s} C${cx + 4 * s} ${top - 12 * s} ${cx + 16 * s} ${top - 10 * s} ${cx + 10 * s} ${top + 6}Z" fill="${shade(fill, 0.25)}" ${stroke}/>`,
      );
      if (p.next() > 0.4)
        back.push(
          `<path d="M${cx + w * 0.8} ${cy + h * 0.4} C${cx + w * 1.25} ${cy + h * 0.3} ${cx + w * 1.15} ${cy - h * 0.2} ${cx + w * 1.4} ${cy - h * 0.45} C${cx + w * 1.45} ${cy + h * 0.1} ${cx + w * 1.3} ${cy + h * 0.55} ${cx + w * 0.85} ${cy + h * 0.7}Z" fill="${shade(fill, 0.15)}" ${stroke}/>`,
        );
      break;
    }
    case 'water': {
      back.push(
        `<path d="M${cx - w * 0.2} ${cy - h * 0.9} Q${cx + w * 0.1} ${cy - h * 1.45} ${cx + w * 0.45} ${cy - h * 0.8}Z" fill="${shade(fill, 0.2)}" ${stroke}/>`,
      );
      if (p.next() > 0.3)
        back.push(
          `<path d="M${cx + w * 0.85} ${cy + h * 0.35} Q${cx + w * 1.5} ${cy + h * 0.1} ${cx + w * 1.35} ${cy + h * 0.75} Q${cx + w * 1.15} ${cy + h * 0.55} ${cx + w * 0.8} ${cy + h * 0.7}Z" fill="${shade(fill, 0.1)}" ${stroke}/>`,
        );
      break;
    }
    case 'grove': {
      const lean = p.range(-8, 8);
      back.push(
        `<path d="M${cx} ${top + 4} L${cx + lean * 0.4} ${top - 10}" ${stroke} fill="none"/>`,
        `<path d="M${cx + lean * 0.4} ${top - 10} C${cx + lean - 16} ${top - 14} ${cx + lean - 14} ${top - 30} ${cx + lean} ${top - 30} C${cx + lean + 14} ${top - 30} ${cx + lean + 16} ${top - 14} ${cx + lean * 0.4} ${top - 10}Z" fill="${shade(fill, 0.2)}" ${stroke}/>`,
      );
      if (p.next() > 0.5)
        back.push(
          `<path d="M${cx - w * 0.75} ${cy - h * 0.55} C${cx - w * 1.35} ${cy - h * 0.9} ${cx - w * 1.2} ${cy - h * 0.2} ${cx - w * 0.85} ${cy - h * 0.2}Z" fill="${shade(fill, 0.1)}" ${stroke}/>`,
          `<path d="M${cx + w * 0.75} ${cy - h * 0.55} C${cx + w * 1.35} ${cy - h * 0.9} ${cx + w * 1.2} ${cy - h * 0.2} ${cx + w * 0.85} ${cy - h * 0.2}Z" fill="${shade(fill, 0.1)}" ${stroke}/>`,
        );
      break;
    }
    case 'stone': {
      const n = p.next() > 0.5 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const x = cx - w * 0.5 + (i * w) / (n - 0.5);
        back.push(
          `<path d="M${x - 9} ${top + 10} L${x - 3} ${top - 8} L${x + 9} ${top + 2} Z" fill="${shade(dark, 0.15)}" ${stroke}/>`,
        );
      }
      front.push(
        `<path d="M${cx - w * 0.35} ${cy + h * 0.35} l8 -6 l10 4 l-2 9 l-12 2 Z" fill="${shade(fill, 0.25)}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`,
      );
      break;
    }
    case 'storm': {
      back.push(
        `<path d="M${cx - w * 0.9} ${cy} C${cx - w * 1.6} ${cy - h * 0.6} ${cx - w * 1.5} ${cy + h * 0.2} ${cx - w * 1.7} ${cy + h * 0.35} C${cx - w * 1.3} ${cy + h * 0.45} ${cx - w * 1.1} ${cy + h * 0.3} ${cx - w * 0.85} ${cy + h * 0.3}Z" fill="${shade(fill, 0.25)}" ${stroke}/>`,
        `<path d="M${cx + w * 0.9} ${cy} C${cx + w * 1.6} ${cy - h * 0.6} ${cx + w * 1.5} ${cy + h * 0.2} ${cx + w * 1.7} ${cy + h * 0.35} C${cx + w * 1.3} ${cy + h * 0.45} ${cx + w * 1.1} ${cy + h * 0.3} ${cx + w * 0.85} ${cy + h * 0.3}Z" fill="${shade(fill, 0.25)}" ${stroke}/>`,
      );
      back.push(
        `<path d="M${cx - 4} ${top + 4} l-6 -14 l8 4 l2 -12 l6 16 l-8 -3 Z" fill="${shade(fill, 0.4)}" ${stroke}/>`,
      );
      break;
    }
    case 'spirit': {
      back.push(
        `<circle cx="${cx}" cy="${cy}" r="${r1(Math.max(w, h) * 1.25)}" fill="${shade(fill, 0.55)}" opacity="0.45"/>`,
      );
      front.push(
        `<path d="M${cx - w * 0.7} ${cy + h * 0.75} q6 10 12 0 q6 10 12 0 q6 10 12 0 q6 10 12 0" fill="none" stroke="${PAPER}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>`,
      );
      break;
    }
    default: {
      // folk: round ears and little arms
      const ear = p.range(9, 13);
      back.push(
        `<circle cx="${cx - w * 0.62}" cy="${top + 6}" r="${r1(ear)}" fill="${shade(fill, -0.05)}" ${stroke}/>`,
        `<circle cx="${cx + w * 0.62}" cy="${top + 6}" r="${r1(ear)}" fill="${shade(fill, -0.05)}" ${stroke}/>`,
      );
      front.push(
        `<path d="M${cx - w * 0.85} ${cy + h * 0.2} q-8 6 -4 14" fill="none" ${stroke}/>`,
        `<path d="M${cx + w * 0.85} ${cy + h * 0.2} q8 6 4 14" fill="none" ${stroke}/>`,
      );
    }
  }
  return { back, front };
}

/** The creature sprite as a standalone SVG (viewBox 0 0 128 128). */
export function creatureSvg(input: CreatureArtInput): string {
  const p = picker(input.id);
  const primary = input.colors[0] ?? '#a8a29e';
  const secondary = input.colors[1];
  const fill = shade(primary, 0.12);
  const dark = shade(primary, -0.25);
  const belly = secondary ? shade(secondary, 0.35) : shade(primary, 0.5);

  const size =
    0.78 +
    Math.max(0, Math.min(1, (input.bst - 240) / 160)) * 0.22 +
    (input.stage === 2 ? 0.04 : 0);
  const shape = p.pick<Shape>(['round', 'pear', 'bean', 'tall', 'wide', 'drop']);
  const w = r1(34 * size * (shape === 'wide' ? 1.15 : shape === 'tall' ? 0.88 : 1));
  const h = r1(32 * size * (shape === 'tall' ? 1.18 : shape === 'wide' ? 0.88 : 1));
  const cx = 64;
  const cy = 74 - (h - 32) * 0.2;
  const top = cy - h;

  const geom = { cx, cy, w, h, top };
  const f1 = features(input.types[0] ?? 'folk', p, geom, fill, dark);
  const f2 = input.types[1]
    ? features(input.types[1], p, geom, secondary ? shade(secondary, 0.1) : fill, dark)
    : null;
  const back = [...f1.back, ...(f2?.back ?? [])];
  const front = [...f1.front, ...(f2?.front ?? [])];

  // Evolved forms get a small crest.
  if (input.stage === 2) {
    back.push(
      `<path d="M${cx - 14} ${top + 8} l6 -16 l8 10 l8 -10 l6 16 Z" fill="${shade(dark, 0.1)}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`,
    );
  }

  const eyeStyle = p.pick(['round', 'big', 'sleepy'] as const);
  const eyeY = r1(cy - h * p.range(0.18, 0.32));
  const eyeDx = r1(w * p.range(0.3, 0.42));
  const er = eyeStyle === 'big' ? 7.5 : 6;
  const eye = (x: number) =>
    eyeStyle === 'sleepy'
      ? `<path d="M${r1(x - 6)} ${eyeY} q6 6 12 0" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`
      : `<circle cx="${r1(x)}" cy="${eyeY}" r="${er}" fill="${INK}"/><circle cx="${r1(x + er * 0.35)}" cy="${r1(eyeY - er * 0.35)}" r="${r1(er * 0.35)}" fill="#fff"/>`;
  const mouthY = r1(eyeY + p.range(10, 14));
  const mouth = p.pick([
    `<path d="M${cx - 5} ${mouthY} q5 5 10 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
    `<ellipse cx="${cx}" cy="${mouthY + 1}" rx="3" ry="3.6" fill="${INK}"/>`,
    `<path d="M${cx - 6} ${mouthY} q3 4 6 0 q3 4 6 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  ]);
  const cheeks =
    p.next() > 0.4
      ? `<ellipse cx="${r1(cx - eyeDx - 5)}" cy="${r1(eyeY + 9)}" rx="5" ry="3" fill="#f2a097" opacity="0.7"/><ellipse cx="${r1(cx + eyeDx + 5)}" cy="${r1(eyeY + 9)}" rx="5" ry="3" fill="#f2a097" opacity="0.7"/>`
      : '';
  const feet = `<ellipse cx="${r1(cx - w * 0.45)}" cy="${r1(cy + h * 0.95)}" rx="9" ry="5.5" fill="${dark}" stroke="${INK}" stroke-width="3"/><ellipse cx="${r1(cx + w * 0.45)}" cy="${r1(cy + h * 0.95)}" rx="9" ry="5.5" fill="${dark}" stroke="${INK}" stroke-width="3"/>`;
  const bellyShape = `<ellipse cx="${cx}" cy="${r1(cy + h * 0.38)}" rx="${r1(w * 0.55)}" ry="${r1(h * 0.42)}" fill="${belly}"/>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img">`,
    `<ellipse cx="64" cy="${r1(cy + h + 6)}" rx="${r1(w * 0.9)}" ry="5" fill="${INK}" opacity="0.18"/>`,
    ...back,
    feet,
    `<path d="${bodyPath(shape, cx, cy, w, h)}" fill="${fill}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`,
    bellyShape,
    ...front,
    eye(cx - eyeDx),
    eye(cx + eyeDx),
    cheeks,
    mouth,
    `</svg>`,
  ].join('');
}

/** Map marker: a paper badge with a type-coloured ring and the creature inside (64×76). */
export function markerSvg(input: CreatureArtInput): string {
  const ring = input.ring ?? input.colors[0] ?? '#a8a29e';
  const inner = creatureSvg(input)
    .replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img">', '')
    .replace('</svg>', '');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 76" role="img">`,
    `<path d="M32 74 L22 56 L42 56 Z" fill="${INK}"/>`,
    `<circle cx="32" cy="32" r="29" fill="${PAPER}" stroke="${ring}" stroke-width="5"/>`,
    `<circle cx="32" cy="32" r="31.5" fill="none" stroke="${INK}" stroke-width="1.5"/>`,
    `<g transform="translate(5 6) scale(0.42)">${inner}</g>`,
    `</svg>`,
  ].join('');
}

/** Generic hint marker for spawns that need a field ability ("rustling…"); species hidden. */
export function hintMarkerSvg(): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 76" role="img">`,
    `<path d="M32 74 L22 56 L42 56 Z" fill="${INK}" opacity="0.6"/>`,
    `<circle cx="32" cy="32" r="29" fill="${PAPER}" stroke="#8a7a66" stroke-width="4" stroke-dasharray="6 5"/>`,
    `<path d="M20 40 C20 28 28 20 32 16 C36 20 44 28 44 40 C44 46 38 48 32 48 C26 48 20 46 20 40Z" fill="#7fa36b" stroke="${INK}" stroke-width="2.5"/>`,
    `<path d="M32 18 L32 46" stroke="${INK}" stroke-width="2"/>`,
    `<path d="M14 24 q-4 4 0 8 M50 24 q4 4 0 8 M12 40 q-4 4 0 8 M52 40 q4 4 0 8" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
    `</svg>`,
  ].join('');
}
