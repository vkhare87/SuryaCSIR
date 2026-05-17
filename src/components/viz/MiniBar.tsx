import { Bar, BarChart, ResponsiveContainer, Cell } from 'recharts';
import { colorAt } from './palette';

interface MiniBarDatum {
  label: string;
  value: number;
}

interface MiniBarProps {
  data: MiniBarDatum[];
  height?: number;
  highlightIndex?: number;
}

export function MiniBar({ data, height = 32, highlightIndex }: MiniBarProps) {
  if (data.length === 0) return null;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Bar dataKey="value" isAnimationActive={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={colorAt(i === highlightIndex ? 0 : Math.max(3, i))} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
