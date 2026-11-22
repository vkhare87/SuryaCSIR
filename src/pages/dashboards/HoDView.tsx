import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Building2, CheckCircle2, FolderKanban, Microscope, Search, Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useHome } from '../../contexts/HomeContext';
import { supabase } from '../../utils/supabaseClient';
import { Card } from '../../components/ui/Cards';
import { DoFirstStrip } from '../../components/home/common/DoFirstStrip';
import { DivisionUpwardReportCard } from '../../components/home/stage5/Stage5Cards';
import { divisionGreeting, needsAttention } from '../../lib/home/division';
import { runDecisionPrecheck } from '../../lib/home/prechecks';
import {
  decisionAsk,
  priorityAnswer,
  priorityPin,
  priorityWithdraw,
} from '../../lib/home/stage3Api';
import { ScientistView } from './ScientistView';

type HodMode = 'division' | 'own';

export function HoDView() {
  const navigate = useNavigate();
  const { user, activeRole } = useAuth();
  const { staff, projects, equipment, meetings, committeeMembers } = useData();
  const {
    ownStaff, ownStaffId, todayIso, rankedActions, todayProgress, registerClaimedKeys,
    decisions, answerTime, askedPriorities, refreshHome,
  } = useHome();
  const [askSubject, setAskSubject] = useState<{ type: string; id: string; to: string; title: string } | null>(null);
  const [askText, setAskText] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [pinAssignee, setPinAssignee] = useState('');
  const [pinTitle, setPinTitle] = useState('');
  const [pinReason, setPinReason] = useState('');
  const [pinDate, setPinDate] = useState(todayIso);
  const [stage3Err, setStage3Err] = useState<string | null>(null);
  const [stage3Busy, setStage3Busy] = useState(false);

  const storageKey = `surya.hod.mode.${user?.id ?? 'anon'}`;
  const [mode, setMode] = useState<HodMode>(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      return saved === 'own' ? 'own' : 'division';
    } catch {
      return 'division';
    }
  });
  const [divCodes, setDivCodes] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!supabase || !user?.id) {
      setDivCodes(user?.divisionCode ? [user.divisionCode] : []);
      return;
    }
    supabase.rpc('caller_division_codes').then(({ data, error }) => {
      if (cancelled) return;
      if (!error && Array.isArray(data) && data.length > 0) {
        setDivCodes(data.map(String));
      } else if (user?.divisionCode) {
        setDivCodes([user.divisionCode]);
      } else {
        setDivCodes([]);
      }
    });
    return () => { cancelled = true; };
  }, [user?.id, user?.divisionCode, activeRole]);

  const setModePersisted = (next: HodMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // ignore
    }
  };

  const scopeSet = useMemo(() => new Set(divCodes), [divCodes]);
  const primaryDiv = divCodes[0] ?? user?.divisionCode ?? '';

  const divProjects = useMemo(
    () => (scopeSet.size > 0 ? projects.filter((p) => scopeSet.has(p.DivisionCode)) : projects),
    [projects, scopeSet],
  );
  const projectExceptions = useMemo(
    () => divProjects
      .map((p) => ({ project: p, ...needsAttention(p, todayIso) }))
      .filter((x) => x.attention),
    [divProjects, todayIso],
  );
  const divStaff = useMemo(
    () => (scopeSet.size > 0 ? staff.filter((s) => scopeSet.has(s.Division)) : staff),
    [staff, scopeSet],
  );
  const divEquipment = useMemo(
    () => (scopeSet.size > 0 ? equipment.filter((e) => scopeSet.has(e.Division)) : equipment),
    [equipment, scopeSet],
  );
  const downEquipment = useMemo(
    () => divEquipment.filter((e) => /down|repair|fault|non/i.test(e.WorkingStatus)),
    [divEquipment],
  );
  const myCommitteesCount = useMemo(
    () => (ownStaffId
      ? new Set(committeeMembers.filter((m) => m.staff_id === ownStaffId).map((m) => m.committee_id)).size
      : 0),
    [committeeMembers, ownStaffId],
  );
  const upcomingDivMeetings = useMemo(
    () => meetings.filter((m) => m.meeting_date >= todayIso && m.status === 'Scheduled').slice(0, 4),
    [meetings, todayIso],
  );

  const topDecision = rankedActions[0] ?? null;

  useEffect(() => {
    if (mode === 'division') {
      registerClaimedKeys(topDecision ? [topDecision.id] : []);
    }
  }, [mode, topDecision, registerClaimedKeys]);

  const onSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) navigate(`/ask?q=${encodeURIComponent(q)}`);
  };

  const greeting = divisionGreeting(
    ownStaff?.Name ?? user?.email,
    divCodes.join(', ') || primaryDiv,
    projectExceptions.length + downEquipment.length,
    rankedActions.length,
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header + Division / My own work switch */}
      <section aria-label="Head greeting" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-[500] font-serif text-text leading-snug">
            {mode === 'division' ? greeting : 'My own work'}
          </h1>
          <p className="text-xs text-text-muted font-mono tabular-nums">
            {divStaff.length} staff · {divProjects.length} projects · {todayProgress.done} cleared today
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 shrink-0" role="group" aria-label="Workspace mode">
          <button
            type="button"
            onClick={() => setModePersisted('division')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === 'division' ? 'bg-surface-hover text-text font-semibold' : 'text-text-muted hover:text-text'
            }`}
          >
            Division
          </button>
          <button
            type="button"
            onClick={() => setModePersisted('own')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === 'own' ? 'bg-surface-hover text-text font-semibold' : 'text-text-muted hover:text-text'
            }`}
          >
            My own work
          </button>
        </div>
      </section>

      {mode === 'own' ? (
        <ScientistView />
      ) : (
        <>
          <form onSubmit={onSearchSubmit} className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Ask SURYA about ${primaryDiv || 'your division'}…`}
              aria-label="Ask SURYA scoped to division"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-sm text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-focus-blue"
            />
          </form>

          {/* SH3: Do first (priorities pinned by Director) */}
          <DoFirstStrip />

          {/* Waiting on your decision — oldest first, single terracotta CTA */}
          <Card className="p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Waiting on your decision
              </h2>
              <div className="flex items-center gap-3 font-mono tabular-nums text-xs text-text-muted">
                {answerTime && answerTime.decision_count > 0 && (
                  <span>Median answer: {answerTime.median_days}d</span>
                )}
                <span>{decisions.length > 0 ? decisions.length : rankedActions.length} open</span>
              </div>
            </div>

            {stage3Err && <p className="text-xs text-error-crimson">{stage3Err}</p>}

            {decisions.length === 0 && rankedActions.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <CheckCircle2 size={16} className="text-archive-green shrink-0" />
                <span>No approvals or reviews are waiting on you right now.</span>
              </div>
            ) : decisions.length > 0 ? (
              <ul className="divide-y divide-border">
                {decisions.slice(0, 6).map((item, idx) => {
                  const pre = runDecisionPrecheck(item.kind, {});
                  return (
                  <li key={`${item.subject_type}:${item.subject_id}`} className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text truncate">{item.title}</p>
                      <p className="text-xs text-text-muted font-mono tabular-nums truncate">
                        {item.kind} · {item.days_waiting}d waiting
                        {item.open_question ? ' · With requester' : ''}
                        {` · ${pre.summary}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.requester_user_id && (
                        <button
                          type="button"
                          onClick={() => setAskSubject({
                            type: item.subject_type,
                            id: item.subject_id,
                            to: item.requester_user_id!,
                            title: item.title,
                          })}
                          className="px-2.5 py-1.5 rounded-lg border border-border text-xs text-text-muted hover:text-text hover:bg-surface-hover"
                        >
                          Ask
                        </button>
                      )}
                      <Link
                        to={item.link}
                        className={
                          idx === 0
                            ? 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold'
                            : 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text hover:bg-surface-hover'
                        }
                      >
                        Open <ArrowRight size={13} />
                      </Link>
                    </div>
                  </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="divide-y divide-border">
                {rankedActions.slice(0, 6).map((item, idx) => (
                  <li key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text truncate">{item.label}</p>
                      <p className="text-xs text-text-muted truncate">
                        {item.detail}
                        {item.due ? ` · due ${item.due}` : ''}
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

            {askSubject && (
              <div className="pt-3 border-t border-border flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={askText}
                  onChange={(e) => setAskText(e.target.value)}
                  placeholder={`Ask clarification on ${askSubject.title}…`}
                  className="flex-1 px-2.5 py-1.5 rounded-md border border-border bg-background text-xs text-text"
                />
                <button
                  type="button"
                  disabled={stage3Busy || !askText.trim()}
                  onClick={async () => {
                    setStage3Busy(true);
                    setStage3Err(null);
                    try {
                      await decisionAsk(askSubject.type, askSubject.id, askSubject.to, askText.trim());
                      setAskSubject(null);
                      setAskText('');
                      await refreshHome();
                    } catch (err) {
                      setStage3Err(err instanceof Error ? err.message : 'Failed to ask');
                    } finally {
                      setStage3Busy(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-md bg-terracotta text-ivory text-xs font-semibold disabled:opacity-50"
                >
                  Send question
                </button>
              </div>
            )}
          </Card>

          {/* HH7: Priorities I asked */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Priorities I asked ({askedPriorities.length})
              </h2>
              <button
                type="button"
                onClick={() => setPinOpen((v) => !v)}
                className="text-xs text-terracotta hover:underline"
              >
                {pinOpen ? 'Cancel' : '+ Pin priority'}
              </button>
            </div>

            {pinOpen && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!pinAssignee || !pinTitle.trim() || pinReason.trim().length < 10) return;
                  setStage3Busy(true);
                  setStage3Err(null);
                  try {
                    await priorityPin({
                      assigneeUserId: pinAssignee,
                      title: pinTitle.trim(),
                      reason: pinReason.trim(),
                      wantedBy: pinDate,
                    });
                    setPinOpen(false);
                    setPinTitle('');
                    setPinReason('');
                    await refreshHome();
                  } catch (err) {
                    setStage3Err(err instanceof Error ? err.message : 'Failed to pin priority');
                  } finally {
                    setStage3Busy(false);
                  }
                }}
                className="space-y-2 border border-border rounded-lg p-3 bg-background"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={pinAssignee}
                    onChange={(e) => setPinAssignee(e.target.value)}
                    className="px-2.5 py-1.5 rounded border border-border bg-surface text-xs text-text"
                    required
                  >
                    <option value="">Select staff member…</option>
                    {divStaff.filter((s) => s.user_id && s.user_id !== user?.id).map((s) => (
                      <option key={s.ID} value={s.user_id!}>{s.Name}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={pinDate}
                    onChange={(e) => setPinDate(e.target.value)}
                    className="px-2.5 py-1.5 rounded border border-border bg-surface text-xs font-mono text-text"
                    required
                  />
                </div>
                <input
                  type="text"
                  value={pinTitle}
                  onChange={(e) => setPinTitle(e.target.value)}
                  placeholder="Priority title"
                  className="w-full px-2.5 py-1.5 rounded border border-border bg-surface text-xs text-text"
                  required
                />
                <input
                  type="text"
                  value={pinReason}
                  onChange={(e) => setPinReason(e.target.value)}
                  placeholder="Reason (at least 10 characters)"
                  className="w-full px-2.5 py-1.5 rounded border border-border bg-surface text-xs text-text"
                  required
                />
                <button
                  type="submit"
                  disabled={stage3Busy}
                  className="px-3 py-1.5 rounded bg-terracotta text-ivory text-xs font-semibold disabled:opacity-50"
                >
                  Pin priority
                </button>
              </form>
            )}

            {askedPriorities.length === 0 ? (
              <p className="text-xs text-text-muted">No open priorities pinned by you.</p>
            ) : (
              <ul className="space-y-2">
                {askedPriorities.map((p) => (
                  <li key={p.id} className="text-xs border-b border-border pb-2 last:border-0 last:pb-0 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-text">{p.title}</p>
                      <p className="text-[11px] font-mono tabular-nums text-text-muted">
                        By {p.wanted_by} · {p.seen_at ? 'Seen' : 'Unseen'}
                        {p.pushback_at && !p.pushback_answer ? ` · Push-back: ${p.pushback_date} (${p.pushback_reason})` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.pushback_at && !p.pushback_answer && (
                        <>
                          <button
                            type="button"
                            disabled={stage3Busy}
                            onClick={async () => { await priorityAnswer(p.id, true); await refreshHome(); }}
                            className="px-2 py-0.5 rounded border border-border text-archive-green hover:bg-surface-hover"
                          >
                            Accept {p.pushback_date}
                          </button>
                          <button
                            type="button"
                            disabled={stage3Busy}
                            onClick={async () => { await priorityAnswer(p.id, false); await refreshHome(); }}
                            className="px-2 py-0.5 rounded border border-border text-text-muted hover:bg-surface-hover"
                          >
                            Keep
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        disabled={stage3Busy}
                        onClick={async () => { await priorityWithdraw(p.id); await refreshHome(); }}
                        className="px-2 py-0.5 rounded border border-border text-text-muted hover:text-error-crimson"
                      >
                        Withdraw
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Division projects by exception */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <FolderKanban size={13} /> Division projects needing attention
              </h2>
              <Link to="/projects" className="text-xs text-text-muted hover:text-text hover:underline">
                See all ({divProjects.length})
              </Link>
            </div>
            {projectExceptions.length === 0 ? (
              <p className="text-xs text-text-muted">
                {divProjects.length} project{divProjects.length === 1 ? '' : 's'} on track.
              </p>
            ) : (
              <div className="space-y-2">
                {projectExceptions.slice(0, 5).map(({ project, reasons }) => (
                  <div key={project.ProjectID} className="flex items-center justify-between gap-3 text-xs border-b border-border pb-2 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <Link to={`/projects/${encodeURIComponent(project.ProjectID)}`} className="font-medium text-text hover:underline truncate block">
                        <span className="font-mono text-text-muted mr-1.5">{project.ProjectNo}</span>
                        {project.ProjectName}
                      </Link>
                      <span className="text-danger">{reasons.join(' · ')}</span>
                    </div>
                    <Link to={`/projects/${encodeURIComponent(project.ProjectID)}`} className="text-text-muted hover:text-text shrink-0">
                      Open file
                    </Link>
                  </div>
                ))}
                {divProjects.length > projectExceptions.length && (
                  <p className="text-xs text-text-muted font-mono tabular-nums pt-1">
                    {divProjects.length - projectExceptions.length} others on track ·{' '}
                    <Link to="/projects" className="underline hover:text-text">See all</Link>
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* People, Instruments, Committees */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                  <Users size={13} /> People
                </h2>
                <Link to="/staff" className="text-xs text-text-muted hover:text-text hover:underline">Directory</Link>
              </div>
              <p className="text-lg font-mono tabular-nums text-text">{divStaff.length}</p>
              <p className="text-xs text-text-muted">Verified staff in division scope</p>
            </Card>

            <Card className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                  <Microscope size={13} /> Instruments
                </h2>
                <Link to="/facilities" className="text-xs text-text-muted hover:text-text hover:underline">All</Link>
              </div>
              <p className="text-lg font-mono tabular-nums text-text">
                {downEquipment.length} <span className="text-xs font-sans text-text-muted">down / {divEquipment.length} total</span>
              </p>
              <p className="text-xs text-text-muted">
                {downEquipment.length === 0 ? 'All division instruments operational.' : 'Review down instruments in Facilities.'}
              </p>
            </Card>

            <Card className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                  <Building2 size={13} /> Committees
                </h2>
                <Link to="/committees" className="text-xs text-text-muted hover:text-text hover:underline">All</Link>
              </div>
              <p className="text-lg font-mono tabular-nums text-text">
                {myCommitteesCount} <span className="text-xs font-sans text-text-muted">seats · {upcomingDivMeetings.length} upcoming</span>
              </p>
              <p className="text-xs text-text-muted">Committee schedules and action items</p>
            </Card>
          </div>

          <DivisionUpwardReportCard divisionCode={primaryDiv} todayIso={todayIso} />
        </>
      )}
    </div>
  );
}
