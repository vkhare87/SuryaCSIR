import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { bin, type BinStrategy } from '../../utils/binning';
import { SEMANTIC } from './palette';
import { ChartEmpty } from './ChartEmpty';

interface HistogramProps {
  values: number[];
  strategy?: BinStrategy;
  color?: string;
  height?: number;
  xLabel?: string;
  yLabel?: string;
}

export function Histogram({
  values,
  strategy = 'sturges',
  color = SEMANTIC.brand,
  height = 240,
  xLabel,
  yLabel,
}: HistogramProps) {
  const bins = bin(values, strategy);
  if (bins.length === 0) return <ChartEmpty height={height} />;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bins} margin={{ top: 8, right: 12, bottom: 24, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -8, fill: 'var(--color-text-muted)', fontSize: 11 } : undefined}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)', fontSize: 11 } : undefined}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-surface-hover)' }}
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
