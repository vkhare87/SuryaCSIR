import type { ReactNode } from 'react';
import clsx from 'clsx';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, action, className, bodyClassName, children }: ChartCardProps) {
  return (
    <div
      className={clsx(
        'rounded-[12px] bg-surface border border-border p-5 flex flex-col gap-3',
        'shadow-[0px_0px_0px_1px_var(--color-border)]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text uppercase tracking-wide">{title}</h3>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={clsx('min-h-[200px]', bodyClassName)}>{children}</div>
    </div>
  );
}
