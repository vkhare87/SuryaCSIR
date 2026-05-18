import { Funnel as RFunnel, FunnelChart, LabelList, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { colorAt } from './palette';
import { ChartEmpty } from './ChartEmpty';

export interface FunnelStage {
  name: string;
  value: number;
}

interface FunnelProps {
  data: FunnelStage[];
  height?: number;
}

export function Funnel({ data, height = 280 }: FunnelProps) {
  if (data.length === 0 || data.every((d) => d.value === 0)) return <ChartEmpty height={height} />;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart>
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <RFunnel dataKey="value" data={data} isAnimationActive={false} stroke="var(--color-surface)">
            <LabelList position="right" dataKey="name" fill="var(--color-text)" fontSize={11} />
            <LabelList position="inside" dataKey="value" fill="#faf9f5" fontSize={12} fontWeight={600} />
            {data.map((_, i) => (
              <Cell key={i} fill={colorAt(i)} />
            ))}
          </RFunnel>
        </FunnelChart>
      </ResponsiveContainer>
    </div>
  );
}
