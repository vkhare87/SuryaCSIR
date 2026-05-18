import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SEMANTIC } from './palette';

export interface TrendPoint {
  label: string;
  value: number;
}

interface TrendLineProps {
  data: TrendPoint[];
  height?: number;
  color?: string;
  yLabel?: string;
}

export function TrendLine({ data, height = 240, color = SEMANTIC.brand, yLabel }: TrendLineProps) {
  if (data.length === 0) return null;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 24, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)', fontSize: 11 } : undefined}
          />
          <Tooltip
            cursor={{ stroke: 'var(--color-border)' }}
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
