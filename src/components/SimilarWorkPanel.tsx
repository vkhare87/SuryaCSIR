import { useMemo, useState } from 'react';
import { SearchCheck, ExternalLink } from 'lucide-react';
import { Card } from './ui/Cards';
import { useData } from '../contexts/DataContext';
import { findSimilar } from '../lib/ask/client';
import { citationHref } from '../lib/ask/citations';
import { resolveComparables } from '../lib/ask/comparables';
import { parseCost } from '../utils/parseCost';
import type { AskCitation } from '../lib/ask/client';
import type { ComparableRef } from '../lib/ask/comparables';
import type { Project } from '../types';

interface SimilarWorkPanelProps {
  /** Topic to check — e.g. proposal title + abstract. */
  text: string;
}

function lakhs(value: number): string {
  return `₹${value.toLocaleString('en-IN')}L`;
}

export function SimilarWorkPanel({ text }: SimilarWorkPanelProps) {
  const { projects } = useData();
  const [matches, setMatches] = useState<AskCitation[] | null>(null);
  const [comparables, setComparables] = useState<Record<string, ComparableRef>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const projectsByNo = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) if (p.ProjectNo) map.set(p.ProjectNo, p);
    return map;
  }, [projects]);

  async function check() {
    setLoading(true);
    setError('');
    try {
      const found = await findSimilar(text);
      setMatches(found);
      setComparables(await resolveComparables(found.map((c) => c.document_id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Similarity check failed');
    } finally {
      setLoading(false);
    }
  }

  async function openMatch(c: AskCitation) {
    const href = await citationHref(c);
    if (href) window.open(href, '_blank', 'noopener');
  }

  function comparableLine(c: AskCitation): string | null {
    const ref = comparables[c.document_id];
    if (!ref) return null;
    if (ref.kind === 'project_report' && ref.projectNo) {
      const p = projectsByNo.get(ref.projectNo);
      if (!p) return null;
      const parts = [
        `Sanctioned ${lakhs(parseCost(p.SanctionedCost))}`,
        `utilized ${lakhs(parseCost(p.UtilizedAmount))}`,
      ];
      if (p.StartDate) parts.push(`${p.StartDate} → ${p.CompletioDate || 'ongoing'}`);
      if (p.ProjectStatus) parts.push(p.ProjectStatus);
      return parts.join(' · ');
    }
    if (ref.kind === 'proposal' && ref.proposal) {
      const pr = ref.proposal;
      const parts = [`Requested ${lakhs(pr.requestedBudget)}`];
      if (pr.proposedStartDate) parts.push(`from ${pr.proposedStartDate}`);
      if (pr.proposedDurationMonths) parts.push(`${pr.proposedDurationMonths} months`);
      if (pr.status) parts.push(pr.status);
      return parts.join(' · ');
    }
    return null;
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
          <SearchCheck className="h-4 w-4 text-text-muted" /> Prior &amp; Ongoing Similar Work
        </h3>
        <button
          onClick={() => void check()}
          disabled={loading || !text.trim()}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-text hover:bg-surface-hover disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Check for similar work'}
        </button>
      </div>
      {error && <div className="text-sm text-danger">{error}</div>}
      {matches !== null && matches.length === 0 && (
        <p className="text-sm text-text-muted">No similar prior work found in indexed documents.</p>
      )}
      {matches !== null && matches.length > 0 && (
        <ul className="space-y-2">
          {matches.map((c, i) => {
            const facts = comparableLine(c);
            return (
              <li key={`${c.document_id}-${i}`} className="text-sm text-text-muted">
                <button
                  onClick={() => void openMatch(c)}
                  className="inline-flex items-center gap-1 text-left hover:text-text underline decoration-dotted"
                >
                  {c.title} — {c.node_title} (p.{c.page_start}
                  {c.page_end !== c.page_start ? `–${c.page_end}` : ''})
                  <ExternalLink className="h-3 w-3" />
                </button>
                {facts && <div className="mt-0.5 text-xs text-text-muted">{facts}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
