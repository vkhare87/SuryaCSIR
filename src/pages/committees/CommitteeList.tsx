import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card, Badge } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import {
  Building2,
  Search,
  Filter,
  Users,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
} from 'lucide-react';
import { canCreateCommittee } from '../../lib/committees/permissions';

export default function CommitteeList() {
  const { committees, meetings, actionItems, isLoading } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // --- Derived State ---

  const filteredCommittees = useMemo(() => {
    return committees.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === 'All' || c.committee_type === typeFilter;
      const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [committees, searchTerm, typeFilter, statusFilter]);

  const kpis = useMemo(() => ({
    total: committees.length,
    active: committees.filter(c => c.status === 'Active').length,
    inactive: committees.filter(c => c.status === 'Inactive').length,
    meetings: meetings.length,
    pendingActions: actionItems.filter(a => a.status === 'Pending').length,
  }), [committees, meetings, actionItems]);

  const showCreate = user && canCreateCommittee(user);

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Committees</h1>
          <p className="text-text-muted mt-1">Institute governance committees and meeting management</p>
        </div>
        {showCreate && (
          <Button variant="primary" onClick={() => navigate('/committees/new')}>
            <Plus size={16} className="mr-1.5" />
            Create Committee
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Total"        value={kpis.total}        icon={<Building2 size={18} />}   sublabel="committees" />
        <KpiCard label="Active"       value={kpis.active}       icon={<CheckCircle2 size={18} />} sublabel="active" />
        <KpiCard label="Inactive"     value={kpis.inactive}     icon={<AlertTriangle size={18} />} sublabel="inactive" />
        <KpiCard label="Meetings"     value={kpis.meetings}     icon={<Calendar size={18} />}    sublabel="total sessions" />
        <KpiCard label="Pending"      value={kpis.pendingActions} icon={<Clock size={18} />}      sublabel="action items" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
          <input
            type="text"
            placeholder="Search committees..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm w-full sm:w-64"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="pl-9 pr-8 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm appearance-none cursor-pointer"
          >
            <option value="All">All Types</option>
            <option value="Standing">Standing</option>
            <option value="AdHoc">Ad Hoc</option>
            <option value="Review">Review</option>
            <option value="Advisory">Advisory</option>
          </select>
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="pl-9 pr-8 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm appearance-none cursor-pointer"
          >
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && committees.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
          <Building2 size={48} className="text-text-muted" />
          <p className="text-text-muted">No committees configured yet.</p>
          {showCreate && (
            <Button variant="primary" onClick={() => navigate('/committees/new')}>
              <Plus size={16} className="mr-1.5" />
              Create Committee
            </Button>
          )}
        </div>
      )}

      {/* Empty Filtered State */}
      {!isLoading && committees.length > 0 && filteredCommittees.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-2">
          <Search size={48} className="text-text-muted" />
          <p className="text-text-muted">No committees match your filters.</p>
          <button
            onClick={() => { setSearchTerm(''); setTypeFilter('All'); setStatusFilter('All'); }}
            className="text-sm text-[#c96442] hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Card Grid */}
      {!isLoading && filteredCommittees.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCommittees.map(c => (
            <button
              key={c.id}
              onClick={() => navigate(`/committees/${c.id}`)}
              className="text-left"
            >
              <Card className="h-full hover:shadow-[0px_0px_0px_1px_#c96442] transition-shadow">
                <div className="flex flex-col h-full gap-3">
                  {/* Top row: name + type badge */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-[500] text-text font-serif leading-snug">{c.name}</h3>
                    <Badge variant={c.committee_type === 'Standing' ? 'info' : 'neutral'}>
                      {c.committee_type === 'AdHoc' ? 'Ad Hoc' : c.committee_type}
                    </Badge>
                  </div>

                  {/* Mandate */}
                  <p className="text-sm text-text-muted line-clamp-2 flex-1">{c.mandate}</p>

                  {/* Bottom row: status + formed date */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                    <Badge variant={c.status === 'Active' ? 'success' : 'warning'}>
                      {c.status === 'Active' && <CheckCircle2 size={11} className="inline mr-1" />}
                      {c.status === 'Inactive' && <AlertTriangle size={11} className="inline mr-1" />}
                      {c.status}
                    </Badge>
                    <span className="text-xs text-text-muted">
                      Formed: {c.formed_date ? new Date(c.formed_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                    </span>
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      {!isLoading && filteredCommittees.length > 0 && (
        <div className="text-xs text-text-muted flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Users size={14} />
            Institute Committee Management System
          </div>
          <span>{filteredCommittees.length} of {committees.length} committees</span>
        </div>
      )}
    </div>
  );
}
