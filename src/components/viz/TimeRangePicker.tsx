import clsx from 'clsx';
import type { TimeRangeKey } from '../../utils/useTimeRange';

interface TimeRangePickerProps {
  value: TimeRangeKey;
  onChange: (key: TimeRangeKey) => void;
  options?: TimeRangeKey[];
  className?: string;
}

const LABELS: Record<TimeRangeKey, string> = {
  all: 'All',
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  '1y': '1y',
  fy: 'FY',
  custom: 'Custom',
};

export function TimeRangePicker({
  value,
  onChange,
  options = ['all', '7d', '30d', '90d', '1y', 'fy'],
  className,
}: TimeRangePickerProps) {
  return (
    <div
      className={clsx(
        'inline-flex items-center gap-0.5 rounded-[8px] bg-surface border border-border p-0.5',
        className,
      )}
      role="radiogroup"
      aria-label="Time range"
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className={clsx(
              'px-2 py-0.5 text-[11px] font-medium rounded-[6px] transition-colors',
              active
                ? 'bg-background text-text shadow-[0px_0px_0px_1px_var(--color-border)]'
                : 'text-text-muted hover:text-text',
            )}
          >
            {LABELS[opt]}
          </button>
        );
      })}
    </div>
  );
}
