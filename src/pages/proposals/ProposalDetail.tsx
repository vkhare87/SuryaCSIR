import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useProposals } from '../../contexts/ProposalsContext';
import { Card, Badge } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { getDownloadUrl } from '../../lib/proposals/storage';
import {
  STATUS_LABELS, STATUS_BADGE_VARIANT, TERMINAL_STATUSES,
} from '../../lib/proposals/constants';
import { canEditProposal, canUpdateStatus, nextAllowedTransitions } from '../../lib/proposals/permissions';
import StatusUpdateModal from '../../components/proposals/StatusUpdateModal';
import { SimilarWorkPanel } from '../../components/SimilarWorkPanel';
import { findComparables } from '../../lib/proposals/comparables';
import { piTrackRecord } from '../../lib/proposals/trackRecord';
import type { Proposal } from '../../types/proposal';

export default function ProposalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getProposal } = useProposals();
  const { projects } = useData();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false);

  const comparables = useMemo(
    () => proposal
      ? findComparables(projects, {
          domainTheme: `${proposal.title} ${proposal.domainTheme}`,
          divisionCode: proposal.divisionCode,
          fundType: proposal.fundType,
        })
      : [],
    [projects, proposal],
  );

  const trackRecord = useMemo(
    () => (proposal ? piTrackRecord(projects, proposal.piName) : null),
    [projects, proposal],
  );

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      setProposal(await getProposal(id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, getProposal]);

  useEffect(() => { reload(); }, [reload]);

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!proposal) return <div className="p-6 text-text-muted">Loading…</div>;

  const editable = user ? canEditProposal(user, proposal) : false;
  const adminMayUpdate = user ? canUpdateStatus(user) : false;
  const transitions = nextAllowedTransitions(proposal.status);
  const showAdminPanel = adminMayUpdate && !TERMINAL_STATUSES.includes(proposal.status);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-text-muted">{proposal.proposalCode}</p>
          <h1 className="text-2xl font-semibold text-text">{proposal.title}</h1>
          {proposal.acronym && <p className="text-text-muted text-sm">({proposal.acronym})</p>}
          <div className="mt-2">
            <Badge variant={STATUS_BADGE_VARIANT[proposal.status]}>
              {STATUS_LABELS[proposal.status]}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {editable && (
            <Button variant="secondary" onClick={() => navigate(`/proposals/${proposal.id}/edit`)}>
              Edit
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-medium text-text mb-3">Summary</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row label="PI" value={proposal.piName} />
          <Row label="Division" value={proposal.divisionCode} />
          <Row label="Fund Type" value={proposal.fundType} />
          <Row label="Sponsor" value={`${proposal.sponsorType} — ${proposal.sponsorName}`} />
          <Row label="Category" value={proposal.projectCategory} />
          <Row label="Domain" value={proposal.domainTheme} />
          <Row label="Start Date" value={proposal.proposedStartDate} />
          <Row label="Duration" value={`${proposal.proposedDurationMonths} months`} />
          <Row label="Requested Budget" value={`₹${proposal.requestedBudget.toLocaleString('en-IN')}`} />
          <Row label="TRL" value={`${proposal.currentTrl ?? '-'} → ${proposal.targetTrl ?? '-'}`} />
        </dl>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-medium text-text">Technical</h2>
        <Block label="Abstract"          text={proposal.abstract} />
        <Block label="Problem Statement" text={proposal.problemStatement} />
        <Block label="Objectives"        text={proposal.objectives} />
        <Block label="Expected Outcomes" text={proposal.expectedOutcomes} />
      </Card>

      <SimilarWorkPanel text={`${proposal.title}. ${proposal.abstract}`} />

      <Card className="p-5 space-y-3">
        <h3 className="text-sm font-semibold text-text">Comparable Past Projects</h3>
        {comparables.length === 0 ? (
          <p className="text-sm text-text-muted">No comparable past projects found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="py-1 pr-2">Project</th>
                <th className="py-1 pr-2">Sanctioned</th>
                <th className="py-1 pr-2">Utilized</th>
                <th className="py-1 pr-2">Start</th>
                <th className="py-1 pr-2">Completion</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {comparables.map(p => (
                <tr key={p.ProjectNo} className="border-t border-border text-text">
                  <td className="py-1.5 pr-2">{p.ProjectName}</td>
                  <td className="py-1.5 pr-2">{p.SanctionedCost}</td>
                  <td className="py-1.5 pr-2">{p.UtilizedAmount}</td>
                  <td className="py-1.5 pr-2">{p.StartDate}</td>
                  <td className="py-1.5 pr-2">{p.CompletioDate}</td>
                  <td className="py-1.5">{p.ProjectStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {trackRecord && (
        <Card className="p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-text">PI Track Record</h3>
            <p className="text-xs text-text-muted">
              Past projects led by {proposal.piName} — facts for context, not a score.
              {' '}{trackRecord.rows.length} project(s), {trackRecord.completedCount} completed,
              {' '}{trackRecord.extendedCount} extended.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="py-1 pr-2">Project</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 pr-2">Budget used</th>
                <th className="py-1">Extended</th>
              </tr>
            </thead>
            <tbody>
              {trackRecord.rows.map(r => (
                <tr key={r.project.ProjectNo} className="border-t border-border text-text">
                  <td className="py-1.5 pr-2">{r.project.ProjectName}</td>
                  <td className="py-1.5 pr-2">{r.project.ProjectStatus}</td>
                  <td className="py-1.5 pr-2">
                    {r.utilizationPct != null ? `${r.utilizationPct.toFixed(0)}%` : 'no data'}
                  </td>
                  <td className="py-1.5">{r.extended ? r.project.Extension : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {proposal.coPIs && proposal.coPIs.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-medium text-text mb-3">Co-PIs</h2>
          <ul className="text-sm space-y-1">
            {proposal.coPIs.map((c) => <li key={c.staffId}>{c.staffName}</li>)}
          </ul>
        </Card>
      )}

      <Card className="p-4">
        <h2 className="text-sm font-medium text-text mb-3">Documents</h2>
        <ul className="text-sm space-y-1">
          {(proposal.documents ?? []).map((d) => (
            <li key={d.id} className="flex items-center justify-between">
              <span>{d.docType === 'signed_proposal' ? 'Signed Proposal' : 'OM Document'} — {d.fileName}</span>
              <button
                className="text-brand-blue underline"
                onClick={async () => {
                  const url = await getDownloadUrl(d.storagePath);
                  if (url) window.open(url, '_blank');
                }}
              >Download</button>
            </li>
          ))}
          {(!proposal.documents || proposal.documents.length === 0) && (
            <li className="text-text-muted">No documents uploaded.</li>
          )}
        </ul>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-medium text-text mb-3">Status History</h2>
        <ol className="text-sm space-y-2">
          {(proposal.history ?? []).map((h) => (
            <li key={h.id} className="flex items-start gap-3">
              <Badge variant={STATUS_BADGE_VARIANT[h.toStatus]}>{STATUS_LABELS[h.toStatus]}</Badge>
              <div>
                <p className="text-text-muted">{new Date(h.changedAt).toLocaleString('en-IN')}</p>
                {h.payload && Object.keys(h.payload).length > 0 && (
                  <pre className="text-xs text-text-muted whitespace-pre-wrap">
                    {JSON.stringify(h.payload, null, 2)}
                  </pre>
                )}
              </div>
            </li>
          ))}
          {(!proposal.history || proposal.history.length === 0) && (
            <li className="text-text-muted">No status changes yet.</li>
          )}
        </ol>
      </Card>

      {showAdminPanel && (
        <Card className="p-4">
          <h2 className="text-sm font-medium text-text mb-3">Admin: Update Status</h2>
          {transitions.length === 0 ? (
            <p className="text-text-muted text-sm">No admin transitions available from this state.</p>
          ) : (
            <Button onClick={() => setShowStatusModal(true)}>Update Status</Button>
          )}
        </Card>
      )}

      {showStatusModal && (
        <StatusUpdateModal
          proposal={proposal}
          onClose={() => setShowStatusModal(false)}
          onUpdated={async () => { setShowStatusModal(false); await reload(); }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-sm text-text whitespace-pre-wrap">{text || '—'}</p>
    </div>
  );
}
