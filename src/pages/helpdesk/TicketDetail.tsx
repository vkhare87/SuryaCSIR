import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Send, MessageSquare, ChevronDown, ChevronUp,
  CirclePlus, UserCheck, ArrowRightCircle, CircleCheck, CircleX, RotateCcw,
  Shield,
} from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card, Badge } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { Timeline, type TimelineItem } from '../../components/ui/Timeline';
import { StaffPicker } from '../../components/ui/StaffPicker';
import { updateTicketStatus, addResponse, assignTicket } from '../../lib/helpdesk/ticketRPCs';
import { canRespond, canTransitionStatus, canCloseTicket, canReassign, canForceClose, isAdmin } from '../../lib/helpdesk/permissions';
import { URGENCY_COLORS, EVENT_ICONS } from '../../lib/helpdesk/constants';
import type { TicketEvent, StaffMember } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAuthorName(authorId: string, staff: StaffMember[]): string {
  const s = staff.find(st => st.ID === authorId);
  return s?.Name ?? authorId;
}

function getAuthorRole(authorId: string, staff: StaffMember[]): string {
  const s = staff.find(st => st.ID === authorId);
  return s?.Designation ?? '';
}

function renderEventDetails(event: TicketEvent, staff: StaffMember[]): string {
  const d = event.details;
  switch (event.event_type) {
    case 'Created':
      return `Ticket created by ${getAuthorName(event.actor_id, staff)}`;
    case 'Assigned': {
      const to = d.to as string;
      return `Assigned to ${getAuthorName(to, staff)}`;
    }
    case 'StatusChanged':
      return `Status changed from ${d.from} to ${d.to} by ${getAuthorName(event.actor_id, staff)}`;
    case 'Resolved':
      return `Ticket resolved by ${getAuthorName(event.actor_id, staff)}`;
    case 'Closed':
      return `Ticket closed by ${getAuthorName(event.actor_id, staff)}`;
    case 'Reopened':
      return `Ticket reopened by ${getAuthorName(event.actor_id, staff)}`;
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Event icon component map
// ---------------------------------------------------------------------------

const EVENT_ICON_MAP: Record<string, React.ElementType> = {
  CirclePlus, UserCheck, ArrowRightCircle, CircleCheck, CircleX, RotateCcw,
};

// ---------------------------------------------------------------------------
// TicketDetail Page
// ---------------------------------------------------------------------------

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const data = useData();
  const { user } = useAuth();

  const { staff, isLoading, refreshData, tickets, ticketResponses, ticketEvents } = data;

  // --- State ---
  const [replyText, setReplyText] = useState('');
  const [replyExpanded, setReplyExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showForceCloseModal, setShowForceCloseModal] = useState(false);

  // --- Derived State ---

  const ticket = useMemo(() => tickets.find(t => t.id === id), [tickets, id]);

  const responses = useMemo(() =>
    ticketResponses
      .filter(r => r.ticket_id === id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
  [ticketResponses, id]);

  const events = useMemo(() => {
    const filtered = ticketEvents
      .filter(e => e.ticket_id === id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return filtered;
  }, [ticketEvents, id]);

  const timelineExpandedDefault = events.length <= 5;
  const [timelineExpanded, setTimelineExpanded] = useState(timelineExpandedDefault);

  const timelineItems = useMemo<TimelineItem[]>(() => {
    return events.flatMap((event): TimelineItem[] => {
      const iconKey = EVENT_ICONS[event.event_type];
      const Icon = EVENT_ICON_MAP[iconKey];
      if (!Icon) return [];
      const detailText = event.details && Object.keys(event.details).length > 0
        ? renderEventDetails(event, staff)
        : null;
      return [{
        id: event.id,
        icon: <Icon size={12} className="text-text-muted" />,
        title: event.event_type,
        timestamp: event.created_at,
        detail: detailText,
      }];
    });
  }, [events, staff]);

  const showReply = user && ticket ? canRespond(user, ticket) : false;
  const showAdminTray = user ? isAdmin(user) : false;
  const canShowReassign = user ? canReassign(user) : false;
  const canShowForceClose = user ? canForceClose(user) : false;

  const canMarkInProgress = user && ticket
    ? canTransitionStatus(user, ticket, 'InProgress') && ticket.status === 'Open'
    : false;
  const canResolve = user && ticket
    ? canTransitionStatus(user, ticket, 'Resolved') && ticket.status === 'InProgress'
    : false;
  const canClose = user && ticket
    ? canCloseTicket(user, ticket)
    : false;
  const showReplyAndResolve = user && ticket
    ? (ticket.status === 'Open' || ticket.status === 'InProgress') &&
      user.id === ticket.assigned_to
    : false;

  // --- Handlers ---

  async function handleSubmitReply() {
    if (!user || !ticket || !replyText.trim()) return;
    setSubmitting(true);
    setError(null);
    const result = await addResponse({ ticketId: ticket.id, authorId: user.id, message: replyText.trim() });
    setSubmitting(false);
    if (result.success) {
      setReplyText('');
      setReplyExpanded(false);
      await refreshData?.();
    } else {
      setError('Failed to submit response. ' + (result.error ?? '') + ' Your draft has been preserved — please try again.');
    }
  }

  async function handleReplyAndResolve() {
    if (!user || !ticket || !replyText.trim()) return;
    setSubmitting(true);
    setError(null);
    const responseResult = await addResponse({ ticketId: ticket.id, authorId: user.id, message: replyText.trim() });
    if (!responseResult.success) {
      setSubmitting(false);
      setError('Failed to submit response. ' + (responseResult.error ?? ''));
      return;
    }
    const statusResult = await updateTicketStatus({ ticketId: ticket.id, newStatus: 'Resolved', actorId: user.id });
    setSubmitting(false);
    if (statusResult.success) {
      setReplyText('');
      setReplyExpanded(false);
      await refreshData?.();
    } else {
      setError('Response saved but status update failed: ' + (statusResult.error ?? '') + '. The ticket state may have changed — refresh to see current status.');
    }
  }

  async function handleTransition(newStatus: string) {
    if (!user || !ticket) return;
    setSubmitting(true);
    setError(null);
    const result = await updateTicketStatus({ ticketId: ticket.id, newStatus, actorId: user.id });
    setSubmitting(false);
    if (result.success) {
      await refreshData?.();
    } else {
      setError('Failed to update ticket status. ' + (result.error ?? '') + '. The ticket state may have changed — refresh the page to see the current status.');
    }
  }

  async function handleReassign(newHandlerId: string) {
    if (!user || !ticket) return;
    setSubmitting(true);
    const result = await assignTicket({ ticketId: ticket.id, newHandlerId, actorId: user.id });
    setSubmitting(false);
    if (result.success) {
      setShowReassignModal(false);
      await refreshData?.();
    } else {
      setError('Failed to reassign ticket: ' + (result.error ?? ''));
    }
  }

  async function handleForceClose() {
    if (!user || !ticket) return;
    setSubmitting(true);
    const result = await updateTicketStatus({ ticketId: ticket.id, newStatus: 'Closed', actorId: user.id });
    setSubmitting(false);
    if (result.success) {
      setShowForceCloseModal(false);
      await refreshData?.();
    } else {
      setError('Failed to force close ticket: ' + (result.error ?? ''));
    }
  }

  // --- Loading State ---

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-48" />
        <div className="space-y-4 mt-6">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // --- Not Found State ---

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-text-muted mb-4">Ticket not found.</p>
        <Button onClick={() => navigate('/helpdesk')} variant="secondary">Back to Helpdesk</Button>
      </div>
    );
  }

  const urgencyInfo = URGENCY_COLORS[ticket.urgency];

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* --- 1. Back Navigation + Header --- */}
      <div className="space-y-4">
        <button
          onClick={() => navigate('/helpdesk')}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={20} />
          Back
        </button>

        <div className="space-y-2">
          <h1 className="text-xl font-[500] text-text font-mono">{ticket.token}</h1>
          <h2 className="text-lg font-[500] text-text font-serif">{ticket.subject}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide ${urgencyInfo.bg} ${urgencyInfo.text}`}>
              {urgencyInfo.label}
            </span>
            <span className="text-text-muted">{ticket.status}</span>
            <span className="text-text-muted">
              <Badge variant="info">{ticket.category}</Badge>
            </span>
            <span className="text-xs text-text-muted">
              {new Date(ticket.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
            </span>
          </div>
        </div>
      </div>

      {/* --- 2. Admin Tray --- */}
      {showAdminTray && (
        <Card className="space-y-3">
          <p className="text-xs font-medium text-text-muted flex items-center gap-1.5"><Shield size={12} />Admin Actions</p>
          <div className="flex items-center gap-3">
            {canShowReassign && (
              <Button variant="secondary" size="sm" onClick={() => setShowReassignModal(true)}>
                Reassign Handler
              </Button>
            )}
            {canShowForceClose && (
              <Button variant="danger" size="sm" onClick={() => setShowForceCloseModal(true)}>
                Force Close
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* --- 3. Response Thread --- */}

      {/* Original Ticket */}
      <Card className="border-l-2 border-[#c96442] space-y-3">
        <p className="text-xs font-semibold text-[#c96442] uppercase tracking-wider">Original Ticket</p>
        <p className="text-sm text-text whitespace-pre-wrap">{ticket.description}</p>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="font-medium text-text">{getAuthorName(ticket.submitted_by, staff)}</span>
          <Badge variant="info">{getAuthorRole(ticket.submitted_by, staff)}</Badge>
          <span>·</span>
          <span>{new Date(ticket.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</span>
        </div>
      </Card>

      {/* Response posts */}
      {responses.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquare size={32} className="text-text-muted mx-auto mb-2" />
          <p className="text-text-muted text-sm">No responses yet. Be the first to respond to this ticket.</p>
        </div>
      ) : (
        <div>
          {responses.map(r => (
            <Card key={r.id} className="border-b border-border last:border-b-0 rounded-none shadow-none">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-text">{getAuthorName(r.author_id, staff)}</span>
                <Badge variant="info">{getAuthorRole(r.author_id, staff)}</Badge>
                <span className="text-xs text-text-muted">·</span>
                <span className="text-xs text-text-muted">
                  {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
                </span>
              </div>
              <p className="text-sm text-text mt-2 whitespace-pre-wrap">{r.message}</p>
            </Card>
          ))}
        </div>
      )}

      {/* --- 4. Reply Input --- */}

      {/* Error display */}
      {error && (
        <div className="bg-[#f5e8e8] border border-[#e8c8c8] text-[#b53333] px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Collapsed reply button */}
      {showReply && !replyExpanded && (
        <Button variant="secondary" onClick={() => setReplyExpanded(true)} className="w-full">
          <MessageSquare size={16} className="mr-1.5" />
          Reply
        </Button>
      )}

      {/* Expanded reply textarea */}
      <AnimatePresence>
        {replyExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <Card>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                rows={3}
                placeholder="Type your response..."
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none resize-y"
              />
              <div className="flex items-center justify-end gap-2 mt-3">
                <Button variant="ghost" size="sm" onClick={() => setReplyExpanded(false)}>
                  Cancel
                </Button>
                {showReplyAndResolve && (
                  <Button variant="secondary" size="sm" onClick={handleReplyAndResolve} isLoading={submitting}>
                    Reply &amp; Resolve
                  </Button>
                )}
                <Button variant="primary" size="sm" onClick={handleSubmitReply} isLoading={submitting} disabled={!replyText.trim()}>
                  <Send size={14} className="mr-1" />
                  Submit Reply
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- 5. Status Transition Buttons --- */}
      <div className="flex items-center gap-3">
        {canMarkInProgress && (
          <Button variant="primary" onClick={() => handleTransition('InProgress')} isLoading={submitting}>
            Mark In Progress
          </Button>
        )}
        {canResolve && (
          <Button variant="primary" onClick={() => handleTransition('Resolved')} isLoading={submitting}>
            Resolve Ticket
          </Button>
        )}
        {canClose && (
          <Button variant="secondary" onClick={() => handleTransition('Closed')} isLoading={submitting}>
            Close Ticket
          </Button>
        )}
      </div>

      {/* --- 6. Event Timeline --- */}
      {events.length > 0 && (
        <div className="border border-border rounded-lg">
          <button
            onClick={() => setTimelineExpanded(v => !v)}
            className="flex items-center gap-2 w-full px-4 py-3 text-sm font-[500] text-text font-serif hover:bg-surface-hover rounded-lg transition-colors"
          >
            Ticket Timeline
            {timelineExpanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
          </button>

          <AnimatePresence>
            {timelineExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4">
                  <Timeline items={timelineItems} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* --- Admin Modals (outside main layout) --- */}

      {/* Reassign Modal */}
      <Modal isOpen={showReassignModal} onClose={() => setShowReassignModal(false)} title="Reassign Ticket">
        <div className="space-y-4">
          <StaffPicker
            placeholder="Search by name..."
            excludeIds={ticket.assigned_to ? [ticket.assigned_to] : []}
            onSelect={(s) => handleReassign(s.ID)}
          />
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="ghost" onClick={() => setShowReassignModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Force Close Modal */}
      <Modal isOpen={showForceCloseModal} onClose={() => setShowForceCloseModal(false)} title="Force Close Ticket">
        <div className="space-y-4">
          <p className="text-sm text-text">
            This will immediately close the ticket regardless of its current status. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="ghost" onClick={() => setShowForceCloseModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleForceClose} isLoading={submitting}>Force Close</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
