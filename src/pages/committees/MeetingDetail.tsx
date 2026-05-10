import { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card, Badge } from '../../components/ui/Cards';
import { Skeleton } from '../../components/ui/Skeleton';
import { supabase } from '../../utils/supabaseClient';
import { canScheduleMeeting, canEditActionItems, canUnlockMinutes, canUploadDocuments } from '../../lib/committees/permissions';
import type { ActionItem } from '../../types';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Lock,
  Pencil,
  Upload,
  FileText,
  Download,
  ListOrdered,
  FileClock,
  CheckSquare,
  Files,
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

  // D-19: Lock indicator — Completed + 7 days after meeting_date
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (!meeting || meeting.status !== 'Completed') {
      setIsLocked(false);
      return;
    }
    const meetingDate = new Date(meeting.meeting_date);
    const sevenDaysAfter = meetingDate.getTime() + 7 * 86_400_000;
    setIsLocked(Date.now() > sevenDaysAfter);
  }, [meeting]);

  const canUnlock = isLocked && !!user && canUnlockMinutes(user);

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

  const handleUnlock = async () => {
    try {
      await supabase!.rpc('unlock_meeting_minutes', { p_meeting_id: meetId });
      await refreshData();
    } catch (err) {
      console.error('Failed to unlock minutes', err);
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

      {/* --- Section 2: Agenda Items (view mode) --- */}
      <Card>
        <SectionHeader icon={ListOrdered} title="Agenda" count={meetingAgendaItems.length} />
        {meetingAgendaItems.length === 0 ? (
          <p className="text-sm text-text-muted italic">No agenda items.</p>
        ) : (
          <ol className="list-decimal list-inside space-y-3">
            {meetingAgendaItems.map((item) => (
              <li key={item.id} className="text-sm text-text">
                <span>{item.description}</span>
                <span className="text-text-muted text-xs ml-2">
                  ({staffName(item.proposed_by)})
                </span>
              </li>
            ))}
          </ol>
        )}
        {/* Edit Agenda placeholder — wired by Plan 02-05 (AgendaEditor) */}
        {user && committee && canScheduleMeeting(user, committee) ? (
          <div className="mt-4">
            <button
              className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors text-text cursor-pointer"
              // Wired by Plan 02-05 (AgendaEditor)
              onClick={() => {}}
            >
              <Pencil size={14} />
              Edit Agenda
            </button>
          </div>
        ) : null}
      </Card>

      {/* --- Section 3: Minutes (read-only display) --- */}
      {/* Minutes section: read-only display. Interactive MinutesEditor wired by Plan 02-05. */}
      <Card>
        <SectionHeader icon={FileClock} title="Meeting Minutes" />
        {isLocked && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 mb-3">
            <Lock size={12} /> Locked — minutes are frozen 7 days after completion
          </span>
        )}
        {meeting.summary ? (
          <p className="text-sm text-text whitespace-pre-wrap">{meeting.summary}</p>
        ) : (
          <p className="text-sm text-text-muted italic">No minutes recorded yet.</p>
        )}
        {canUnlock && (
          <div className="mt-4">
            <button
              onClick={handleUnlock}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors text-text"
            >
              Unlock
            </button>
          </div>
        )}
      </Card>

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
      <Card>
        <SectionHeader icon={Files} title="Documents" count={meetingDocumentList.length} />
        {/* Upload placeholder — wired by Plan 02-05 (DocumentUploader) */}
        {user && canUploadDocuments(user) && (
          <div className="mb-4">
            <button
              className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors text-text cursor-pointer"
              // Wired by Plan 02-05 (DocumentUploader)
              onClick={() => {}}
            >
              <Upload size={14} />
              Upload Document
            </button>
          </div>
        )}
        {meetingDocumentList.length === 0 ? (
          <p className="text-sm text-text-muted italic">No documents uploaded.</p>
        ) : (
          <div className="space-y-2">
            {meetingDocumentList.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-surface-hover transition-colors"
              >
                <FileText size={16} className="text-text-muted shrink-0" />
                <span className="text-sm text-text flex-1 truncate">{doc.file_name}</span>
                <span className="text-xs text-text-muted shrink-0">{formatDate(doc.uploaded_at)}</span>
                {/* Download placeholder — full download via storage.from().download() wired in Plan 02-05 (DocumentUploader) */}
                <button
                  className="p-2 hover:bg-surface-hover rounded-full transition-colors text-text-muted hover:text-text shrink-0 cursor-pointer"
                  // Wired by Plan 02-05 (DocumentUploader)
                  onClick={() => {}}
                >
                  <Download size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
