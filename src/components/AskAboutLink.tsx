import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { askAboutHref, type AskEntity } from '../lib/ask/client';

// EI3: open Ask SURYA with this record as the context of the question.
export function AskAboutLink({ entity }: { entity: AskEntity }) {
  return (
    <Link to={askAboutHref(entity)}
      className="inline-flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-text hover:bg-surface-hover transition-colors">
      <Sparkles size={14} className="text-terracotta" /> Ask about this
    </Link>
  );
}
