import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { ChartCard } from '../components/viz/ChartCard';
import { CategoryBar } from '../components/viz/CategoryBar';
import { CategoryDonut } from '../components/viz/CategoryDonut';
import { Histogram } from '../components/viz/Histogram';
import { OrgTree, type OrgNode } from '../components/viz/OrgTree';
import { NetworkGraph, type GraphLink, type GraphNode } from '../components/viz/NetworkGraph';
import { useChartFilter } from '../utils/useChartFilter';
import { personNamesMatch } from '../utils/analytics';
import { coAuthorPairs } from '../lib/intelligence/collaboration';
import { successionRisk } from '../lib/staff/successionRisk';
import { formatDate } from '../utils/dateUtils';

function yearsBetween(dateStr: string, ref = new Date()): number {
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return NaN;
  return (ref.getTime() - t) / (365.25 * 86400000);
}

export default function StaffAnalytics() {
  const { staff, scientificOutputs } = useData();
  const { filter, toggleFilter } = useChartFilter();
  const navigate = useNavigate();

  const orgTreeData = useMemo<OrgNode>(() => {
    if (staff.length === 0) return { name: 'CSIR-AMPRI', children: [] };
    const byId = new Map(staff.map((s) => [s.ID, s]));
    const childrenById = new Map<string, string[]>();
    const roots: string[] = [];
    for (const s of staff) {
      if (s.ReportingID && byId.has(s.ReportingID)) {
        const list = childrenById.get(s.ReportingID) ?? [];
        list.push(s.ID);
        childrenById.set(s.ReportingID, list);
      } else {
        roots.push(s.ID);
      }
    }
    const seen = new Set<string>();
    const build = (id: string): OrgNode | null => {
      if (seen.has(id)) return null;
      seen.add(id);
      const s = byId.get(id);
      if (!s) return null;
      const kidIds = childrenById.get(id) ?? [];
      return {
        name: s.Name,
        attributes: { designation: s.Designation || s.Group || '' },
        children: kidIds
          .map(build)
          .filter((n): n is OrgNode => n !== null)
          .slice(0, 30),
      };
    };
    const rootNodes = roots.map(build).filter((n): n is OrgNode => n !== null);
    if (rootNodes.length === 1) return rootNodes[0];
    return { name: 'CSIR-AMPRI', children: rootNodes };
  }, [staff]);

  const collabGraph = useMemo<{ nodes: GraphNode[]; links: GraphLink[] }>(() => {
    if (staff.length === 0 || scientificOutputs.length === 0) return { nodes: [], links: [] };
    const outputCount = new Map<string, number>();
    const linkCount = new Map<string, number>();
    for (const pub of scientificOutputs) {
      const authors = pub.authors ?? [];
      const matched = authors
        .map((authorName) => staff.find((s) => personNamesMatch(s.Name, authorName))?.ID)
        .filter((id): id is string => Boolean(id));
      for (const id of matched) outputCount.set(id, (outputCount.get(id) ?? 0) + 1);
      for (let i = 0; i < matched.length; i++) {
        for (let j = i + 1; j < matched.length; j++) {
          const [a, b] = [matched[i], matched[j]].sort();
          const key = `${a}|${b}`;
          linkCount.set(key, (linkCount.get(key) ?? 0) + 1);
        }
      }
    }
    const nodes: GraphNode[] = Array.from(outputCount, ([id, count]) => {
      const s = staff.find((x) => x.ID === id);
      return { id, label: s?.Name ?? id, group: s?.Division, value: count };
    });
    const links: GraphLink[] = Array.from(linkCount, ([key, value]) => {
      const [source, target] = key.split('|');
      return { source, target, value };
    });
    return { nodes, links };
  }, [staff, scientificOutputs]);

  const collaborations = useMemo(
    () => coAuthorPairs(scientificOutputs, staff).slice(0, 10),
    [scientificOutputs, staff],
  );

  const byDivision = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of staff) {
      const k = s.Division || 'Unspecified';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [staff]);

  const designationMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of staff) {
      const k = s.Designation || 'Unspecified';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [staff]);

  const groupMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of staff) {
      counts.set(s.Group || 'Unspecified', (counts.get(s.Group || 'Unspecified') ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [staff]);

  const tenureYears = useMemo(
    () => staff.map((s) => yearsBetween(s.DOJ)).filter((v) => Number.isFinite(v) && v >= 0),
    [staff],
  );

  const retirementRunway = useMemo(() => {
    const now = new Date();
    const buckets: Record<string, number> = { '0–1y': 0, '1–3y': 0, '3–5y': 0, '5–10y': 0, '>10y': 0 };
    for (const s of staff) {
      if (!s.DOB) continue;
      const t = Date.parse(s.DOB);
      if (!Number.isFinite(t)) continue;
      const retireAt = new Date(t);
      retireAt.setFullYear(retireAt.getFullYear() + 60);
      const yrs = (retireAt.getTime() - now.getTime()) / (365.25 * 86400000);
      if (yrs < 0) continue;
      if (yrs <= 1) buckets['0–1y']++;
      else if (yrs <= 3) buckets['1–3y']++;
      else if (yrs <= 5) buckets['3–5y']++;
      else if (yrs <= 10) buckets['5–10y']++;
      else buckets['>10y']++;
    }
    return Object.entries(buckets).map(([label, value]) => ({ label, value }));
  }, [staff]);

  const genderMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of staff) {
      const k = s.Gender || 'Unspecified';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [staff]);

  const atRisk = useMemo(() => successionRisk(staff), [staff]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Staff Analytics</h1>
          <p className="text-text-muted mt-1 text-sm">Institute-wide workforce overview</p>
        </div>
        <Link
          to="/hr-admin"
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft size={14} />
          Back to HR Admin
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Headcount by division" subtitle="click to filter the staff list">
          <CategoryBar
            data={byDivision}
            onSelect={(d) => toggleFilter({ dim: 'division', value: d.label })}
            selected={filter?.dim === 'division' ? filter.value : null}
          />
        </ChartCard>

        <ChartCard title="Top 12 designations">
          <CategoryBar
            data={designationMix}
            horizontal
            onSelect={(d) => toggleFilter({ dim: 'designation', value: d.label })}
            selected={filter?.dim === 'designation' ? filter.value : null}
          />
        </ChartCard>

        <ChartCard title="Group mix">
          <CategoryDonut
            data={groupMix}
            onSelect={(d) => toggleFilter({ dim: 'group', value: d.label })}
            selected={filter?.dim === 'group' ? filter.value : null}
          />
        </ChartCard>

        <ChartCard title="Gender mix">
          <CategoryDonut data={genderMix} />
        </ChartCard>

        <ChartCard title="Service tenure" subtitle="years since DOJ">
          <Histogram values={tenureYears} xLabel="years" yLabel="staff" />
        </ChartCard>

        <ChartCard title="Retirement runway" subtitle="from DOB + 60y">
          <CategoryBar data={retirementRunway} />
        </ChartCard>

        {atRisk.length > 0 && (
          <ChartCard
            title="Succession risk"
            subtitle="retiring within 3 years — CoreArea no staying colleague covers (exact match; verify synonyms manually)"
            className="lg:col-span-2"
          >
            <table className="w-full text-sm">
              <thead className="text-left text-text-muted">
                <tr>
                  <th className="p-2 font-medium">Name</th>
                  <th className="p-2 font-medium">Designation</th>
                  <th className="p-2 font-medium">Division</th>
                  <th className="p-2 font-medium">Core area</th>
                  <th className="p-2 font-medium">Retires</th>
                </tr>
              </thead>
              <tbody>
                {atRisk.map((r) => (
                  <tr key={r.staff.ID} className="border-t border-border">
                    <td className="p-2 text-text">{r.staff.Name}</td>
                    <td className="p-2 text-text-muted">{r.staff.Designation}</td>
                    <td className="p-2 text-text-muted">{r.staff.Division}</td>
                    <td className="p-2 text-text-muted">{r.staff.CoreArea}</td>
                    <td className="p-2 text-text-muted">{formatDate(r.retiresOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartCard>
        )}

        <ChartCard
          title="Org hierarchy"
          subtitle="reporting chain — click node to expand/collapse"
          className="lg:col-span-2"
          bodyClassName="min-h-0"
        >
          <OrgTree data={orgTreeData} height={520} />
        </ChartCard>

        <ChartCard
          title="Collaboration network"
          subtitle="co-authorship from scientific outputs — node size = publication count"
          className="lg:col-span-2"
          bodyClassName="min-h-0"
        >
          {collabGraph.nodes.length > 0 ? (
            <NetworkGraph
              nodes={collabGraph.nodes}
              links={collabGraph.links}
              height={520}
              onNodeClick={(n) => navigate(`/staff/${n.id}`)}
            />
          ) : (
            <div className="h-[400px] flex items-center justify-center text-sm text-text-muted">
              No co-authorship data available yet.
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Top collaborations"
          subtitle="most frequent co-author pairs — cross-division flagged"
          className="lg:col-span-2"
        >
          {collaborations.length === 0 ? (
            <p className="text-sm text-text-muted">No co-authored publications recorded.</p>
          ) : (
            <ul className="space-y-1.5">
              {collaborations.map(p => (
                <li key={`${p.a}|${p.b}`} className="flex items-center justify-between text-sm">
                  <span className="text-text">{p.a} × {p.b}</span>
                  <span className="text-xs text-text-muted">
                    {p.count} paper{p.count > 1 ? 's' : ''}{p.crossDivision ? ' · cross-division' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
