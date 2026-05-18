import { useEffect, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';

export interface GraphNode {
  id: string;
  label: string;
  group?: string;
  value?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  value?: number;
}

interface NetworkGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  height?: number;
  onNodeClick?: (node: GraphNode) => void;
}

export function NetworkGraph({ nodes, links, height = 520, onNodeClick }: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (containerRef.current) setWidth(containerRef.current.offsetWidth);
    const onResize = () => {
      if (containerRef.current) setWidth(containerRef.current.offsetWidth);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (nodes.length === 0) return null;

  const graphData = { nodes, links };

  return (
    <div ref={containerRef} style={{ width: '100%', height }} className="bg-background rounded-md overflow-hidden">
      {width > 0 && (
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={width}
          height={height}
          nodeRelSize={5}
          nodeVal={(n) => (n as GraphNode).value ?? 1}
          nodeColor={() => '#c96442'}
          nodeLabel={(n) => (n as GraphNode).label}
          linkColor={() => 'rgba(94, 93, 89, 0.4)'}
          linkWidth={(l) => Math.min(3, ((l as GraphLink).value ?? 1) * 0.5)}
          cooldownTicks={80}
          onNodeClick={(n) => onNodeClick?.(n as GraphNode)}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as GraphNode & { x?: number; y?: number };
            const r = Math.max(3, Math.sqrt(n.value ?? 1) * 2.5);
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI);
            ctx.fillStyle = '#c96442';
            ctx.fill();
            if (globalScale > 1.4) {
              ctx.font = `${10 / globalScale}px Inter, system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = '#5e5d59';
              ctx.fillText(n.label.length > 18 ? `${n.label.slice(0, 16)}…` : n.label, n.x ?? 0, (n.y ?? 0) + r + 2);
            }
          }}
        />
      )}
    </div>
  );
}
