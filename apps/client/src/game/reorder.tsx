/**
 * Drag to reorder the team (owner): press and hold the ≡ handle in a card's corner and drag
 * it over another card; the team moves as you go (the first leads in battle). Pointer events
 * cover touch and mouse; the handle never also opens the card it sits on.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Translate } from '../i18n';

export function useReorder(onMove: (from: number, to: number) => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  const at = useRef<number | null>(null);
  const end = () => {
    at.current = null;
    setDragging(null);
  };
  const handle = (index: number, t: Translate) => ({
    role: 'button' as const,
    tabIndex: -1,
    className: 'drag-handle',
    'data-testid': `drag-${index}`,
    'aria-label': t('team.drag'),
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      at.current = index;
      setDragging(index);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (at.current === null) return;
      const over = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>('[data-reorder]');
      const to = over ? Number(over.dataset.reorder) : NaN;
      if (Number.isInteger(to) && to !== at.current) {
        onMove(at.current, to);
        at.current = to;
        setDragging(to);
      }
    },
    onPointerUp: end,
    onPointerCancel: end,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  });
  return { dragging, handle };
}

/** The ≡ grip drawn in the handle. */
export function Grip() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        d="M5 8h14M5 12h14M5 16h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
