import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { colorAt } from './palette';
import { ChartEmpty } from './ChartEmpty';
import type { CategoryDatum } from './CategoryBar';

interface CategoryDonutProps {
  data: CategoryDatum[];
  height?: number;
  onSelect?: (datum: CategoryDatum) => void;
  selected?: string | null;
  innerRadius?: string;
  showLegend?: boolean;
}

export function CategoryDonut({
  data,
  height = 240,
  onSelect,
  selected,
  innerRadius = '55%',
  showLegend = true,
}: CategoryDonutProps) {
  if (data.length === 0 || data.every((d) => d.value === 0)) return <ChartEmpty height={height} />;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          {showLegend && (
            <Legend
              verticalAlign="bottom"
              height={28}
              wrapperStyle={{ fontSize: 11, color: 'var(--color-text-muted)' }}
            />
          )}
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={innerRadius}
            outerRadius="85%"
            paddingAngle={1}
            stroke="var(--color-surface)"
            onClick={(d) => onSelect?.(d as unknown as CategoryDatum)}
            cursor={onSelect ? 'pointer' : 'default'}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell
                key={d.label}
                fill={colorAt(i)}
                opacity={selected != null && selected !== d.label ? 0.3 : 1}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
