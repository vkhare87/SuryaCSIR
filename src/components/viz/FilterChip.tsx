import { X, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import type { ChartFilter } from '../../utils/useChartFilter';

interface FilterChipProps {
  filter: ChartFilter | null;
  onClear: () => void;
  labelMap?: Record<string, string>; // pretty-name lookup for dim
  className?: string;
  /** On analytics tabs: e.g. "Show 12 matching scholars" → opens the filtered list. */
  showMatches?: { label: string; onClick: () => void };
}

export function FilterChip({ filter, onClear, labelMap, className, showMatches }: FilterChipProps) {
  if (!filter) return null;
  const dimLabel = labelMap?.[filter.dim] ?? filter.dim;
  return (
    <div className={clsx('flex flex-wrap items-center gap-2', className)}>
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
      {showMatches && (
        <button
          type="button"
          onClick={showMatches.onClick}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue hover:underline"
        >
          {showMatches.label} <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}
