import React, { useRef } from 'react';
import clsx from 'clsx';
import { cn } from '../../utils/cn';


interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  isGlass?: boolean;
  variant?: 'flat' | 'raised' | 'interactive';
  /** Subtle pointer-reactive warm spotlight sheen (pure CSS variables, zero re-renders). */
  sheen?: boolean;
}

const cardVariants = {
  flat: "bg-surface border border-border shadow-[0px_0px_0px_1px_var(--color-border)] hover:shadow-[0px_0px_0px_1px_var(--color-ring-warm)] transition-shadow",
  raised: "bg-surface-raised border border-border shadow-[var(--shadow-e2)] dark:shadow-[var(--shadow-e2),var(--shadow-dark-highlight)] transition-shadow",
  interactive: "bg-surface-raised border border-border shadow-[var(--shadow-e2)] dark:shadow-[var(--shadow-e2),var(--shadow-dark-highlight)] hover:shadow-[var(--shadow-e3)] hover:border-terracotta/40 hover:-translate-y-0.5 transition-all cursor-pointer",
};

export function Card({ children, className, isGlass = false, variant = 'flat', sheen = false, onPointerMove, ...props }: CardProps) {
  const rafRef = useRef<number | null>(null);
  // A clickable card is grid navigation: reachable by Tab, activated by Enter/Space.
  const button = props.onClick
    ? {
        role: 'button',
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          props.onKeyDown?.(e);
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.currentTarget.click();
          }
        },
      }
    : {};
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    onPointerMove?.(e);
    if (!sheen) return;
    const el = e.currentTarget;
    const clientX = e.clientX;
    const clientY = e.clientY;
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${clientX - rect.left}px`);
      el.style.setProperty('--my', `${clientY - rect.top}px`);
    });
  };
  return (
    <div
      className={cn(
        "rounded-xl p-6",
        isGlass ? "glass dark:glass-dark rounded-xl p-6" : cardVariants[variant],
        sheen && "card-sheen overflow-hidden",
        className
      )}
      onPointerMove={sheen || onPointerMove ? handlePointerMove : undefined}
      {...props}
      {...button}
    >
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------

interface StatCardProps extends CardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: number; label: string; isPositive: boolean };
  valueColor?: string;
}

export function StatCard({ title, value, subtitle, icon, trend, valueColor, className, ...props }: StatCardProps) {
  return (
    <Card className={clsx("flex flex-col gap-2 relative overflow-hidden", className)} {...props}>
      <div className="flex items-center justify-between text-text-muted">
        <span className="text-sm font-medium">{title}</span>
        {icon && <div className="text-terracotta bg-surface-hover p-2 rounded-lg">{icon}</div>}
      </div>
      
      <div className="flex flex-col gap-0.5 mt-2">
        <span className={clsx("text-3xl font-bold font-mono tabular-nums tracking-tight", valueColor || "text-text")}>{value}</span>
        {subtitle && <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{subtitle}</span>}
      </div>

      {trend && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span className={clsx("font-medium", trend.isPositive ? "text-archive-green" : "text-danger")}>
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
          <span className="text-text-muted">{trend.label}</span>
        </div>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export function Badge({ children, variant = 'neutral', className, ...props }: BadgeProps) {
  const variants = {
    success: "bg-surface-hover text-text border border-border",
    warning: "bg-badge-warning-bg text-badge-warning-fg border border-badge-warning-fg/25",
    danger:  "bg-badge-danger-bg text-badge-danger-fg border border-badge-danger-fg/25",
    info:    "bg-surface-hover text-text-muted border border-border",
    neutral: "bg-surface-hover text-text-muted border border-border",
  };

  return (
    <span 
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
