import type { DirectorThresholds } from '../../utils/directorMetrics';

interface ThresholdControlsProps {
  thresholds: DirectorThresholds;
  onChange: (next: DirectorThresholds) => void;
  onReset: () => void;
}

interface FieldProps {
  label: string;
  value: number;
  suffix: string;
  onChange: (v: number) => void;
}

function Field({ label, value, suffix, onChange }: FieldProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-text-muted">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-sm text-text tabular-nums"
      />
      <span>{suffix}</span>
    </label>
  );
}

export function ThresholdControls({ thresholds, onChange, onReset }: ThresholdControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[12px] border border-border bg-surface px-4 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">Alert thresholds</span>
      <Field label="Low burn" value={thresholds.lowBurnPct} suffix="%" onChange={(v) => onChange({ ...thresholds, lowBurnPct: v })} />
      <Field label="Ending in" value={thresholds.endingDays} suffix="days" onChange={(v) => onChange({ ...thresholds, endingDays: v })} />
      <Field label="AMC in" value={thresholds.amcDays} suffix="days" onChange={(v) => onChange({ ...thresholds, amcDays: v })} />
      <button onClick={onReset} className="ml-auto text-xs font-medium text-brand-blue hover:underline">
        Reset
      </button>
    </div>
  );
}
