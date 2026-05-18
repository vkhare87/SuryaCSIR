import { useMemo, useRef, useState, useEffect } from 'react';
import Tree from 'react-d3-tree';

export interface OrgNode {
  name: string;
  attributes?: Record<string, string>;
  children?: OrgNode[];
}

interface OrgTreeProps {
  data: OrgNode;
  height?: number;
  onNodeClick?: (node: OrgNode) => void;
}

export function OrgTree({ data, height = 520, onNodeClick }: OrgTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height });

  useEffect(() => {
    if (containerRef.current) {
      const w = containerRef.current.offsetWidth;
      setDimensions({ width: w, height });
    }
  }, [height]);

  const translate = useMemo(
    () => ({ x: dimensions.width / 2, y: 80 }),
    [dimensions.width],
  );

  return (
    <div ref={containerRef} style={{ width: '100%', height }} className="bg-background rounded-md">
      {dimensions.width > 0 && (
        <Tree
          data={data}
          orientation="vertical"
          translate={translate}
          pathFunc="step"
          collapsible
          zoomable
          separation={{ siblings: 1.4, nonSiblings: 1.8 }}
          nodeSize={{ x: 180, y: 110 }}
          renderCustomNodeElement={({ nodeDatum, toggleNode }) => (
            <g
              onClick={() => {
                toggleNode();
                onNodeClick?.(nodeDatum as unknown as OrgNode);
              }}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={-80}
                y={-22}
                width={160}
                height={44}
                rx={6}
                fill="var(--color-surface)"
                stroke="#c96442"
                strokeWidth={1}
              />
              <text
                x={0}
                y={-2}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="var(--color-text)"
              >
                {nodeDatum.name.length > 22 ? `${nodeDatum.name.slice(0, 20)}…` : nodeDatum.name}
              </text>
              {nodeDatum.attributes && (
                <text
                  x={0}
                  y={14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--color-text-muted)"
                >
                  {Object.values(nodeDatum.attributes)[0] as string}
                </text>
              )}
            </g>
          )}
        />
      )}
    </div>
  );
}
