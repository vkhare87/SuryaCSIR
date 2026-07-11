import type React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useCountUp } from '../../utils/useCountUp';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  sublabel?: string;
  /** % change vs previous period; positive → up chip, negative → down chip */
  delta?: number;
  /** optional right-aligned sparkline / mini-chart slot */
  sparkline?: React.ReactNode;
  className?: string;
}

export function KpiCard({ label, value, icon, sublabel, delta, sparkline, className }: KpiCardProps) {
  const numeric = typeof value === 'number' ? value : null;
  const counted = useCountUp(numeric ?? 0, 1200, numeric !== null);
  const shown = numeric !== null ? counted.toLocaleString() : value;
  const up = (delta ?? 0) >= 0;

  return (
    <div
      className={cn(
        "group relative overflow-hidden bg-surface-raised border border-border rounded-xl p-6 flex flex-col gap-2",
        "shadow-[var(--shadow-e2)] hover:shadow-[var(--shadow-e3)] hover:-translate-y-0.5 transition-all",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 -top-8 h-24 opacity-0 group-hover:opacity-100 transition-opacity"
           style={{ background: 'var(--gradient-glow)' }} />
      <div className="relative flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-stone-gray">{label}</span>
        {icon && <span className="text-terracotta">{icon}</span>}
      </div>
      <div className="relative flex items-end justify-between gap-3">
        <div className="text-3xl font-[500] text-text font-serif tabular-nums">{shown}</div>
        {sparkline && <div className="h-10 w-24 shrink-0">{sparkline}</div>}
      </div>
      <div className="relative flex items-center gap-2">
        {typeof delta === 'number' && (
          <span className={cn(
            "inline-flex items-center gap-0.5 text-xs font-semibold rounded-full px-1.5 py-0.5",
            up ? "text-emerald-700 bg-emerald-500/10 dark:text-emerald-400"
               : "text-rose-700 bg-rose-500/10 dark:text-rose-400"
          )}>
            {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(delta)}%
          </span>
        )}
        {sublabel && <span className="text-xs text-stone-gray">{sublabel}</span>}
      </div>
    </div>
  );
}
