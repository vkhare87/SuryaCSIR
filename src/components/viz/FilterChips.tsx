import { X } from 'lucide-react';

interface Chip { label: string; value: string; }

/** Active cross-filter row with a clear-all control. */
export function FilterChips({ chips, onClear }: { chips: Chip[]; onClear: () => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-[var(--shadow-e1)]">
      <span className="text-xs font-medium text-text-muted">Filtered by</span>
      {chips.map((c) => (
        <span key={`${c.label}:${c.value}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-terracotta/10 text-terracotta border border-terracotta/30 px-2.5 py-0.5 text-xs font-semibold">
          <span className="text-text-muted font-medium">{c.label}:</span> {c.value}
        </span>
      ))}
      <button onClick={onClear}
        className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text transition-colors">
        <X size={13} /> Clear
      </button>
    </div>
  );
}
