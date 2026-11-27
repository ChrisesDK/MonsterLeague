/**
 * Original icon set (M2d). Simple ink-line drawings on a 24 × 24 grid, coloured with
 * currentColor. Nothing here is copied from another game or icon font.
 */
import type { CSSProperties } from 'react';

const PATHS = {
  /** Main menu: a leather satchel with a flap and a buckle. */
  satchel: (
    <>
      <path d="M5 9.5h14a1 1 0 0 1 1 1V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8.5a1 1 0 0 1 1-1Z" />
      <path d="M8.5 9.5V7a3.5 3.5 0 0 1 7 0v2.5" />
      <path d="M4.2 10.4 12 15l7.8-4.6" />
      <rect x="10.4" y="13.6" width="3.2" height="3" rx="0.8" />
    </>
  ),
  lantern: (
    <>
      <path d="M9 4h6M12 2v2M8 7h8l-1 11H9L8 7Z" />
      <path d="M7 18h10M12 10.5c1.3 1.2 1.3 2.8 0 4-1.3-1.2-1.3-2.8 0-4Z" />
    </>
  ),
  journal: (
    <>
      <path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M8 3v18M11 8h4M11 11h4" />
      <path d="M15 17l1.2-1.2L17.4 17" />
    </>
  ),
  /** Feedback: a speech bubble with a pencil line. */
  feedback: (
    <>
      <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-4.5 3.5V17H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      <path d="M8 11h8M8 8h5" />
    </>
  ),
  /** Filter: the standard funnel. */
  filter: <path d="M3.5 5h17l-6.5 7.8V19l-4 1.8v-8L3.5 5Z" />,
  /** A coin (skilling). */
  coin: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v9M9.6 9.6h3.6a1.6 1.6 0 0 1 0 3.2h-2.4a1.6 1.6 0 0 0 0 3.2h3.6" />
    </>
  ),
  /** Folded paper map. */
  map: (
    <>
      <path d="M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20Z" />
      <path d="M8.5 4v13.5M15.5 6.5V20" />
    </>
  ),
  /** Compass rose: the red tip points north. */
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 4.5 14.2 12h-4.4Z" fill="currentColor" stroke="none" className="tip" />
      <path d="M12 19.5 9.8 12h4.4Z" />
    </>
  ),
  recentre: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  arrow: <path d="M12 3 19 20l-7-4-7 4Z" fill="currentColor" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  back: <path d="M15 5 8 12l7 7" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  /** Team: two creature heads side by side. */
  team: (
    <>
      <circle cx="8.5" cy="10" r="4" />
      <circle cx="16" cy="12" r="3.2" />
      <path d="M6.5 6.8 5.5 4.5M10.5 6.8l1-2.3M3.5 20c.8-3 2.8-4.5 5-4.5s4.2 1.5 5 4.5M13.5 20c.4-2 1.4-3.3 2.6-3.3S18.7 18 19 20" />
    </>
  ),
  /** Bag: a drawstring pouch. */
  bag: (
    <>
      <path d="M8 7h8c2.5 2.3 4 5.2 4 8.2C20 19 17 21 12 21s-8-2-8-5.8C4 12.2 5.5 9.3 8 7Z" />
      <path d="M8.5 7 7 3.5M15.5 7 17 3.5M8 7c2.5 1.2 5.5 1.2 8 0" />
    </>
  ),
  /** Field guide: an open book with a leaf. */
  guide: (
    <>
      <path d="M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1V19c-3-1-6-1-9 1-3-2-6-2-9-1Z" />
      <path d="M12 6.5V20" />
      <path d="M15 14.5c0-2.5 1.5-4 4-4.5-.2 2.6-1.6 4.2-4 4.5Zm0 0 2-2" />
    </>
  ),
  /** Badge: a rosette with two ribbon tails. */
  badge: (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <circle cx="12" cy="9" r="2.5" />
      <path d="M9 13.8 7.5 21l4.5-2.5 4.5 2.5-1.5-7.2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  /** Rest stop: a steaming cup. */
  rest: (
    <>
      <path d="M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z" />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H15.5M9 3.5c-.8 1 .8 2 0 3M12.5 3.5c-.8 1 .8 2 0 3" />
    </>
  ),
  /** Arena: a little tower with a pennant. */
  arena: (
    <>
      <path d="M5 21V10l2-2 2 2v-2l3-3 3 3v2l2-2 2 2v11Z" />
      <path d="M12 5V2l3 1-3 1M10 21v-4a2 2 0 0 1 4 0v4" />
    </>
  ),
  /** Trainer: a walking stick and a cap. */
  trainer: (
    <>
      <circle cx="11" cy="6" r="2.6" />
      <path d="M8.2 5h5.6M7 21l2-8 3 1 1.5 7M9 13l-1.5-3L11 9.5l3.5 2.5M18 6v15" />
    </>
  ),
  star: <path d="M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4l-5.1 2.8L8 13.5 3.7 9.5l5.8-.7Z" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  /** Route: a dotted path between two pins. */
  route: (
    <>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M7.5 16.5c3-1 1-5 4.5-6s3-3 4.5-3" strokeDasharray="1.5 2.5" />
    </>
  ),
  /** Wild area: grass tufts. */
  wild: (
    <path d="M4 19c1-3 1-6 0-9M4 19c1.5-2 3-3 4.5-3.5M12 19c0-4 1-7 3-10M12 19c-1-2.5-2.5-4-4-5M19 19c.5-3 0-5.5-1.5-7.5M19 19c1-1.5 2-2.3 3-2.5" />
  ),
  /** Footprints: a creature nearby. */
  paw: (
    <>
      <ellipse cx="12" cy="15.5" rx="4" ry="3.5" />
      <circle cx="6.5" cy="10" r="1.7" />
      <circle cx="10" cy="7" r="1.7" />
      <circle cx="14" cy="7" r="1.7" />
      <circle cx="17.5" cy="10" r="1.7" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  /** Poor GPS signal: two short bars and a slash. */
  signal: (
    <>
      <path d="M5 19v-3M9 19v-6M13 19v-9" />
      <path d="M17 19v-1M21 19v-1" opacity="0.4" />
      <path d="M4 5l16 14" />
    </>
  ),
  /** Travelling faster than walking: a gauge with its needle far over. */
  speed: (
    <>
      <path d="M4 16a8 8 0 1 1 16 0" />
      <path d="M12 16l4.6-4.4" />
      <circle cx="12" cy="16" r="1.2" fill="currentColor" />
      <path d="M2.5 20h19" />
    </>
  ),
  moon: <path d="M19 15.5A8 8 0 0 1 8.5 5a7.5 7.5 0 1 0 10.5 10.5Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export function Icon({
  name,
  size = 24,
  className,
  style,
  label,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Accessible name; without it the icon is decorative. */
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon icon-${name}${className ? ` ${className}` : ''}`}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {PATHS[name]}
    </svg>
  );
}
