import { ResponsiveCalendar } from '@nivo/calendar';

export interface CalendarDay {
  day: string; // YYYY-MM-DD
  value: number;
}

interface HeatmapCalendarProps {
  data: CalendarDay[];
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  height?: number;
  emptyColor?: string;
  colors?: string[];
}

export function HeatmapCalendar({
  data,
  from,
  to,
  height = 220,
  emptyColor = '#f0eee6',
  colors = ['#f5ede0', '#e8c8a8', '#d9966a', '#c96442'],
}: HeatmapCalendarProps) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveCalendar
        data={data}
        from={from}
        to={to}
        emptyColor={emptyColor}
        colors={colors}
        margin={{ top: 8, right: 12, bottom: 12, left: 24 }}
        yearSpacing={28}
        monthBorderColor="var(--color-surface)"
        dayBorderWidth={1}
        dayBorderColor="var(--color-surface)"
        theme={{
          text: {
            fontSize: 10,
            fill: 'var(--color-text-muted)',
          },
          tooltip: {
            container: {
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              fontSize: 12,
              border: '1px solid var(--color-border)',
              borderRadius: 6,
            },
          },
        }}
      />
    </div>
  );
}
