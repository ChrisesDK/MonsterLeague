/**
 * Design-system components (M2d). They render the shared classes from ui/components.css,
 * so older screens that use the classes directly (`btn`, `card`, …) look the same.
 * Rules: tap targets ≥ 48 px, all text from i18n, everything reachable one-handed.
 */
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';

export function Button({
  variant = 'secondary',
  icon,
  wide,
  round,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: IconName;
  wide?: boolean;
  /** Round icon button (an aria-label is required then). */
  round?: boolean;
}) {
  const cls = [
    'btn',
    variant !== 'secondary' && variant,
    wide && 'wide',
    round && 'round',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      {icon && <Icon name={icon} size={round ? 26 : 22} />}
      {children}
    </button>
  );
}

export function Card({
  children,
  tone,
  className,
  ...rest
}: {
  children: ReactNode;
  tone?: 'warn' | 'accent' | 'gold';
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['card', tone, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

/** Bottom sheet over the current view. */
export function Sheet({
  title,
  onClose,
  closeLabel,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  testId?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet"
        role="dialog"
        aria-label={title}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <h2>{title}</h2>
          <Button round variant="ghost" icon="close" aria-label={closeLabel} onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={t.id === value}
          className={`tab${t.id === value ? ' on' : ''}`}
          data-testid={`tab-${t.id}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ListRow({
  icon,
  img,
  title,
  subtitle,
  trailing,
  onClick,
  done,
  testId,
}: {
  icon?: IconName;
  img?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  done?: boolean;
  testId?: string;
}) {
  const body = (
    <>
      {img ? (
        <img src={img} alt="" className="row-img" />
      ) : icon ? (
        <span className="row-icon">
          <Icon name={icon} />
        </span>
      ) : null}
      <span className="row-main">
        <span className="row-title">{title}</span>
        {subtitle && <span className="row-sub">{subtitle}</span>}
      </span>
      {trailing}
      {done && (
        <span className="row-done">
          <Icon name="check" size={20} />
        </span>
      )}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={`row${done ? ' done' : ''}`}
      onClick={onClick}
      data-testid={testId}
    >
      {body}
    </button>
  ) : (
    <div className={`row${done ? ' done' : ''}`} data-testid={testId}>
      {body}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  tone = 'leaf',
  label,
}: {
  value: number;
  max: number;
  tone?: 'leaf' | 'gold' | 'fjord' | 'accent';
  label?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (100 * value) / max)) : 0;
  return (
    <div
      className={`progress ${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Small label pill ("Too wild", "New", type names…). */
export function Pill({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'warn' | 'accent' | 'gold' | 'leaf' | 'fjord' | 'muted';
}) {
  return <span className={`pill${tone ? ` ${tone}` : ''}`}>{children}</span>;
}

export function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="toast" role="status" aria-live="polite">
      {children}
    </div>
  );
}

export function Modal({
  title,
  children,
  actions,
  testId,
  className,
}: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      className={className ? `modal ${className}` : 'modal'}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid={testId}
    >
      <div className="modal-card">
        <h2>{title}</h2>
        {children}
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}
