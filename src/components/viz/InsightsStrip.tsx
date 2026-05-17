import type { ReactNode } from 'react';
import clsx from 'clsx';

interface InsightsStripProps {
  className?: string;
  children: ReactNode;
}

/**
 * Horizontal row of compact insight tiles above a list page.
 * Responsive: stacks on mobile, 2-up on small, 3-5 across on lg+.
 */
export function InsightsStrip({ className, children }: InsightsStripProps) {
  return (
    <div
      className={clsx(
        'grid gap-3',
        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5',
        className,
      )}
    >
      {children}
    </div>
  );
}
