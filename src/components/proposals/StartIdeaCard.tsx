import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Lightbulb } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useProposals } from '../../contexts/ProposalsContext';
import { Card } from '../ui/Cards';
import { Button } from '../ui/Button';
import { canCreateProposal } from '../../lib/proposals/permissions';
import { EDITABLE_STATUSES, TERMINAL_STATUSES } from '../../lib/proposals/constants';
import { nextStep } from '../../lib/proposals/readiness';
import { friendlyError } from '../../lib/errors';

const CONTINUE_LIMIT = 5;

/** One field, one click: a title starts a private draft and opens it. */
export function StartIdeaForm({ autoFocus }: { autoFocus?: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { staff } = useData();
  const { startIdea } = useProposals();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The PI's name as the roster has it, when their staff row is linked.
  const ownName = useMemo(
    () => staff.find(s => s.user_id === user?.id)?.Name
      ?? staff.find(s => !!s.Email && s.Email.toLowerCase() === user?.email.toLowerCase())?.Name
      ?? '',
    [staff, user],
  );

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const text = title.trim();
    if (!text) return;
    setBusy(true); setError('');
    try {
      const proposal = await startIdea(text, ownName);
      navigate(`/proposals/${proposal.id}/edit`);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={start} className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          aria-label="Title of the new idea"
          autoFocus={autoFocus}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is the idea? A working title is enough."
          className="flex-1 px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-terracotta/40"
        />
        <Button type="submit" isLoading={busy} disabled={!title.trim()}>New idea</Button>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </form>
  );
}

/** Home-page card for every research role: start an idea, or pick one up where it was left. */
export function StartIdeaCard() {
  const { user } = useAuth();
  const { proposals } = useProposals();

  const mine = useMemo(
    () => proposals
      .filter(p => p.createdBy === user?.id && !TERMINAL_STATUSES.includes(p.status))
      .slice(0, CONTINUE_LIMIT),
    [proposals, user],
  );

  if (!user || !canCreateProposal(user)) return null;

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Lightbulb size={16} className="text-terracotta" />
        <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">Project ideas</h2>
      </div>
      <StartIdeaForm />
      <p className="text-xs text-text-muted">
        It starts as a private draft. Only you and co-PIs you name can see it until you submit.
      </p>

      {mine.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Continue</h3>
          <ul className="divide-y divide-border">
            {mine.map(p => (
              <li key={p.id}>
                <Link
                  to={EDITABLE_STATUSES.includes(p.status) ? `/proposals/${p.id}/edit` : `/proposals/${p.id}`}
                  className="flex items-center gap-3 py-2 -mx-2 px-2 rounded hover:bg-surface-hover transition-colors"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-text truncate">{p.title}</span>
                    <span className="block text-xs text-text-muted">{nextStep(p)}</span>
                  </span>
                  <ChevronRight size={14} className="text-text-muted shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
