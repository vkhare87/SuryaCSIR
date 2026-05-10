import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card, Badge } from '../../components/ui/Cards';
import { Skeleton } from '../../components/ui/Skeleton';
import { supabase } from '../../utils/supabaseClient';
import { canEditActionItems, canWriteMinutes, canUploadDocuments } from '../../lib/committees/permissions';
import { AgendaEditor } from '../../components/committees/AgendaEditor';
import { MinutesEditor } from '../../components/committees/MinutesEditor';
import { DocumentUploader } from '../../components/committees/DocumentUploader';
import type { ActionItem } from '../../types';
import {
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  ListOrdered,
  FileClock,
  CheckSquare,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-border last:border-0">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <span className="text-sm font-medium text-text text-right max-w-[60%]">{value ?? '—'}</span>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={16} className="text-[#c96442]" />
      <h3 className="text-sm font-[500] text-text font-serif">{title}</h3>
      {count !== undefined && (
        <Badge variant="neutral">{count}</Badge>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MeetingDetail
// ---------------------------------------------------------------------------

export default function MeetingDetail() {
  const { id, meetId } = useParams<{ id: string; meetId: string }>();
  const navigate = useNavigate();
  const { committees, meetings, agendaItems, actionItems, meetingDocs, staff, isLoading, refreshData } = useData();
  const { user } = useAuth();

  // --- Derived state ---

  const meeting = useMemo(
    () => meetings.find((m) => m.id === meetId),
    [meetings, meetId],
  );

  const committee = useMemo(
    () => {
      if (!meeting) return undefined;
      return committees.find((c) => c.id === meeting.committee_id);
    },
    [meeting, committees],
  );

  const meetingAgendaItems = useMemo(
    () =>
      agendaItems
        .filter((a) => a.meeting_id === meetId)
        .sort((a, b) => a.sequence - b.sequence),
    [agendaItems, meetId],
  );

  const meetingActionItems = useMemo(
    () => actionItems.filter((a) => a.meeting_id === meetId),
    [actionItems, meetId],
  );

  const meetingDocumentList = useMemo(
    () => meetingDocs.filter((d) => d.meeting_id === meetId),
    [meetingDocs, meetId],
  );

  // --- Permissions ---

  const canAgendaEdit = !!(user && committee && canWriteMinutes(user, committee));
  const canUpload = !!(user && canUploadDocuments(user));

  // --- Helpers ---

  const staffName = (staffId: string): string => {
    const s = staff.find((st) => st.ID === staffId);
    return s ? s.Name : staffId;
  };

  const formatDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const statusBadgeVariant = (status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' => {
    if (status === 'Completed' || status === 'Completed') return 'success';
    if (status === 'Cancelled') return 'danger';
    if (status === 'Scheduled') return 'info';
    return 'neutral';
  };

  const actionStatusVariant = (status: ActionItem['status']): 'success' | 'warning' | 'info' | 'neutral' => {
    if (status === 'Completed') return 'success';
    if (status === 'Pending') return 'warning';
    if (status === 'InProgress') return 'info';
    return 'neutral';
  };

  // D-12: Cycle action item status Pending -> InProgress -> Completed -> Pending
  const cycleStatus = async (item: ActionItem) => {
    if (!user || !canEditActionItems(user)) return;
    const next: Record<string, ActionItem['status']> = {
      Pending: 'InProgress',
      InProgress: 'Completed',
      Completed: 'Pending',
    };
    const newStatus = next[item.status];
    try {
      await supabase!
        .from('action_items')
        .update({
          status: newStatus,
          completed_at: newStatus === 'Completed' ? new Date().toISOString() : null,
        })
        .eq('id', item.id);
      await refreshData();
    } catch (err) {
      console.error('Failed to cycle action item status', err);
    }
  };

  // --- Loading state ---

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  // --- Not-found state ---

  if (!meeting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <p className="text-text-muted">Meeting not found.</p>
        <button
          onClick={() => navigate(`/committees/${id}`)}
          className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors text-text"
        >
          Back to Committee
        </button>
      </div>
    );
  }

  // --- Main render ---

  return (
    <div className="space-y-6">
      {/* --- Back Nav --- */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(`/committees/${id}`)}
          className="p-2 hover:bg-surface-hover rounded-full transition-colors text-text-muted hover:text-text"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Meeting Detail</h1>
          <p className="text-text-muted text-sm">{committee?.name ?? 'Committee'}</p>
        </div>
      </div>

      {/* --- Section 1: Meeting Info Card --- */}
      <Card>
        <SectionHeader icon={Calendar} title="Meeting Information" />
        <h2 className="text-lg font-[500] text-text font-serif mb-3">{meeting.title}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <InfoRow label="Date" value={formatDate(meeting.meeting_date)} />
          <InfoRow label="Venue" value={meeting.venue} />
          <div className="flex justify-between items-start py-2.5 border-b border-border">
            <span className="text-xs font-medium text-text-muted">Status</span>
            <Badge variant={statusBadgeVariant(meeting.status)}>{meeting.status}</Badge>
          </div>
          <InfoRow label="Committee" value={committee?.name ?? meeting.committee_id} />
        </div>
        {meeting.status === 'Completed' && meeting.summary ? (
          <p className="text-xs text-text-muted mt-3 flex items-center gap-1">
            <FileClock size={12} />
            Minutes recorded
          </p>
        ) : meeting.status !== 'Completed' ? (
          <p className="text-xs text-text-muted mt-3 flex items-center gap-1">
            <Clock size={12} />
            Awaiting minutes
          </p>
        ) : null}
      </Card>

      {/* --- Section 2: Agenda Items --- */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ListOrdered size={16} className="text-[#c96442]" />
            <h3 className="text-sm font-medium text-text">Agenda</h3>
            <Badge variant="info">{meetingAgendaItems.length}</Badge>
          </div>
        </div>
        <AgendaEditor
          items={meetingAgendaItems}
          onSave={async (items) => {
            for (const item of items) {
              await supabase!.from('agenda_items')
                .upsert({ id: item.id, meeting_id: meetId, sequence: item.sequence, description: item.description, proposed_by: item.proposed_by, status: item.status });
            }
            await refreshData();
          }}
          canEdit={canAgendaEdit}
        />
      </Card>

      {/* --- Section 3: Minutes --- */}
      {committee && user ? (
        <Card className="p-4">
          <MinutesEditor
            meeting={meeting}
            committee={committee}
            user={user}
            onUpdate={refreshData}
          />
        </Card>
      ) : (
        <Card className="p-4">
          <h3 className="text-sm font-medium text-text mb-3">Meeting Minutes</h3>
          {meeting.summary ? (
            <p className="text-sm text-text whitespace-pre-wrap">{meeting.summary}</p>
          ) : (
            <p className="text-sm text-text-muted italic">No minutes recorded yet.</p>
          )}
        </Card>
      )}

      {/* --- Section 4: Action Items --- */}
      <Card>
        <SectionHeader icon={CheckSquare} title="Action Items" count={meetingActionItems.length} />
        {meetingActionItems.length === 0 ? (
          <p className="text-sm text-text-muted italic">No action items for this meeting.</p>
        ) : (
          <div className="space-y-3">
            {meetingActionItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border border-border rounded-lg hover:bg-surface-hover transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text truncate">{item.task}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                    <span className="text-xs text-text-muted">
                      Assigned: {staffName(item.assigned_to)}
                    </span>
                    {item.deadline && (
                      <span className="text-xs text-text-muted">
                        Deadline: {formatDate(item.deadline)}
                      </span>
                    )}
                  </div>
                </div>
                {/* D-12: Clickable status badge */}
                {user && canEditActionItems(user) ? (
                  <button
                    onClick={() => cycleStatus(item)}
                    className="shrink-0 cursor-pointer"
                    title="Click to cycle status"
                  >
                    <Badge variant={actionStatusVariant(item.status)}>{item.status}</Badge>
                  </button>
                ) : (
                  <Badge variant={actionStatusVariant(item.status)}>{item.status}</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* --- Section 5: Documents --- */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-[#c96442]" />
            <h3 className="text-sm font-medium text-text">Documents</h3>
            <Badge variant="info">{meetingDocumentList.length}</Badge>
          </div>
        </div>
        <DocumentUploader
          meetingId={meetId!}
          committeeId={id!}
          canUpload={canUpload}
        />
      </Card>
    </div>
  );
}
