import { BarChart3 } from 'lucide-react';

interface ChartEmptyProps {
  message?: string;
  height?: number;
}

export function ChartEmpty({ message = 'No data to chart', height = 200 }: ChartEmptyProps) {
  return (
    <div
      style={{ minHeight: height }}
      className="flex flex-col items-center justify-center gap-2 text-text-muted text-xs italic w-full"
    >
      <BarChart3 size={20} className="opacity-50" />
      <span>{message}</span>
    </div>
  );
}
