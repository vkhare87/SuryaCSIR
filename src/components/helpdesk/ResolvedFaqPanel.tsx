import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { matchResolvedFaqs } from '../../lib/ask/stage7';
import { Card } from '../ui/Cards';

export function ResolvedFaqPanel({ query }: { query: string }) {
  const { tickets } = useData();
  const matches = useMemo(() => matchResolvedFaqs(tickets, query, 4), [tickets, query]);

  if (matches.length === 0) return null;

  return (
    <Card className="p-4 space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
        <HelpCircle size={13} /> Resolved Helpdesk FAQs
      </h2>
      <ul className="divide-y divide-border text-xs">
        {matches.map((t) => (
          <li key={t.id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-text truncate">{t.subject}</p>
              <p className="text-text-muted truncate">{t.description}</p>
            </div>
            <Link to={`/helpdesk/${t.id}`} className="text-terracotta hover:underline shrink-0">
              View
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
