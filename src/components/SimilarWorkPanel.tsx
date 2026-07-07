import { useState } from 'react';
import { SearchCheck, ExternalLink } from 'lucide-react';
import { Card } from './ui/Cards';
import { findSimilar } from '../lib/ask/client';
import { citationHref } from '../lib/ask/citations';
import type { AskCitation } from '../lib/ask/client';

interface SimilarWorkPanelProps {
  /** Topic to check — e.g. proposal title + abstract. */
  text: string;
}

export function SimilarWorkPanel({ text }: SimilarWorkPanelProps) {
  const [matches, setMatches] = useState<AskCitation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function check() {
    setLoading(true);
    setError('');
    try {
      setMatches(await findSimilar(text));
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
        <ul className="space-y-1">
          {matches.map((c, i) => (
            <li key={`${c.document_id}-${i}`} className="text-sm text-text-muted">
              <button
                onClick={() => void openMatch(c)}
                className="inline-flex items-center gap-1 text-left hover:text-text underline decoration-dotted"
              >
                {c.title} — {c.node_title} (p.{c.page_start}
                {c.page_end !== c.page_start ? `–${c.page_end}` : ''})
                <ExternalLink className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
