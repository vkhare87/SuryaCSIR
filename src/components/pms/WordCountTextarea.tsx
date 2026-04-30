import { useMemo } from 'react';
import clsx from 'clsx';

interface Props {
  value: string;
  onChange: (v: string) => void;
  maxWords: number;
  placeholder?: string;
  className?: string;
  rows?: number;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function WordCountTextarea({ value, onChange, maxWords, placeholder, className, rows = 5 }: Props) {
  const count = useMemo(() => countWords(value), [value]);
  const over = count > maxWords;

  return (
    <div className="space-y-1">
      <textarea
        rows={rows}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={clsx(
          'w-full border rounded-lg px-3 py-2 text-sm bg-background text-text resize-y',
          over ? 'border-rose-400 focus:ring-rose-400' : 'border-border',
          className,
        )}
      />
      <p className={clsx('text-xs text-right', over ? 'text-rose-600' : 'text-text-muted')}>
        {count} / {maxWords} words{over ? ' — over limit' : ''}
      </p>
    </div>
  );
}
