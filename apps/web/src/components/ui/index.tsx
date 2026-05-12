import { forwardRef, ReactNode, ButtonHTMLAttributes, HTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

// ─── Button ───────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize    = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const btnBase = [
  'inline-flex items-center justify-center gap-2 font-medium',
  'rounded-[var(--radius-md)] transition-all duration-150',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
  'disabled:opacity-50 disabled:pointer-events-none select-none',
].join(' ');

const btnVariants: Record<ButtonVariant, string> = {
  primary:   'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] focus-visible:ring-[var(--primary)] shadow-sm active:scale-[0.98]',
  secondary: 'bg-white border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg)] focus-visible:ring-[var(--border-strong)] shadow-[var(--shadow-sm)]',
  ghost:     'text-[var(--text-secondary)] hover:bg-[var(--border)] hover:text-[var(--text-primary)] focus-visible:ring-[var(--border-strong)]',
  danger:    'bg-[var(--danger)] text-white hover:bg-red-700 focus-visible:ring-[var(--danger)] shadow-sm active:scale-[0.98]',
};

const btnSizes: Record<ButtonSize, string> = {
  sm:  'h-8  px-3   text-[13px]',
  md:  'h-9  px-4   text-[14px]',
  lg:  'h-10 px-5   text-[14px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, iconRight, children, className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(btnBase, btnVariants[variant], btnSizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  )
);
Button.displayName = 'Button';

// ─── Badge ────────────────────────────────────

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'default';

const badgeStyles: Record<BadgeVariant, string> = {
  success: 'bg-[var(--success-bg)] text-[var(--success)]',
  warning: 'bg-[var(--warning-bg)] text-[var(--warning)]',
  danger:  'bg-[var(--danger-bg)]  text-[var(--danger)]',
  info:    'bg-[var(--info-bg)]    text-[var(--info)]',
  default: 'bg-[var(--border)]     text-[var(--text-secondary)]',
};

interface BadgeProps { variant?: BadgeVariant; children: ReactNode; dot?: boolean; }

export function Badge({ variant = 'default', dot, children }: BadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap',
      badgeStyles[variant]
    )}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

// ─── Card ─────────────────────────────────────

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  noPad?: boolean;
}

export function Card({ noPad, className, children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]',
        !noPad && 'p-5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── Stat card ────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: string;
  positive?: boolean;
  icon: ReactNode;
  color?: string;
}

export function StatCard({ label, value, delta, positive, icon, color = 'var(--primary-light)' }: StatCardProps) {
  return (
    <Card className="flex items-start justify-between gap-4 animate-fadeIn">
      <div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{label}</p>
        <p style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>{value}</p>
        {delta && (
          <p style={{ fontSize: 12, marginTop: 4, color: positive ? 'var(--success)' : 'var(--danger)', fontWeight: 500 }}>
            {positive ? '↑' : '↓'} {delta}
          </p>
        )}
      </div>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
    </Card>
  );
}

// ─── Spinner ──────────────────────────────────

export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" style={{ color: 'var(--primary)' }} />;
}

export function PageSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300 }}>
      <Spinner size={28} />
    </div>
  );
}

// ─── Empty state ──────────────────────────────

interface EmptyProps { title: string; description?: string; action?: ReactNode; icon?: ReactNode; }

export function Empty({ title, description, action, icon }: EmptyProps) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }} className="animate-fadeIn">
      {icon && <div style={{ marginBottom: 12 }}>{icon}</div>}
      <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{title}</p>
      {description && <p style={{ fontSize: 14 }}>{description}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

// ─── Section header ───────────────────────────

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function SectionHeader({ title, subtitle, actions }: SectionHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.3px', color: 'var(--text-primary)' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 3 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

// ─── Divider ─────────────────────────────────

export function Divider({ className }: { className?: string }) {
  return <hr className={clsx('border-[var(--border)]', className)} />;
}

// ─── Input ───────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {label && (
          <label htmlFor={inputId} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
            {label}
          </label>
        )}
        <div style={{ position: 'relative' }}>
          {icon && (
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}>
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            style={{
              width: '100%',
              height: 38,
              paddingLeft: icon ? 34 : 12,
              paddingRight: 12,
              fontSize: 14,
              border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              transition: 'border-color .15s, box-shadow .15s',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)'; }}
            onBlur={e => { e.target.style.borderColor = error ? 'var(--danger)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }}
            className={className}
            {...props}
          />
        </div>
        {error && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 2 }}>{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

// ─── Select ──────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, id, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {label && (
          <label htmlFor={selectId} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          style={{
            height: 38, paddingLeft: 10, paddingRight: 28, fontSize: 14,
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            outline: 'none',
            width: '100%',
          }}
          {...props}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {error && <p style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';
