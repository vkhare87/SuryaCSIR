import { useId } from 'react';

interface SparklineProps {
  /** Ordered numeric points (at least 2 values to draw a trend). */
  data: number[];
  /** Stroke color — defaults to SURYA terracotta. */
  color?: string;
  className?: string;
}

/**
 * Ultra-lightweight pure-SVG sparkline for KpiCard's `sparkline` slot.
 * Zero Recharts instance overhead inside dashboard KPI tiles.
 */
export function Sparkline({ data, color = '#c96442', className = 'w-full h-full' }: SparklineProps) {
  const gradId = useId();
  if (data.length < 2) return null;

  const width = 96;
  const height = 36;
  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.25" fill={color} />
    </svg>
  );
}
