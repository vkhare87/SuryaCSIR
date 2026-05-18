import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from 'recharts';
import { colorAt } from './palette';
import { ChartEmpty } from './ChartEmpty';

export interface GanttItem {
  name: string;
  start: Date | string;
  end: Date | string;
  category?: string;
}

interface GanttLiteProps {
  items: GanttItem[];
  height?: number;
  onClick?: (item: GanttItem) => void;
}

function toMs(d: Date | string): number {
  return typeof d === 'string' ? Date.parse(d) : d.getTime();
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

export function GanttLite({ items, height = 320, onClick }: GanttLiteProps) {
  if (items.length === 0) return <ChartEmpty height={height} />;
  const rows = items
    .map((it) => {
      const s = toMs(it.start);
      const e = toMs(it.end);
      if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
      return { name: it.name, start: s, end: e, duration: Math.max(0, e - s), offset: s, raw: it };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return <ChartEmpty height={height} />;
  const minStart = Math.min(...rows.map((r) => r.start));
  const maxEnd = Math.max(...rows.map((r) => r.end));

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 8, right: 24, bottom: 24, left: 90 }}
          barCategoryGap="20%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            type="number"
            domain={[minStart, maxEnd]}
            tickFormatter={(v) => formatDate(v as number)}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            width={90}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-surface-hover)' }}
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(_v, _k, ctx) => {
              const r = (ctx as unknown as { payload: { start: number; end: number } }).payload;
              return [`${formatDate(r.start)} → ${formatDate(r.end)}`, 'Window'];
            }}
          />
          <Bar dataKey="offset" stackId="a" fill="transparent" isAnimationActive={false} />
          <Bar
            dataKey="duration"
            stackId="a"
            isAnimationActive={false}
            radius={[3, 3, 3, 3]}
            onClick={(d) => onClick?.((d as unknown as { raw: GanttItem }).raw)}
            cursor={onClick ? 'pointer' : 'default'}
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={colorAt(i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
