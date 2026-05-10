import { useMemo } from 'react';
import { useParams, useNavigate, useLocation, NavLink, Link } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card, Badge } from '../../components/ui/Cards';
import { StatCard } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { KanbanBoard } from '../../components/committees/KanbanBoard';
import {
  ArrowLeft,
  Building2,
  Users,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Edit,
  Plus,
  Pencil,
} from 'lucide-react';
import {
  canEditCommittee,
  canScheduleMeeting,
  canManageMembers,
} from '../../lib/committees/permissions';
import type { Committee } from '../../types';

// --- Helper ---

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-border last:border-0">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <span className="text-sm font-medium text-text text-right max-w-[60%]">{value ?? '—'}</span>
    </div>
  );
}

// --- Main ---

export default function CommitteeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { committees, meetings, actionItems, committeeMembers, staff, isLoading } = useData();
  const { user } = useAuth();

  // --- Derived State ---

  const committee = useMemo(
    () => committees.find(c => c.id === id),
    [committees, id]
  );

  const chairperson = useMemo(
    () => (committee ? staff.find(s => s.ID === committee.chairperson_id) : undefined),
    [committee, staff]
  );

  const secretary = useMemo(
    () => (committee ? staff.find(s => s.ID === committee.secretary_id) : undefined),
    [committee, staff]
  );

  const members = useMemo(() => {
    if (!committee) return [];
    return committeeMembers
      .filter(cm => cm.committee_id === committee.id)
      .map(cm => {
        const s = staff.find(st => st.ID === cm.staff_id);
        return { member: cm, staffMember: s };
      });
  }, [committee, committeeMembers, staff]);

  const committeeMeetings = useMemo(() => {
    if (!committee) return [];
    return meetings
      .filter(m => m.committee_id === committee.id)
      .sort((a, b) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime());
  }, [committee, meetings]);

  const committeeMeetingIds = useMemo(
    () => new Set(committeeMeetings.map(m => m.id)),
    [committeeMeetings]
  );

  const committeeActions = useMemo(() => {
    if (!committee) return [];
    return actionItems.filter(
      a => (a.meeting_id && committeeMeetingIds.has(a.meeting_id)) || a.source === 'manual'
    );
  }, [committee, actionItems, committeeMeetingIds]);

  const actionCounts = useMemo(() => ({
    pending: committeeActions.filter(a => a.status === 'Pending').length,
    inProgress: committeeActions.filter(a => a.status === 'InProgress').length,
    completed: committeeActions.filter(a => a.status === 'Completed').length,
  }), [committeeActions]);

  // --- Tab Detection ---

  const activeTab: 'overview' | 'meetings' | 'actions' =
    location.pathname.endsWith('/meetings') ? 'meetings'
    : location.pathname.endsWith('/actions') ? 'actions'
    : 'overview';

  // --- Loading State ---

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div>
            <Skeleton className="h-7 w-64 mb-1" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      </div>
    );
  }

  // --- Not Found ---

  if (!committee) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <p className="text-text-muted">Committee not found.</p>
        <button
          onClick={() => navigate('/committees')}
          className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors"
        >
          Back to Committees
        </button>
      </div>
    );
  }

  // --- Permission Flags ---

  const showEdit = user && canEditCommittee(user);
  const showScheduleMeeting = user && canScheduleMeeting(user, committee);
  const showManageMembers = user && canManageMembers(user);

  const statusBadgeVariant = (s: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' => {
    if (s === 'Active') return 'success';
    if (s === 'Inactive') return 'warning';
    if (s === 'Completed') return 'success';
    if (s === 'Scheduled') return 'info';
    if (s === 'Cancelled') return 'danger';
    return 'neutral';
  };

  // --- Render Overview Tab ---

  function renderOverview(c: Committee) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-1 space-y-4">
          {/* Identity Card */}
          <Card className="border-t-4 border-[#c96442] relative overflow-hidden pt-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#d97757]/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <div className="flex flex-col items-center text-center space-y-3 z-10 relative">
              <div className="w-16 h-16 rounded-full bg-surface-hover border-4 border-background flex items-center justify-center ring-2 ring-border">
                <Building2 size={28} className="text-[#c96442]" />
              </div>
              <div>
                <h2 className="text-lg font-[500] text-text font-serif leading-snug">{c.name}</h2>
                <div className="mt-2 flex justify-center gap-2 flex-wrap">
                  <Badge variant={c.committee_type === 'Standing' ? 'info' : 'neutral'}>
                    {c.committee_type === 'AdHoc' ? 'Ad Hoc' : c.committee_type}
                  </Badge>
                  <Badge variant={statusBadgeVariant(c.status)}>
                    {c.status === 'Active' && <CheckCircle2 size={11} className="inline mr-1" />}
                    {c.status === 'Inactive' && <AlertTriangle size={11} className="inline mr-1" />}
                    {c.status}
                  </Badge>
                </div>
              </div>
            </div>
          </Card>

          {/* Details Card */}
          <Card>
            <div className="flex items-center gap-2 text-[10px] font-semibold text-[#c96442] uppercase tracking-[0.2em] mb-3">
              <Building2 size={13} />
              Details
            </div>
            <InfoRow label="Type"     value={c.committee_type === 'AdHoc' ? 'Ad Hoc' : c.committee_type} />
            <InfoRow label="Mandate"  value={c.mandate} />
            <InfoRow label="Formed"   value={c.formed_date ? new Date(c.formed_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : undefined} />
            <InfoRow label="Status"   value={c.status} />
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-2 space-y-5">
          {/* Leadership Card */}
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-border bg-surface flex items-center gap-2">
              <Users size={16} className="text-[#c96442]" />
              <h3 className="text-sm font-[500] text-text font-serif">Leadership</h3>
            </div>
            <div className="divide-y divide-border">
              {/* Chairperson */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="text-xs text-text-muted font-medium w-28 shrink-0">Chairperson</div>
                {chairperson ? (
                  <Link to={`/staff/${chairperson.ID}`} className="flex items-center gap-2 flex-1 group">
                    <div className="w-8 h-8 rounded-full bg-[#c96442]/10 flex items-center justify-center font-bold text-sm text-[#c96442] shrink-0">
                      {chairperson.Name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-text group-hover:text-[#c96442] transition-colors">
                        {chairperson.Name}
                      </div>
                      <div className="text-xs text-text-muted">{chairperson.Designation}</div>
                    </div>
                  </Link>
                ) : (
                  <span className="text-sm text-text-muted flex-1">—</span>
                )}
              </div>
              {/* Secretary */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="text-xs text-text-muted font-medium w-28 shrink-0">Secretary</div>
                {secretary ? (
                  <Link to={`/staff/${secretary.ID}`} className="flex items-center gap-2 flex-1 group">
                    <div className="w-8 h-8 rounded-full bg-[#c96442]/10 flex items-center justify-center font-bold text-sm text-[#c96442] shrink-0">
                      {secretary.Name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-text group-hover:text-[#c96442] transition-colors">
                        {secretary.Name}
                      </div>
                      <div className="text-xs text-text-muted">{secretary.Designation}</div>
                    </div>
                  </Link>
                ) : (
                  <span className="text-sm text-text-muted flex-1">—</span>
                )}
              </div>
            </div>
          </Card>

          {/* Members Card */}
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-border bg-surface flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-[#c96442]" />
                <h3 className="text-sm font-[500] text-text font-serif">Members ({members.length})</h3>
              </div>
              {showManageMembers && (
                <Button variant="ghost" size="sm" onClick={() => {}}>
                  <Plus size={14} className="mr-1" />
                  Add
                </Button>
              )}
            </div>
            <div className="divide-y divide-border">
              {members.length === 0 ? (
                <div className="p-4 text-sm text-text-muted text-center">No members assigned.</div>
              ) : (
                members.map(({ member, staffMember }) => (
                  <div key={member.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center font-bold text-sm text-text shrink-0">
                        {staffMember ? staffMember.Name.charAt(0) : '?'}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-text">
                          {staffMember ? staffMember.Name : 'Unknown'}
                        </div>
                        <div className="text-xs text-text-muted">
                          {staffMember?.Designation ?? '—'}
                        </div>
                      </div>
                    </div>
                    <Badge variant={
                      member.role === 'Member' ? 'info'
                      : member.role === 'Invitee' ? 'neutral'
                      : 'warning'
                    }>
                      {member.role === 'ExternalExpert' ? 'Expert' : member.role}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Mini Meeting Timeline */}
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-border bg-surface flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-[#c96442]" />
                <h3 className="text-sm font-[500] text-text font-serif">Recent Meetings</h3>
              </div>
            </div>
            <div className="divide-y divide-border">
              {committeeMeetings.slice(0, 3).length === 0 ? (
                <div className="p-4 text-sm text-text-muted text-center">No meetings scheduled.</div>
              ) : (
                committeeMeetings.slice(0, 3).map(m => (
                  <div key={m.id} className="p-4 flex items-center justify-between gap-4">
                    <button
                      onClick={() => navigate(`/committees/${id}/meetings/${m.id}`)}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm font-medium text-text">{m.title}</div>
                      <div className="text-xs text-text-muted mt-0.5">
                        {new Date(m.meeting_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                        {m.venue && ` · ${m.venue}`}
                      </div>
                    </button>
                    <Badge variant={statusBadgeVariant(m.status)}>{m.status}</Badge>
                  </div>
                ))
              )}
              {committeeMeetings.length > 3 && (
                <div className="p-3 text-center">
                  <button
                    onClick={() => navigate(`/committees/${id}/meetings`)}
                    className="text-sm text-[#c96442] hover:underline"
                  >
                    View All Meetings
                  </button>
                </div>
              )}
            </div>
          </Card>

          {/* Action Item Counts */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard title="Pending"     value={actionCounts.pending}     icon={<Clock size={16} />} />
            <StatCard title="In Progress" value={actionCounts.inProgress}  icon={<Pencil size={16} />} />
            <StatCard title="Completed"   value={actionCounts.completed}   icon={<CheckCircle2 size={16} />} />
          </div>
        </div>
      </div>
    );
  }

  // --- Render Meetings Tab ---

  function renderMeetings() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-[500] text-text font-serif">Meetings</h2>
          {showScheduleMeeting && (
            <Button variant="primary" size="sm" onClick={() => {}}>
              <Plus size={14} className="mr-1" />
              Schedule Meeting
            </Button>
          )}
        </div>

        {committeeMeetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[30vh] text-center space-y-4">
            <Calendar size={48} className="text-text-muted" />
            <p className="text-text-muted">No meetings scheduled.</p>
            {showScheduleMeeting && (
              <Button variant="primary" size="sm" onClick={() => {}}>
                <Plus size={14} className="mr-1" />
                Schedule Meeting
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {committeeMeetings.map(m => (
              <Card key={m.id} className="hover:shadow-[0px_0px_0px_1px_#c96442] transition-shadow cursor-pointer"
                onClick={() => navigate(`/committees/${id}/meetings/${m.id}`)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-base font-[500] text-text font-serif">{m.title}</h3>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(m.meeting_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                      {m.venue && (
                        <span className="flex items-center gap-1">
                          <Building2 size={12} />
                          {m.venue}
                        </span>
                      )}
                    </div>
                    {m.summary && (
                      <p className="text-sm text-text-muted mt-2 line-clamp-2">{m.summary}</p>
                    )}
                  </div>
                  <Badge variant={statusBadgeVariant(m.status)}>{m.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- Render Actions Tab ---

  function renderActions() {
    return <KanbanBoard committeeId={id} />;
  }

  // --- Main Render ---

  return (
    <div className="space-y-6">
      {/* Back nav + Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/committees')}
            className="p-2 hover:bg-surface-hover rounded-full transition-colors text-text-muted hover:text-text"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-[500] text-text font-serif">Committee Profile</h1>
            <p className="text-text-muted text-sm">{committee.committee_type === 'AdHoc' ? 'Ad Hoc' : committee.committee_type} Committee</p>
          </div>
        </div>
        {showEdit && (
          <button
            onClick={() => {}}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors text-text"
          >
            <Edit size={14} />
            Edit
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-border">
        <NavLink
          to={`/committees/${id}`}
          end
          className={({ isActive }) =>
            `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? 'border-[#c96442] text-[#c96442]'
                : 'border-transparent text-text-muted hover:text-text'
            }`
          }
        >
          Overview
        </NavLink>
        <NavLink
          to={`/committees/${id}/meetings`}
          className={({ isActive }) =>
            `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? 'border-[#c96442] text-[#c96442]'
                : 'border-transparent text-text-muted hover:text-text'
            }`
          }
        >
          Meetings
        </NavLink>
        <NavLink
          to={`/committees/${id}/actions`}
          className={({ isActive }) =>
            `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? 'border-[#c96442] text-[#c96442]'
                : 'border-transparent text-text-muted hover:text-text'
            }`
          }
        >
          Action Tracker
        </NavLink>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && renderOverview(committee)}
      {activeTab === 'meetings' && renderMeetings()}
      {activeTab === 'actions' && renderActions()}
    </div>
  );
}
