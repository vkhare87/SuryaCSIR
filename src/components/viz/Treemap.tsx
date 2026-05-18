import { ResponsiveContainer, Treemap as RTreemap } from 'recharts';
import { colorAt } from './palette';
import { ChartEmpty } from './ChartEmpty';

export interface TreemapDatum {
  name: string;
  size: number;
  [key: string]: string | number;
}

interface TreemapProps {
  data: TreemapDatum[];
  height?: number;
  onClick?: (datum: TreemapDatum) => void;
}

interface CustomCellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  name?: string;
  size?: number;
  onClick?: (datum: TreemapDatum) => void;
}

function CustomCell({ x = 0, y = 0, width = 0, height = 0, index = 0, name = '', size = 0, onClick }: CustomCellProps) {
  if (width < 1 || height < 1) return null;
  const fill = colorAt(index);
  const showLabel = width > 60 && height > 24;
  return (
    <g style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={() => onClick?.({ name, size })}>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="var(--color-surface)" strokeWidth={2} />
      {showLabel && (
        <text x={x + 6} y={y + 16} fill="#faf9f5" fontSize={11} fontWeight={600}>
          {name.length > 24 ? `${name.slice(0, 22)}…` : name}
        </text>
      )}
      {showLabel && height > 38 && (
        <text x={x + 6} y={y + 32} fill="#faf9f5" fontSize={10} opacity={0.85}>
          {size}
        </text>
      )}
    </g>
  );
}

export function Treemap({ data, height = 280, onClick }: TreemapProps) {
  if (data.length === 0) return <ChartEmpty height={height} />;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RTreemap
          data={data}
          dataKey="size"
          stroke="var(--color-surface)"
          isAnimationActive={false}
          content={<CustomCell onClick={onClick} />}
        />
      </ResponsiveContainer>
    </div>
  );
}
