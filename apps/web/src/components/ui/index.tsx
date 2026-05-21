import { forwardRef, ReactNode, ButtonHTMLAttributes, HTMLAttributes, CSSProperties } from 'react';
import { Loader2 } from 'lucide-react';

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

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: 'var(--primary)',
    color: 'white',
    border: 'none',
    boxShadow: '0 1px 3px rgba(0,87,255,0.25)',
  },
  secondary: {
    background: 'var(--surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-sm)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: 'none',
  },
  danger: {
    background: 'var(--danger)',
    color: 'white',
    border: 'none',
    boxShadow: '0 1px 3px rgba(192,57,43,0.25)',
  },
};

const sizeStyles: Record<ButtonSize, CSSProperties> = {
  sm:  { height: 32, padding: '0 12px', fontSize: 13 },
  md:  { height: 36, padding: '0 16px', fontSize: 14 },
  lg:  { height: 40, padding: '0 20px', fontSize: 14 },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, iconRight, children, style, disabled, onMouseEnter, onMouseLeave, ...props }, ref) => {
    const base: CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      borderRadius: 'var(--radius-md)',
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      opacity: disabled || loading ? 0.55 : 1,
      transition: 'background .15s, opacity .15s, box-shadow .15s, transform .1s',
      outline: 'none',
      whiteSpace: 'nowrap',
      letterSpacing: '-0.1px',
      ...variantStyles[variant],
      ...sizeStyles[size],
      ...style,
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!disabled && !loading) {
        const el = e.currentTarget;
        if (variant === 'primary')    el.style.background = 'var(--primary-hover)';
        if (variant === 'secondary')  el.style.background = 'var(--bg)';
        if (variant === 'ghost')      { el.style.background = 'var(--border)'; el.style.color = 'var(--text-primary)'; }
        if (variant === 'danger')     el.style.background = '#a93226';
      }
      onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      const el = e.currentTarget;
      if (variant === 'primary')    el.style.background = 'var(--primary)';
      if (variant === 'secondary')  el.style.background = 'var(--surface)';
      if (variant === 'ghost')      { el.style.background = 'transparent'; el.style.color = 'var(--text-secondary)'; }
      if (variant === 'danger')     el.style.background = 'var(--danger)';
      onMouseLeave?.(e);
    };

    return (
      <button
        ref={ref}
        style={base}
        disabled={disabled || loading}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        {loading ? <Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> : icon}
        {children}
        {!loading && iconRight}
      </button>
    );
  }
);
Button.displayName = 'Button';

// ─── Badge ────────────────────────────────────

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'default';

const badgeStyles: Record<BadgeVariant, CSSProperties> = {
  success: { background: 'var(--success-bg)', color: 'var(--success)' },
  warning: { background: 'var(--warning-bg)', color: 'var(--warning)' },
  danger:  { background: 'var(--danger-bg)',  color: 'var(--danger)'  },
  info:    { background: 'var(--info-bg)',     color: 'var(--info)'    },
  default: { background: 'var(--border)',      color: 'var(--text-secondary)' },
};

interface BadgeProps { variant?: BadgeVariant; children: ReactNode; dot?: boolean; }

export function Badge({ variant = 'default', dot, children }: BadgeProps) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px',
      borderRadius: 99,
      fontSize: 11, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.05em',
      whiteSpace: 'nowrap',
      fontFamily: 'var(--font-sans)',
      ...badgeStyles[variant],
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: 0.8, flexShrink: 0 }} />}
      {children}
    </span>
  );
}

// ─── Card ─────────────────────────────────────

interface CardProps extends HTMLAttributes<HTMLDivElement> { noPad?: boolean; }

export function Card({ noPad, style, children, ...props }: CardProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        ...(noPad ? {} : { padding: 20 }),
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────

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
    <Card style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }} className="animate-fadeIn">
      <div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{label}</p>
        <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>{value}</p>
        {delta && (
          <p style={{ fontSize: 12, marginTop: 4, color: positive ? 'var(--success)' : 'var(--danger)', fontWeight: 500 }}>
            {positive ? '↑' : '↓'} {delta}
          </p>
        )}
      </div>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
    </Card>
  );
}

// ─── Spinner ──────────────────────────────────

export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} style={{ animation: 'spin .7s linear infinite', color: 'var(--primary)' }} />;
}

export function PageSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300 }}>
      <Spinner size={28} />
    </div>
  );
}

// ─── Empty ────────────────────────────────────

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

// ─── SectionHeader ────────────────────────────

interface SectionHeaderProps { title: string; subtitle?: string; actions?: ReactNode; }

export function SectionHeader({ title, subtitle, actions }: SectionHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px', color: 'var(--text-primary)' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 3 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

// ─── Divider ─────────────────────────────────

export function Divider({ style }: { style?: CSSProperties }) {
  return <hr style={{ border: 'none', borderTop: '1px solid var(--border)', ...style }} />;
}

// ─── Input ───────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, style, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {label && (
          <label htmlFor={inputId} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
            {label}
          </label>
        )}
        <div style={{ position: 'relative' }}>
          {icon && (
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex', pointerEvents: 'none' }}>
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            style={{
              width: '100%', height: 38,
              paddingLeft: icon ? 34 : 12, paddingRight: 12,
              fontSize: 14,
              border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              transition: 'border-color .15s, box-shadow .15s',
              boxSizing: 'border-box',
              ...style,
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)'; }}
            onBlur={e => { e.target.style.borderColor = error ? 'var(--danger)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }}
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
  ({ label, error, options, id, style, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {label && (
          <label htmlFor={selectId} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          style={{
            height: 38, paddingLeft: 10, paddingRight: 28,
            fontSize: 14,
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            outline: 'none',
            width: '100%',
            ...style,
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
