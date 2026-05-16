import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Search } from 'lucide-react';
import { useProposals } from '../../contexts/ProposalsContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card, StatCard, Badge } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { canCreateProposal } from '../../lib/proposals/permissions';
import { PROPOSAL_STATUSES, STATUS_LABELS, STATUS_BADGE_VARIANT } from '../../lib/proposals/constants';
import type { Proposal, ProposalStatus } from '../../types/proposal';

export default function Proposals() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { proposals, isLoading } = useProposals();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProposalStatus>('ALL');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return proposals.filter((p) => {
      const matchesSearch =
        p.title.toLowerCase().includes(q) ||
        (p.acronym ?? '').toLowerCase().includes(q) ||
        p.proposalCode.toLowerCase().includes(q) ||
        p.piName.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [proposals, search, statusFilter]);

  const counts = useMemo(() => {
    const myDrafts = user
      ? proposals.filter((p) => p.createdBy === user.id && p.status === 'DRAFT').length
      : 0;
    const underReview = proposals.filter((p) => p.status === 'UNDER_REVIEW').length;
    const approved    = proposals.filter((p) => p.status === 'APPROVED').length;
    const omIssued    = proposals.filter((p) => p.status === 'OM_ISSUED').length;
    return { myDrafts, underReview, approved, omIssued };
  }, [proposals, user]);

  const showCreate = user ? canCreateProposal(user) : false;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Project Proposals</h1>
          <p className="text-text-muted text-sm">Track scientist-submitted project proposals.</p>
        </div>
        {showCreate && (
          <Button onClick={() => navigate('/proposals/new')}>
            <Plus className="w-4 h-4 mr-1" /> New Proposal
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="My Drafts"    value={counts.myDrafts} />
        <StatCard title="Under Review" value={counts.underReview} />
        <StatCard title="Approved"     value={counts.approved} />
        <StatCard title="OM Issued"    value={counts.omIssued} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, acronym, code, PI"
              className="w-full pl-10 pr-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | ProposalStatus)}
            className="px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text"
          >
            <option value="ALL">All statuses</option>
            {PROPOSAL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-8 text-center text-text-muted">Loading…</Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No proposals found"
          description={proposals.length === 0
            ? 'No proposals have been created yet.'
            : 'No proposals match the current filters.'}
        />
      ) : (
        <DataTable<Proposal>
          data={filtered}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => navigate(`/proposals/${p.id}`)}
          columns={[
            { header: 'Code',    cell: (p) => p.proposalCode },
            { header: 'Title',   cell: (p) => p.title },
            { header: 'PI',      cell: (p) => p.piName },
            { header: 'Status',  cell: (p) => (
              <Badge variant={STATUS_BADGE_VARIANT[p.status]}>{STATUS_LABELS[p.status]}</Badge>
            ) },
            { header: 'Budget',  cell: (p) => `₹${p.requestedBudget.toLocaleString('en-IN')}` },
            { header: 'Created', cell: (p) => new Date(p.createdAt).toLocaleDateString('en-IN') },
          ]}
        />
      )}
    </div>
  );
}
