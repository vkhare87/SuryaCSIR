import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { askAboutHref, type AskEntity } from '../lib/ask/client';
import { useCopilot } from '../contexts/CopilotContext';

// EI3: open Ask SURYA with this record as the context of the question.
// Opens the ambient slide-over drawer in place; Cmd/Ctrl-click follows the link.
export function AskAboutLink({ entity }: { entity: AskEntity }) {
  const copilot = useCopilot();

  return (
    <Link
      to={askAboutHref(entity)}
      onClick={(e) => {
        if (copilot && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          copilot.openCopilot({ entity });
        }
      }}
      className="inline-flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-text hover:border-terracotta/50 hover:bg-surface-hover transition-all"
    >
      <Sparkles size={14} className="text-terracotta" /> Ask about this
    </Link>
  );
}
