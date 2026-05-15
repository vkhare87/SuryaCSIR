import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Filter, Ticket as TicketIcon, AlertTriangle, CheckCircle2,
  Clock, RotateCcw, Inbox,
} from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card, Badge } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  URGENCY_COLORS, CATEGORY_CONFIG,
  URGENCY_SORT_ORDER, STATUS_SORT_ORDER,
} from '../../lib/helpdesk/constants';
import { canViewAllTickets } from '../../lib/helpdesk/permissions';
import type { TicketStatus, TicketCategory, TicketUrgency } from '../../types';

const STATUS_VARIANT: Record<TicketStatus, 'info' | 'warning' | 'success' | 'neutral'> = {
  Open: 'warning',
  InProgress: 'info',
  Resolved: 'success',
  Closed: 'neutral',
};

export default function TicketList() {
  const { tickets, staff, isLoading } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'All'>('All');
  const [urgencyFilter, setUrgencyFilter] = useState<TicketUrgency | 'All'>('All');
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | 'All'>('All');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'mine'>('all');

  const seesAll = user ? canViewAllTickets(user) : false;

  const staffById = useMemo(() => {
    const m = new Map<string, string>();
    staff.forEach((s) => m.set(s.ID, s.Name));
    return m;
  }, [staff]);

  const visibleTickets = useMemo(() => {
    if (!user) return [];
    if (seesAll) return tickets;
    return tickets.filter((t) => t.submitted_by === user.id || t.assigned_to === user.id);
  }, [tickets, user, seesAll]);

  const filteredTickets = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return visibleTickets
      .filter((t) => {
        if (statusFilter !== 'All' && t.status !== statusFilter) return false;
        if (urgencyFilter !== 'All' && t.urgency !== urgencyFilter) return false;
        if (categoryFilter !== 'All' && t.category !== categoryFilter) return false;
        if (scopeFilter === 'mine' && user && t.submitted_by !== user.id && t.assigned_to !== user.id) return false;
        if (term) {
          const inSubject = t.subject.toLowerCase().includes(term);
          const inToken = t.token.toLowerCase().includes(term);
          const inDesc = t.description.toLowerCase().includes(term);
          if (!inSubject && !inToken && !inDesc) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const us = URGENCY_SORT_ORDER.indexOf(a.urgency) - URGENCY_SORT_ORDER.indexOf(b.urgency);
        if (us !== 0) return us;
        const ss = STATUS_SORT_ORDER.indexOf(a.status) - STATUS_SORT_ORDER.indexOf(b.status);
        if (ss !== 0) return ss;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [visibleTickets, searchTerm, statusFilter, urgencyFilter, categoryFilter, scopeFilter, user]);

  const kpis = useMemo(() => ({
    total: visibleTickets.length,
    open: visibleTickets.filter((t) => t.status === 'Open').length,
    inProgress: visibleTickets.filter((t) => t.status === 'InProgress').length,
    critical: visibleTickets.filter((t) => t.urgency === 'Critical' && t.status !== 'Closed').length,
    resolved: visibleTickets.filter((t) => t.status === 'Resolved').length,
  }), [visibleTickets]);

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('All');
    setUrgencyFilter('All');
    setCategoryFilter('All');
    setScopeFilter('all');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Helpdesk</h1>
          <p className="text-text-muted mt-1">Support tickets and grievance tracking</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Total"       value={kpis.total}      icon={<TicketIcon size={18} />}    sublabel="tickets" />
        <KpiCard label="Open"        value={kpis.open}       icon={<Inbox size={18} />}         sublabel="awaiting" />
        <KpiCard label="In Progress" value={kpis.inProgress} icon={<Clock size={18} />}         sublabel="active" />
        <KpiCard label="Critical"    value={kpis.critical}   icon={<AlertTriangle size={18} />} sublabel="urgent" />
        <KpiCard label="Resolved"    value={kpis.resolved}   icon={<CheckCircle2 size={18} />}  sublabel="done" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
          <input
            type="text"
            placeholder="Search by token, subject, description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm w-full sm:w-72"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TicketStatus | 'All')}
            className="pl-9 pr-8 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm appearance-none cursor-pointer"
          >
            <option value="All">All Status</option>
            {STATUS_SORT_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value as TicketUrgency | 'All')}
            className="pl-9 pr-8 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm appearance-none cursor-pointer"
          >
            <option value="All">All Urgency</option>
            {URGENCY_SORT_ORDER.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as TicketCategory | 'All')}
            className="pl-9 pr-8 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm appearance-none cursor-pointer"
          >
            <option value="All">All Categories</option>
            {CATEGORY_CONFIG.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        {seesAll && (
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-sm">
            <button
              onClick={() => setScopeFilter('all')}
              className={`px-3 py-2 ${scopeFilter === 'all' ? 'bg-surface-hover text-text' : 'bg-surface text-text-muted hover:text-text'}`}
            >
              All
            </button>
            <button
              onClick={() => setScopeFilter('mine')}
              className={`px-3 py-2 border-l border-border ${scopeFilter === 'mine' ? 'bg-surface-hover text-text' : 'bg-surface text-text-muted hover:text-text'}`}
            >
              Mine
            </button>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {!isLoading && visibleTickets.length === 0 && (
        <EmptyState
          icon={TicketIcon}
          title="No tickets yet"
          description="Helpdesk tickets you submit or are assigned to will appear here."
        />
      )}

      {!isLoading && visibleTickets.length > 0 && filteredTickets.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-2">
          <Search size={48} className="text-text-muted" />
          <p className="text-text-muted">No tickets match your filters.</p>
          <button onClick={clearFilters} className="text-sm text-[#c96442] hover:underline inline-flex items-center gap-1">
            <RotateCcw size={12} /> Clear all filters
          </button>
        </div>
      )}

      {!isLoading && filteredTickets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTickets.map((t) => {
            const urgency = URGENCY_COLORS[t.urgency];
            const submitterName = staffById.get(t.submitted_by) ?? t.submitted_by;
            const assigneeName = t.assigned_to ? (staffById.get(t.assigned_to) ?? t.assigned_to) : 'Unassigned';
            return (
              <button
                key={t.id}
                onClick={() => navigate(`/helpdesk/${t.id}`)}
                className="text-left"
              >
                <Card className="h-full hover:shadow-[0px_0px_0px_1px_#c96442] transition-shadow">
                  <div className="flex flex-col h-full gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-mono text-text-muted">{t.token}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${urgency.bg} ${urgency.text}`}>
                        {urgency.label}
                      </span>
                    </div>
                    <h3 className="text-base font-[500] text-text font-serif leading-snug line-clamp-2">{t.subject}</h3>
                    <p className="text-sm text-text-muted line-clamp-2 flex-1">{t.description}</p>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border text-xs">
                      <Badge variant={STATUS_VARIANT[t.status]}>{t.status}</Badge>
                      <span className="text-text-muted truncate">
                        {CATEGORY_CONFIG.find((c) => c.value === t.category)?.label ?? t.category}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
                      <span className="truncate">From: {submitterName}</span>
                      <span className="truncate">→ {assigneeName}</span>
                    </div>
                    <span className="text-[10px] text-text-muted">
                      {new Date(t.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {!isLoading && filteredTickets.length > 0 && (
        <div className="text-xs text-text-muted px-1">
          Showing {filteredTickets.length} of {visibleTickets.length} ticket{visibleTickets.length === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}
