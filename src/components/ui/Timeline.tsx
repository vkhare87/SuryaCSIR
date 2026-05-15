import type { ReactNode } from 'react';

export interface TimelineItem {
  id: string;
  icon: ReactNode;
  title: string;
  timestamp: string;
  detail?: ReactNode;
}

interface TimelineProps {
  items: TimelineItem[];
  emptyText?: string;
}

const TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', TIMESTAMP_FORMAT);
}

export function Timeline({ items, emptyText = 'No events yet.' }: TimelineProps) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">{emptyText}</p>;
  }

  return (
    <div className="space-y-0">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <div
            key={item.id}
            className={`relative pl-8 pb-4 ${isLast ? '' : 'border-l-2 border-border'}`}
          >
            <div className="absolute left-0 top-0 -translate-x-1/2 w-6 h-6 rounded-full bg-surface border-2 border-border flex items-center justify-center">
              {item.icon}
            </div>
            <p className="text-sm font-medium text-text">{item.title}</p>
            <p className="text-xs text-text-muted">{formatTimestamp(item.timestamp)}</p>
            {item.detail && (
              <div className="text-xs text-text-muted mt-0.5">{item.detail}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
