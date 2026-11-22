import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useHome } from '../../contexts/HomeContext';
import { supabase } from '../../utils/supabaseClient';
import { Card } from '../../components/ui/Cards';
import { DoFirstStrip } from '../../components/home/common/DoFirstStrip';
import { DelegationDialCard } from '../../components/home/director/DelegationDialCard';
import { DirectorWatchCard } from '../../components/home/stage5/Stage5Cards';
import { directorGreeting, needsAttention } from '../../lib/home/division';

interface DivisionRollupRow {
  div_code: string;
  div_name: string;
  staff_count: number;
  active_projects: number;
  late_projects: number;
  vacant_posts: number;
}

export function DirectorView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { divisions, staff, projects, equipment, meetings } = useData();
  const { ownStaff, todayIso, rankedActions, registerClaimedKeys } = useHome();
  const [query, setQuery] = useState('');
  const [rollup, setRollup] = useState<DivisionRollupRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!supabase) return;
    supabase.rpc('division_rollup').then(({ data, error }) => {
      if (cancelled || error || !Array.isArray(data)) return;
      setRollup(
        (data as Record<string, unknown>[]).map((r) => ({
          div_code: String(r.div_code ?? ''),
          div_name: String(r.div_name ?? ''),
          staff_count: Number(r.staff_count ?? 0),
          active_projects: Number(r.active_projects ?? 0),
          late_projects: Number(r.late_projects ?? 0),
          vacant_posts: Number(r.vacant_posts ?? 0),
        })),
      );
    });
    return () => { cancelled = true; };
  }, []);

  const computedRollup = useMemo<DivisionRollupRow[]>(() => {
    if (rollup && rollup.length > 0) return rollup;
    return divisions.map((d) => {
      const divProj = projects.filter((p) => p.DivisionCode === d.divCode);
      return {
        div_code: d.divCode,
        div_name: d.divName,
        staff_count: staff.filter((s) => s.Division === d.divCode).length,
        active_projects: divProj.filter((p) => p.ProjectStatus === 'Active').length,
        late_projects: divProj.filter((p) => needsAttention(p, todayIso).reasons.includes('Behind schedule')).length,
        vacant_posts: 0,
      };
    });
  }, [rollup, divisions, projects, staff, todayIso]);

  const exceptionDivisions = useMemo(
    () => computedRollup.filter((d) => d.late_projects > 0 || d.vacant_posts > 0),
    [computedRollup],
  );

  const topDecision = rankedActions[0] ?? null;
  useEffect(() => {
    registerClaimedKeys(topDecision ? [topDecision.id] : []);
  }, [topDecision, registerClaimedKeys]);

  const activeProjects = useMemo(() => projects.filter((p) => p.ProjectStatus === 'Active'), [projects]);
  const sanctionedCrore = useMemo(
    () => (activeProjects.reduce((sum, p) => sum + Number(p.SanctionedCost || 0), 0) / 1e7).toFixed(2),
    [activeProjects],
  );
  const operationalEquipment = useMemo(
    () => equipment.filter((e) => !/down|fault|non/i.test(e.WorkingStatus)).length,
    [equipment],
  );
  const upcomingMeetings = useMemo(
    () => meetings.filter((m) => m.meeting_date >= todayIso && m.status === 'Scheduled').slice(0, 5),
    [meetings, todayIso],
  );

  const greeting = directorGreeting(
    ownStaff?.Name ?? user?.email,
    exceptionDivisions.length,
    rankedActions.length,
  );

  const onSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) navigate(`/ask?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="space-y-6 pb-12">
      <section aria-label="Director greeting" className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-[500] font-serif text-text leading-snug">{greeting}</h1>
        <p className="text-xs text-text-muted font-mono tabular-nums">
          {computedRollup.length} divisions · {activeProjects.length} active projects
        </p>
      </section>

      <form onSubmit={onSearchSubmit} className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask SURYA institute-wide…"
          aria-label="Ask SURYA institute-wide"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-sm text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-focus-blue"
        />
      </form>

      {/* Do first (if any priority pinned) */}
      <DoFirstStrip />

      {/* DH2 / DH4: Delegation dial & Director flags */}
      <DelegationDialCard />

      {/* DH13: Director critical briefing & watch list */}
      <DirectorWatchCard />

      {/* Waiting on your decision */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Waiting on your decision
          </h2>
          <span className="font-mono tabular-nums text-xs text-text-muted">{rankedActions.length}</span>
        </div>
        {rankedActions.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <CheckCircle2 size={16} className="text-archive-green shrink-0" />
            <span>No decisions awaiting Director sign-off right now.</span>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rankedActions.slice(0, 6).map((item, idx) => (
              <li key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text truncate">{item.label}</p>
                  <p className="text-xs text-text-muted truncate">
                    {item.detail}{item.due ? ` · due ${item.due}` : ''}
                  </p>
                </div>
                <Link
                  to={item.link}
                  className={
                    idx === 0
                      ? 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold shrink-0'
                      : 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text hover:bg-surface-hover shrink-0'
                  }
                >
                  Open <ArrowRight size={13} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Divisions by exception + My week */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Divisions by exception
            </h2>
            <Link to="/divisions" className="text-xs text-text-muted hover:text-text hover:underline">
              All ({computedRollup.length})
            </Link>
          </div>
          {exceptionDivisions.length === 0 ? (
            <p className="text-xs text-text-muted">
              All {computedRollup.length} divisions are on track with no late projects.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {exceptionDivisions.slice(0, 6).map((d) => (
                <li key={d.div_code} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs">
                  <Link to={`/divisions?div=${encodeURIComponent(d.div_code)}`} className="font-medium text-text hover:underline truncate">
                    <span className="font-mono text-text-muted mr-1.5">{d.div_code}</span>
                    {d.div_name}
                  </Link>
                  <span className="font-mono tabular-nums text-danger shrink-0">
                    {d.late_projects} late{d.vacant_posts > 0 ? ` · ${d.vacant_posts} vacant` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
              <Building2 size={13} /> My week · chair &amp; committees
            </h2>
            <Link to="/committees" className="text-xs text-text-muted hover:text-text hover:underline">All</Link>
          </div>
          {upcomingMeetings.length === 0 ? (
            <p className="text-xs text-text-muted">No scheduled meetings this week.</p>
          ) : (
            <ul className="space-y-2">
              {upcomingMeetings.map((m) => (
                <li key={m.id} className="flex items-baseline justify-between gap-2 text-xs">
                  <Link to={`/committees/${m.committee_id}/meetings/${m.id}`} className="text-text hover:underline truncate">
                    {m.title}
                  </Link>
                  <span className="font-mono tabular-nums text-text-muted shrink-0">{m.meeting_date}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Institute at a glance — four drillable numbers last per DH1 */}
      <Card className="p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Institute at a glance
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link to="/projects" className="rounded-lg border border-border p-3 hover:bg-surface-hover transition-colors">
            <div className="text-[11px] text-text-muted">Active projects</div>
            <div className="text-xl font-mono tabular-nums text-text mt-0.5">{activeProjects.length}</div>
          </Link>
          <Link to="/portfolio" className="rounded-lg border border-border p-3 hover:bg-surface-hover transition-colors">
            <div className="text-[11px] text-text-muted">Sanctioned outlay</div>
            <div className="text-xl font-mono tabular-nums text-text mt-0.5">₹{sanctionedCrore} Cr</div>
          </Link>
          <Link to="/staff" className="rounded-lg border border-border p-3 hover:bg-surface-hover transition-colors">
            <div className="text-[11px] text-text-muted">Verified staff</div>
            <div className="text-xl font-mono tabular-nums text-text mt-0.5">{staff.length}</div>
          </Link>
          <Link to="/facilities" className="rounded-lg border border-border p-3 hover:bg-surface-hover transition-colors">
            <div className="text-[11px] text-text-muted">Equipment operational</div>
            <div className="text-xl font-mono tabular-nums text-text mt-0.5">{operationalEquipment}/{equipment.length}</div>
          </Link>
        </div>
      </Card>
    </div>
  );
}
