import { useState, type ReactNode } from 'react';
import { Card } from '../ui/Cards';
import { Button } from '../ui/Button';
import {
  setUnderReview, requestRevision, rejectProposal, recommendProposal,
  approveProposal, issueOM, archiveProposal, linkProject,
} from '../../lib/proposals/api';
import { uploadProposalDoc } from '../../lib/proposals/storage';
import { nextAllowedTransitions } from '../../lib/proposals/permissions';
import { STATUS_LABELS } from '../../lib/proposals/constants';
import { useData } from '../../contexts/DataContext';
import type { Proposal, ProposalStatus } from '../../types/proposal';

interface Props {
  proposal: Proposal;
  onClose: () => void;
  onUpdated: () => void | Promise<void>;
}

const inputCls = 'w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text';

export default function StatusUpdateModal({ proposal, onClose, onUpdated }: Props) {
  const { projects } = useData();
  const transitions = nextAllowedTransitions(proposal.status);
  const [target, setTarget] = useState<ProposalStatus | ''>(transitions[0] ?? '');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const [reviewBody, setReviewBody] = useState('');
  const [reviewSent, setReviewSent] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(0);
  const [sanctionDate, setSanctionDate] = useState('');
  const [omNumber, setOmNumber] = useState('');
  const [omDate, setOmDate] = useState('');
  const [omFile, setOmFile] = useState<File | null>(null);
  const [projectNo, setProjectNo] = useState('');

  const handleApply = async () => {
    if (!target) return;
    setError('');
    setWorking(true);
    try {
      switch (target) {
        case 'UNDER_REVIEW': {
          const r = await setUnderReview(proposal.id, reviewBody, reviewSent);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        case 'REVISION_REQUESTED': {
          const r = await requestRevision(proposal.id, notes);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        case 'REJECTED': {
          const r = await rejectProposal(proposal.id, reason);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        case 'RECOMMENDED': {
          const r = await recommendProposal(proposal.id);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        case 'APPROVED': {
          const r = await approveProposal(proposal.id, amount, sanctionDate);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        case 'OM_ISSUED': {
          if (!omFile) throw new Error('OM document file is required');
          const up = await uploadProposalDoc(proposal.id, 'om_document', omFile);
          if (!up.ok) throw new Error(up.error);
          const r = await issueOM(proposal.id, omNumber, omDate, up.document.id);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        case 'ARCHIVED': {
          const r = await archiveProposal(proposal.id);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        case 'LINKED': {
          const r = await linkProject(proposal.id, projectNo);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        default:
          throw new Error('Unsupported transition');
      }
      await onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg p-6 space-y-4 bg-surface">
        <h2 className="text-lg font-semibold text-text">Update Status</h2>

        <div>
          <label className="block text-xs text-text-muted mb-1">Next Status</label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as ProposalStatus)}
            className={inputCls}
          >
            {transitions.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {target === 'UNDER_REVIEW' && (
          <>
            <Labeled label="Reviewing Body">
              <input className={inputCls} value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)} />
            </Labeled>
            <Labeled label="Date Sent">
              <input type="date" className={inputCls} value={reviewSent}
                onChange={(e) => setReviewSent(e.target.value)} />
            </Labeled>
          </>
        )}
        {target === 'REVISION_REQUESTED' && (
          <Labeled label="Revision Notes">
            <textarea rows={4} className={inputCls} value={notes}
              onChange={(e) => setNotes(e.target.value)} />
          </Labeled>
        )}
        {target === 'REJECTED' && (
          <Labeled label="Rejection Reason">
            <textarea rows={4} className={inputCls} value={reason}
              onChange={(e) => setReason(e.target.value)} />
          </Labeled>
        )}
        {target === 'APPROVED' && (
          <>
            <Labeled label="Sanctioned Amount (₹)">
              <input type="number" min={0} className={inputCls} value={amount}
                onChange={(e) => setAmount(Number(e.target.value))} />
            </Labeled>
            <Labeled label="Sanction Date">
              <input type="date" className={inputCls} value={sanctionDate}
                onChange={(e) => setSanctionDate(e.target.value)} />
            </Labeled>
          </>
        )}
        {target === 'OM_ISSUED' && (
          <>
            <Labeled label="OM Number">
              <input className={inputCls} value={omNumber}
                onChange={(e) => setOmNumber(e.target.value)} />
            </Labeled>
            <Labeled label="OM Date">
              <input type="date" className={inputCls} value={omDate}
                onChange={(e) => setOmDate(e.target.value)} />
            </Labeled>
            <Labeled label="OM PDF">
              <input type="file" accept="application/pdf"
                onChange={(e) => setOmFile(e.target.files?.[0] ?? null)} />
            </Labeled>
          </>
        )}
        {target === 'LINKED' && (
          <Labeled label="Link to ProjectNo">
            <select className={inputCls} value={projectNo}
              onChange={(e) => setProjectNo(e.target.value)}>
              <option value="">Select…</option>
              {projects.map((p) => (
                <option key={p.ProjectNo} value={p.ProjectNo}>
                  {p.ProjectNo} — {p.ProjectName}
                </option>
              ))}
            </select>
          </Labeled>
        )}

        {error && (
          <div className="text-sm text-red-600">{error}</div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={working}>Cancel</Button>
          <Button onClick={handleApply} isLoading={working} disabled={!target}>Apply</Button>
        </div>
      </Card>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}
