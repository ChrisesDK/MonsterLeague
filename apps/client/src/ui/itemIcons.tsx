/**
 * Item icons (owner request: items are easier to tell apart with a picture). Original, simple
 * drawings on a 24 × 24 grid, like the icon set: a bottle per tonic (filled more for the
 * bigger ones), a charm per grade in its own metal, a drop, a leaf and a blossom.
 */
import type { ReactNode } from 'react';

const OUTLINE = 'var(--ink)';

function bottle(fill: string, level: number): ReactNode {
  const top = 20 - 9 * level;
  return (
    <>
      <path d={`M7.6 ${top}h8.8v${20 - top - 1}a1 1 0 0 1-1 1H8.6a1 1 0 0 1-1-1Z`} fill={fill} />
      <path
        d="M10 3h4v4.2l2.6 3.2V19a2 2 0 0 1-2 2H9.4a2 2 0 0 1-2-2v-8.6L10 7.2Z"
        fill="none"
        stroke={OUTLINE}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path d="M9.4 3h5.2" stroke={OUTLINE} strokeWidth={1.6} strokeLinecap="round" />
    </>
  );
}

function charm(metal: string, shine: string): ReactNode {
  return (
    <>
      <circle cx="12" cy="13.5" r="6.5" fill={metal} stroke={OUTLINE} strokeWidth={1.6} />
      <circle cx="12" cy="13.5" r="3" fill="none" stroke={shine} strokeWidth={1.4} />
      <path
        d="M9.5 7.5 12 3l2.5 4.5"
        fill="none"
        stroke={OUTLINE}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </>
  );
}

const ITEMS: Record<string, ReactNode> = {
  small_tonic: bottle('#7cc47f', 0.35),
  medium_tonic: bottle('#5aa0d8', 0.6),
  large_tonic: bottle('#a978d4', 0.9),
  basic_charm: charm('#c8955a', '#f3d9b4'),
  good_charm: charm('#b9c2cc', '#ffffff'),
  great_charm: charm('#e2b53c', '#fff1b8'),
  clear_drops: (
    <path
      d="M12 3.5c3.3 4.3 5.5 7.6 5.5 10.6a5.5 5.5 0 0 1-11 0c0-3 2.2-6.3 5.5-10.6Z"
      fill="#9fd8ee"
      stroke={OUTLINE}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  ),
  revive_leaf: (
    <>
      <path
        d="M5 19C5 10 10.5 5 19.5 4.5 19 13.5 14 19 5 19Z"
        fill="#69b36b"
        stroke={OUTLINE}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path d="M5 19 14 10" stroke={OUTLINE} strokeWidth={1.4} strokeLinecap="round" />
    </>
  ),
  revive_blossom: (
    <>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse
          key={a}
          cx="12"
          cy="7.2"
          rx="3"
          ry="4"
          fill="#f2a7c3"
          stroke={OUTLINE}
          strokeWidth={1.3}
          transform={`rotate(${a} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="2.4" fill="#f6d45c" stroke={OUTLINE} strokeWidth={1.3} />
    </>
  ),
};

export function ItemIcon({ id, size = 32 }: { id: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="item-icon"
      data-item={id}
      aria-hidden
    >
      {ITEMS[id] ?? charm('var(--card)', 'var(--line)')}
    </svg>
  );
}
