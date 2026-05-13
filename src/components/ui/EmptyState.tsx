import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; to: string };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        'rounded-[12px] border border-dashed border-border bg-surface',
        'px-6 py-12 gap-3',
        className
      )}
    >
      {Icon ? <Icon className="w-10 h-10 text-text-muted" aria-hidden="true" /> : null}
      <h3 className="text-base font-semibold text-text">{title}</h3>
      {description ? <p className="text-sm text-text-muted max-w-md">{description}</p> : null}
      {action ? (
        <Link
          to={action.to}
          className="mt-2 inline-flex items-center rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
