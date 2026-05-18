import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { colorAt, SEMANTIC } from './palette';

export interface CategoryDatum {
  label: string;
  value: number;
}

interface CategoryBarProps {
  data: CategoryDatum[];
  height?: number;
  horizontal?: boolean;
  color?: string;
  onSelect?: (datum: CategoryDatum) => void;
  selected?: string | null;
  xLabel?: string;
  yLabel?: string;
}

export function CategoryBar({
  data,
  height = 280,
  horizontal = false,
  color = SEMANTIC.brand,
  onSelect,
  selected,
  xLabel,
  yLabel,
}: CategoryBarProps) {
  if (data.length === 0) return null;
  const cells = data.map((_, i) => colorAt(i));

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 8, right: 12, bottom: 24, left: horizontal ? 90 : 12 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          {horizontal ? (
            <>
              <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
              <YAxis dataKey="label" type="category" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} width={90} />
            </>
          ) : (
            <>
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -8, fill: 'var(--color-text-muted)', fontSize: 11 } : undefined}
                interval={0}
                angle={data.length > 6 ? -25 : 0}
                textAnchor={data.length > 6 ? 'end' : 'middle'}
                height={data.length > 6 ? 60 : 30}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)', fontSize: 11 } : undefined}
              />
            </>
          )}
          <Tooltip
            cursor={{ fill: 'var(--color-surface-hover)' }}
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="value"
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            isAnimationActive={false}
            onClick={(d) => onSelect?.(d as unknown as CategoryDatum)}
            cursor={onSelect ? 'pointer' : 'default'}
          >
            {data.map((d, i) => (
              <Cell
                key={d.label}
                fill={selected != null && selected !== d.label ? 'var(--color-border)' : color || cells[i]}
                opacity={selected != null && selected !== d.label ? 0.4 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
