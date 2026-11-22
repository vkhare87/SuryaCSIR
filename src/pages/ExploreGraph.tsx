import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ForceGraph2D from 'react-force-graph-2d';
import { useData } from '../contexts/DataContext';
import { buildGraph, type GraphNode } from '../lib/relations';
import { ENTITY_META, type EntityKind } from '../lib/entities';
import { Card } from '../components/ui/Cards';

const KIND_LABEL: Record<EntityKind, string> = { staff: 'Staff', project: 'Projects', division: 'Divisions' };

export default function ExploreGraph() {
  const { staff, projects, projectStaff, divisions } = useData();
  const navigate = useNavigate();
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [kinds, setKinds] = useState({ staff: true, project: true, division: true });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graph = useMemo(
    () => buildGraph(staff, projects, projectStaff, divisions, kinds),
    [staff, projects, projectStaff, divisions, kinds],
  );

  const onClick = (node: GraphNode) => {
    const [prefix, ...rest] = node.id.split(':');
    const rawId = rest.join(':');
    const kind: EntityKind = prefix === 's' ? 'staff' : prefix === 'p' ? 'project' : 'division';
    navigate(ENTITY_META[kind].route(rawId));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif text-text">Explore</h1>
          <p className="text-sm text-text-muted">The institute as a connected graph — {graph.nodes.length} nodes, {graph.links.length} links.</p>
        </div>
        <div className="flex items-center gap-2">
          {(Object.keys(kinds) as EntityKind[]).map(k => {
            const on = kinds[k];
            return (
              <button key={k}
                onClick={() => setKinds(p => ({ ...p, [k]: !p[k] }))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                style={{
                  borderColor: on ? ENTITY_META[k].color : 'var(--color-border)',
                  background: on ? `${ENTITY_META[k].color}1a` : 'transparent',
                  color: on ? ENTITY_META[k].color : 'var(--color-text-muted)',
                }}>
                <span className="w-2 h-2 rounded-full" style={{ background: ENTITY_META[k].color, opacity: on ? 1 : 0.35 }} />
                {KIND_LABEL[k]}
              </button>
            );
          })}
        </div>
      </div>

      <Card variant="raised" className="p-0 overflow-hidden">
        <div ref={wrap} className="h-[70vh] w-full bg-background">
          <ForceGraph2D
            graphData={graph}
            width={size.w}
            height={size.h}
            backgroundColor="rgba(0,0,0,0)"
            nodeRelSize={4}
            nodeVal={(n: GraphNode) => n.val}
            nodeLabel={(n: GraphNode) => n.name}
            nodeColor={(n: GraphNode) => ENTITY_META[n.kind].color}
            linkColor={() => 'rgba(135,134,127,0.25)'}
            linkWidth={0.5}
            onNodeClick={onClick}
            cooldownTicks={80}
          />
        </div>
      </Card>
    </div>
  );
}
