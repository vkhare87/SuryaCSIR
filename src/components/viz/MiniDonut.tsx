import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { colorAt } from './palette';

interface MiniDonutDatum {
  label: string;
  value: number;
}

interface MiniDonutProps {
  data: MiniDonutDatum[];
  size?: number;
}

export function MiniDonut({ data, size = 36 }: MiniDonutProps) {
  if (data.length === 0 || data.every((d) => d.value === 0)) return null;
  return (
    <div style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius="55%"
            outerRadius="100%"
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colorAt(i)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
