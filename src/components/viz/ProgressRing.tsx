import { RadialBar, RadialBarChart, ResponsiveContainer, PolarAngleAxis } from 'recharts';
import { SEMANTIC } from './palette';

interface ProgressRingProps {
  value: number;
  max: number;
  size?: number;
  label?: string;
  color?: string;
}

export function ProgressRing({ value, max, size = 80, label, color = SEMANTIC.brand }: ProgressRingProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const data = [{ name: 'pct', value: pct, fill: color }];
  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="70%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} dataKey="value" tick={false} />
          <RadialBar dataKey="value" cornerRadius={6} background={{ fill: 'var(--color-border)' }} isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-sm font-semibold tabular-nums text-text">{pct}%</span>
        {label && <span className="text-[10px] text-text-muted uppercase tracking-wide">{label}</span>}
      </div>
    </div>
  );
}
