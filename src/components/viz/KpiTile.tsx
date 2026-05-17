import type { ReactNode } from 'react';
import clsx from 'clsx';

interface KpiTileProps {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: ReactNode;
  delta?: { value: number; label?: string; isPositive?: boolean };
  accent?: 'brand' | 'positive' | 'negative' | 'warning' | 'neutral';
  children?: ReactNode; // slot for inline mini-viz under the value
  className?: string;
}

const ACCENT_BG: Record<NonNullable<KpiTileProps['accent']>, string> = {
  brand: 'bg-[#f5ede0] text-[#7a4a1e]',
  positive: 'bg-[#e6f4eb] text-[#2f7a4a]',
  negative: 'bg-[#f5e8e8] text-[#b53333]',
  warning: 'bg-[#f5ede0] text-[#7a4a1e]',
  neutral: 'bg-[#f0eee6] text-[#5e5d59]',
};

export function KpiTile({ label, value, sublabel, icon, delta, accent, children, className }: KpiTileProps) {
  return (
    <div
      className={clsx(
        'bg-surface border border-border rounded-[12px] p-4 flex flex-col gap-1.5',
        'shadow-[0px_0px_0px_1px_var(--color-border)]',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">{label}</span>
        {icon && (
          <span className={clsx('p-1.5 rounded-md', accent ? ACCENT_BG[accent] : ACCENT_BG.brand)}>{icon}</span>
        )}
      </div>
      <div className="text-2xl font-semibold text-text tabular-nums">{value}</div>
      {sublabel && <div className="text-xs text-text-muted">{sublabel}</div>}
      {delta && (
        <div className="text-xs flex items-center gap-1">
          <span className={clsx('font-medium', delta.isPositive ? 'text-emerald-600' : 'text-rose-600')}>
            {delta.isPositive ? '↑' : '↓'} {Math.abs(delta.value)}%
          </span>
          {delta.label && <span className="text-text-muted">{delta.label}</span>}
        </div>
      )}
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}
