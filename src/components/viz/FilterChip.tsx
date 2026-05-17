import { X } from 'lucide-react';
import clsx from 'clsx';
import type { ChartFilter } from '../../utils/useChartFilter';

interface FilterChipProps {
  filter: ChartFilter | null;
  onClear: () => void;
  labelMap?: Record<string, string>; // pretty-name lookup for dim
  className?: string;
}

export function FilterChip({ filter, onClear, labelMap, className }: FilterChipProps) {
  if (!filter) return null;
  const dimLabel = labelMap?.[filter.dim] ?? filter.dim;
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <span className="text-xs text-text-muted">Filtered by:</span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5ede0] text-[#7a4a1e] border border-[#e8d4c0] px-2.5 py-0.5 text-xs font-medium">
        <span className="font-semibold">{dimLabel}:</span>
        <span>{filter.value}</span>
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${dimLabel} filter`}
          className="ml-0.5 rounded-full hover:bg-[#e8d4c0] p-0.5"
        >
          <X size={12} />
        </button>
      </span>
    </div>
  );
}
