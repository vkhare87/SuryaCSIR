import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Share2, ArrowUpRight } from 'lucide-react';
import { Card } from '../ui/Cards';
import { ENTITY_META, type EntityKind } from '../../lib/entities';

export interface NeighborhoodNeighbor {
  id: string;
  label: string;
  kind: EntityKind;
  relation?: string;
}

interface MiniNeighborhoodGraphProps {
  centerLabel: string;
  centerKind: EntityKind;
  neighbors: NeighborhoodNeighbor[];
  /** Max orbiting nodes before collapsing remainder into a "+N more" pill. */
  maxNodes?: number;
  showExploreLink?: boolean;
}

function shortLabel(text: string, max = 16): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/**
 * Pure-SVG 1-hop radial neighborhood diagram for detail dossiers.
 * Instant render with zero physics-loop CPU overhead; links directly to
 * neighboring records and the full `/explore` graph.
 */
export function MiniNeighborhoodGraph({
  centerLabel, centerKind, neighbors, maxNodes = 10, showExploreLink = true,
}: MiniNeighborhoodGraphProps) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<string | null>(null);

  if (neighbors.length === 0) return null;

  const visible = neighbors.slice(0, maxNodes);
  const overflow = neighbors.length - visible.length;
  const cx = 160;
  const cy = 115;
  const rx = 106;
  const ry = 76;

  return (
    <Card variant="raised" className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-text-muted">
          <Share2 size={13} className="text-terracotta" />
          Connected Graph · {neighbors.length}
        </div>
        {showExploreLink && (
          <Link
            to="/explore"
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-terracotta hover:underline"
          >
            Explorer <ArrowUpRight size={12} />
          </Link>
        )}
      </div>

      <svg
        viewBox="0 0 320 230"
        className="w-full h-52 select-none"
        role="img"
        aria-label={`1-hop connection map for ${centerLabel}`}
      >
        {/* Edges */}
        {visible.map((n, i) => {
          const angle = (i / visible.length) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(angle) * rx;
          const y = cy + Math.sin(angle) * ry;
          const active = hovered === n.id;
          return (
            <line
              key={`edge-${n.kind}-${n.id}`}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={active ? ENTITY_META[n.kind].color : 'var(--color-ring-warm)'}
              strokeWidth={active ? 2 : 1}
              strokeOpacity={hovered && !active ? 0.25 : 0.7}
            />
          );
        })}

        {/* Orbiting neighbor nodes */}
        {visible.map((n, i) => {
          const angle = (i / visible.length) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(angle) * rx;
          const y = cy + Math.sin(angle) * ry;
          const active = hovered === n.id;
          const fill = ENTITY_META[n.kind].color;
          const textAnchor = x < cx - 20 ? 'end' : x > cx + 20 ? 'start' : 'middle';
          const labelX = x < cx - 20 ? x - 9 : x > cx + 20 ? x + 9 : x;
          const labelY = Math.abs(x - cx) <= 20 ? (y < cy ? y - 10 : y + 16) : y + 3;

          return (
            <g
              key={`node-${n.kind}-${n.id}`}
              className="cursor-pointer"
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => navigate(ENTITY_META[n.kind].route(n.id))}
            >
              <circle
                cx={x}
                cy={y}
                r={active ? 7 : 5.5}
                fill={fill}
                fillOpacity={hovered && !active ? 0.45 : 1}
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor={textAnchor}
                fill="var(--color-text)"
                fontSize="9.5"
                fontWeight={active ? 600 : 400}
                opacity={hovered && !active ? 0.5 : 0.9}
              >
                {shortLabel(n.label)}
              </text>
              <title>{n.relation ? `${n.label} (${n.relation})` : n.label}</title>
            </g>
          );
        })}

        {/* Center node */}
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={14}
            fill={ENTITY_META[centerKind].color}
            fillOpacity={0.18}
          />
          <circle
            cx={cx}
            cy={cy}
            r={8.5}
            fill={ENTITY_META[centerKind].color}
          />
          <text
            x={cx}
            y={cy + 22}
            textAnchor="middle"
            fill="var(--color-text)"
            fontSize="10"
            fontWeight="600"
          >
            {shortLabel(centerLabel, 20)}
          </text>
        </g>
      </svg>

      {overflow > 0 && (
        <div className="text-[11px] text-text-muted text-right font-mono">
          +{overflow} more connections
        </div>
      )}
    </Card>
  );
}
