import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import { Card, Badge } from '../components/ui/Cards';
import { EmptyState } from '../components/ui/EmptyState';
import { useData } from '../contexts/DataContext';
import { loadLessons } from '../lib/projects/projectFileApi';
import { OBJECTIVES_LABELS } from '../lib/projects/closure';
import { friendlyError } from '../lib/errors';
import type { Lesson, ObjectivesStatus } from '../types/projectFile';

const OBJ_VARIANT: Record<ObjectivesStatus, 'success' | 'warning' | 'danger'> = { MET: 'success', PARTLY_MET: 'warning', NOT_MET: 'danger' };
const inputCls = 'px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text';

export default function Lessons() {
  const { projects } = useData();
  const [rows, setRows] = useState<Lesson[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [objectives, setObjectives] = useState<'ALL' | ObjectivesStatus>('ALL');

  useEffect(() => {
    let cancelled = false;
    loadLessons().then(r => { if (!cancelled) setRows(r); }, e => { if (!cancelled) { setError(friendlyError(e)); setRows([]); } });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => new Set(projects.map(p => p.ProjectID)), [projects]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (rows ?? []).filter(l => {
      if (objectives !== 'ALL' && l.objectives_status !== objectives) return false;
      const text = [l.projectNo, l.projectName, l.piName, l.summary, l.what_worked, l.what_did_not, l.reusable_assets,
        l.recommendations, l.follow_on_ideas].join(' ').toLowerCase();
      return words.every(w => text.includes(w));
    });
  }, [rows, q, objectives]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-[500] font-serif text-text">Lessons learned</h1>
        <p className="text-sm text-text-muted max-w-2xl">
          What closed projects learned, from their approved completion reports — what worked, what did not, and what a
          future team should know. For questions across reports, ask SURYA.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <input type="search" aria-label="Search lessons" placeholder="Search: furnace, foam, supplier…" className={`${inputCls} flex-1 min-w-[16rem]`}
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Objectives" className={inputCls} value={objectives} onChange={(e) => setObjectives(e.target.value as 'ALL' | ObjectivesStatus)}>
          <option value="ALL">All outcomes</option>
          {(Object.keys(OBJECTIVES_LABELS) as ObjectivesStatus[]).map(k => <option key={k} value={k}>Objectives {OBJECTIVES_LABELS[k].toLowerCase()}</option>)}
        </select>
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {rows === null ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <EmptyState icon={Lightbulb} title={rows.length === 0 ? 'No lessons yet' : 'Nothing matches'}
          description={rows.length === 0 ? 'Lessons appear here once a project\'s completion report is approved.' : 'Try fewer or different words.'} />
      ) : (
        <div className="space-y-4">
          {shown.map(l => (
            <Card key={l.projectId} className="p-4 space-y-3" aria-label={`Lessons from ${l.projectNo}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-[500] text-text">
                    {visible.has(l.projectId)
                      ? <Link className="text-brand-blue hover:underline" to={`/projects/${encodeURIComponent(l.projectId)}?tab=closure`}>{l.projectNo}</Link>
                      : l.projectNo} · {l.projectName}
                  </h2>
                  <p className="text-xs text-text-muted">
                    {[l.piName, l.divisionCode, l.track === 'ULIP' ? 'In-house' : l.track === 'HQ' ? 'HQ scheme' : null, l.endDate?.slice(0, 4)].filter(Boolean).join(' · ')}
                    {l.trl_reached ? ` · TRL ${l.trl_reached}${l.trl_target ? ` of ${l.trl_target}` : ''}` : ''}
                  </p>
                </div>
                {l.objectives_status && <Badge variant={OBJ_VARIANT[l.objectives_status]}>Objectives {OBJECTIVES_LABELS[l.objectives_status].toLowerCase()}</Badge>}
              </div>
              <p className="text-sm text-text">{l.summary}</p>
              <dl className="grid md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {([['What worked', l.what_worked], ['What did not, and why', l.what_did_not], ['Reusable assets', l.reusable_assets],
                  ['Advice to a future team', l.recommendations]] as const).filter(([, v]) => v.trim()).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] uppercase tracking-wide text-text-muted">{k}</dt>
                    <dd className="text-text whitespace-pre-line">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
