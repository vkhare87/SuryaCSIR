import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2, Monitor, FileText, Users, DollarSign,
  FlaskConical, Library, Car,
  ArrowLeft, MessageSquare, Info, CheckCircle2,
} from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Cards';
import { ResolvedFaqPanel } from '../../components/helpdesk/ResolvedFaqPanel';
import { createTicket } from '../../lib/helpdesk/ticketRPCs';
import { CATEGORY_CONFIG, URGENCY_COLORS } from '../../lib/helpdesk/constants';
import { resolveRoutingPreview } from '../../lib/helpdesk/routing';
import { missingTicketFields, type TicketField } from '../../lib/helpdesk/ticketValidation';
import type { TicketCategory, TicketUrgency } from '../../types';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Building2, Monitor, FileText, Users, DollarSign,
  FlaskConical, Library, Car,
};

const URGENCY_OPTIONS: TicketUrgency[] = ['Critical', 'High', 'Medium', 'Low'];

const ERROR_FALLBACK = 'Failed to create ticket. Please try again. If the problem persists, contact your system administrator.';

interface SuccessState {
  ticketId: string;
  token: string | null;
  handlerName: string | null;
}

export default function TicketForm() {
  const { staff, divisions, helpdeskRouting, refreshSlice } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialKey = searchParams.get('key');

  const ONE_DOOR_PRESETS: Array<{ key: string; label: string; category: TicketCategory; desk: string }> = useMemo(() => [
    { key: 'leave',     label: 'Leave / tour query',               category: 'HRGrievance',    desk: 'HR Section' },
    { key: 'letter',    label: 'Certificate or official letter',   category: 'Administrative', desk: 'Administration' },
    { key: 'repair',    label: 'Lab / facility repair',            category: 'Infrastructure', desk: 'Engineering' },
    { key: 'it',        label: 'IT, network or portal help',       category: 'EquipmentIT',    desk: 'IT Cell' },
    { key: 'room',      label: 'Room, vehicle or guest house',     category: 'Administrative', desk: 'Room Desk' },
    { key: 'complaint', label: 'Confidential grievance / complaint', category: 'HRGrievance',  desk: 'Grievance Cell' },
    { key: 'safety',    label: 'Safety hazard or incident',        category: 'LabResearch',    desk: 'Safety Officer' },
    { key: 'other',     label: 'Something else',                   category: 'Administrative', desk: 'Helpdesk' },
  ], []);

  const [selectedDoorKey, setSelectedDoorKey] = useState<string | null>(initialKey);
  const [category, setCategory] = useState<TicketCategory | null>(() => {
    const match = ONE_DOOR_PRESETS.find((p) => p.key === initialKey);
    return match ? match.category : null;
  });
  useEffect(() => {
    if (!initialKey) return;
    const match = ONE_DOOR_PRESETS.find((p) => p.key === initialKey);
    if (match) {
      setSelectedDoorKey(match.key);
      setCategory(match.category);
    }
  }, [initialKey, ONE_DOOR_PRESETS]);
  const [urgency, setUrgency] = useState<TicketUrgency>('Medium');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TicketField[]>([]);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const routingPreview = useMemo(() => {
    if (!category) return null;
    return resolveRoutingPreview({
      category,
      routingEntries: helpdeskRouting,
      divisions,
      staff,
    });
  }, [category, helpdeskRouting, divisions, staff]);

  const resetForm = () => {
    setCategory(null);
    setUrgency('Medium');
    setSubject('');
    setDescription('');
    setError(null);
    setSuccess(null);
  };

  async function handleSubmit() {
    const missing = missingTicketFields({ category, subject, description });
    setFieldErrors(missing);
    if (missing.length > 0) {
      setError('Please complete the highlighted fields.');
      return;
    }
    if (!user) {
      setError('You must be logged in to submit a ticket.');
      return;
    }
    if (!category) {
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setFieldErrors([]);

    try {
      const result = await createTicket({
        subject: subject.trim(),
        category,
        urgency,
        description: description.trim(),
        submitted_by: user.id,
      });

      if (result.success) {
        const { ticketId, token } = result.data as { ticketId: string; token: string | null };
        await refreshSlice('tickets');
        setSuccess({ ticketId, token, handlerName: routingPreview?.handlerName ?? null });
      } else {
        setError(result.error ?? ERROR_FALLBACK);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <button
          onClick={() => navigate('/helpdesk')}
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft size={16} />
          Back to Helpdesk
        </button>

        <Card className="flex flex-col items-center text-center gap-4 py-10 shadow-[0px_0px_0px_1px_#16a34a]">
          <CheckCircle2 size={48} className="text-archive-green" />
          <h2 className="text-2xl font-[500] text-text font-serif">Ticket created</h2>
          <span className="font-mono text-lg text-text">{success.token ?? success.ticketId}</span>
          <p className="text-xs text-text-muted">Quote this ticket number in any follow-up.</p>
          {success.handlerName && (
            <p className="text-sm text-text-muted">Routing to {success.handlerName}</p>
          )}
          <div className="flex gap-3 mt-2">
            <Button variant="primary" onClick={() => navigate(`/helpdesk/${success.ticketId}`)}>
              View Ticket
            </Button>
            <Button variant="secondary" onClick={resetForm}>
              Create Another
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/helpdesk')}
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft size={16} />
        Back to Helpdesk
      </button>

      <div className="flex items-start gap-3">
        <div className="p-2 rounded-[8px] bg-border-cream text-terracotta">
          <MessageSquare size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">New Helpdesk Ticket</h1>
          <p className="text-text-muted mt-1">
            Submit a new ticket — it will be auto-routed to the appropriate handler.
          </p>
        </div>
      </div>

      {/* One Door quick request catalogue (CD3) */}
      <Card>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
          One Door — what do you need?
        </p>
        <div className="flex flex-wrap gap-2">
          {ONE_DOOR_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => {
                setSelectedDoorKey(preset.key);
                setCategory(preset.category);
                setFieldErrors((f) => f.filter((e) => e !== 'category'));
              }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                selectedDoorKey === preset.key
                  ? 'border-terracotta bg-terracotta/10 text-text'
                  : 'border-border bg-surface text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              {preset.label} <span className="text-[10px] font-mono opacity-75">· {preset.desk}</span>
            </button>
          ))}
        </div>
      </Card>

      <section>
        <p className="text-sm font-[500] text-text font-serif mb-3">
          What best describes your issue?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CATEGORY_CONFIG.map((entry) => {
            const Icon = CATEGORY_ICONS[entry.icon];
            const isSelected = category === entry.value;
            return (
              <button
                key={entry.value}
                type="button"
                onClick={() => setCategory(entry.value)}
                className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-left transition-colors ${
                  isSelected
                    ? 'border-2 border-terracotta bg-surface ring-1 ring-terracotta/20'
                    : 'border border-border bg-surface hover:border-terracotta/30'
                }`}
              >
                {Icon && (
                  <Icon
                    size={20}
                    className={isSelected ? 'text-terracotta' : 'text-text-muted'}
                  />
                )}
                <span
                  className={`text-sm font-medium ${
                    isSelected ? 'text-text' : 'text-text-muted'
                  }`}
                >
                  {entry.label}
                </span>
              </button>
            );
          })}
        </div>
        {fieldErrors.includes('category') && (
          <p className="text-xs text-danger mt-1">Pick a category.</p>
        )}
      </section>

      {category && routingPreview && (
        <div className="bg-surface border border-border rounded-lg p-4 flex items-start gap-2">
          <Info size={14} className="text-text-muted mt-0.5 shrink-0" />
          <p className="text-sm text-text-muted">
            Will be routed to: <span className="text-text font-medium">{routingPreview.handlerName}</span>{' '}
            ({routingPreview.handlerRole}) — based on {routingPreview.category} category mapping
          </p>
        </div>
      )}

      <section className="space-y-4">
        <p className="text-sm font-[500] text-text font-serif">Ticket Details</p>

        <div>
          <label htmlFor="ticket-subject" className="block text-xs font-semibold text-text-muted mb-1">Subject</label>
          <input
            id="ticket-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            disabled={submitting}
            placeholder="Brief summary of your issue..."
            className={`w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-focus-blue outline-none disabled:opacity-60${fieldErrors.includes('subject') ? ' border-danger' : ''}`}
          />
          {fieldErrors.includes('subject') && (
            <p className="text-xs text-danger mt-1">Subject is required.</p>
          )}
        </div>

        <ResolvedFaqPanel query={subject} />

        <div>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            How urgent is this?
          </label>
          <div className="flex rounded-lg overflow-hidden border border-border">
            {URGENCY_OPTIONS.map((u) => {
              const active = urgency === u;
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUrgency(u)}
                  disabled={submitting}
                  className={`flex-1 px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-terracotta text-ivory font-medium'
                      : 'bg-surface text-text-muted hover:bg-surface-hover'
                  } disabled:opacity-60`}
                >
                  {URGENCY_COLORS[u].label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="ticket-description" className="block text-xs font-semibold text-text-muted mb-1">Description</label>
          <textarea
            id="ticket-description"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            placeholder="Describe your issue in detail..."
            className={`w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-focus-blue outline-none resize-y disabled:opacity-60${fieldErrors.includes('description') ? ' border-danger' : ''}`}
          />
          {fieldErrors.includes('description') && (
            <p className="text-xs text-danger mt-1">Description is required.</p>
          )}
        </div>
      </section>

      {error && (
        <div role="alert" className="bg-badge-danger-bg border border-danger/30 text-error-crimson px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <Button
        variant="primary"
        isLoading={submitting}
        onClick={handleSubmit}
        className="w-full"
      >
        Submit Ticket
      </Button>
    </div>
  );
}
