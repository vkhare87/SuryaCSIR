import { useState } from 'react';
import { Sparkles, Send, ThumbsUp, ThumbsDown, ExternalLink } from 'lucide-react';
import { Card, Badge } from '../components/ui/Cards';
import { askSurya, sendFeedback } from '../lib/ask/client';
import type { AskAnswer } from '../lib/ask/client';
import { citationHref } from '../lib/ask/citations';

const HISTORY_TURNS = 3;

interface Turn {
  question: string;
  answer: AskAnswer;
  rated: boolean;
}

export default function AskSurya() {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    try {
      const history = turns
        .slice(-HISTORY_TURNS)
        .map((t) => ({ question: t.question, answer: t.answer.answer }));
      const answer = await askSurya(q, history);
      setTurns((prev) => [...prev, { question: q, answer, rated: false }]);
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setLoading(false);
    }
  }

  async function openSource(c: AskAnswer['citations'][number]) {
    const href = await citationHref(c);
    if (href) window.open(href, '_blank', 'noopener');
  }

  async function rate(index: number, value: 1 | -1) {
    const turn = turns[index];
    if (!turn?.answer.queryId || turn.rated) return;
    try {
      await sendFeedback(turn.answer.queryId, value);
      setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, rated: true } : t)));
    } catch (err) {
      console.error('Feedback failed', err);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-text">
          <Sparkles className="h-6 w-6 text-text-muted" /> Ask SURYA
        </h1>
        <p className="text-sm text-text-muted">
          Ask about institute documents and data. Answers are scoped to what your role can access.
          Follow-up questions carry the conversation.
        </p>
      </div>

      {turns.map((turn, index) => (
        <Card key={index} className="p-5 space-y-4">
          <p className="text-sm font-medium text-text">{turn.question}</p>
          <div className="flex items-center justify-between">
            <Badge variant={turn.answer.mode === 'structured' ? 'info' : turn.answer.mode === 'hybrid' ? 'warning' : 'success'}>
              {turn.answer.mode}
            </Badge>
            {turn.answer.queryId && (
              <div className="flex items-center gap-2 text-text-muted">
                {turn.rated ? (
                  <span className="text-xs">Thanks for the feedback</span>
                ) : (
                  <>
                    <button aria-label="Helpful" onClick={() => void rate(index, 1)} className="hover:text-text">
                      <ThumbsUp className="h-4 w-4" />
                    </button>
                    <button aria-label="Not helpful" onClick={() => void rate(index, -1)} className="hover:text-text">
                      <ThumbsDown className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <p className="text-sm leading-relaxed text-text whitespace-pre-wrap">{turn.answer.answer}</p>

          {turn.answer.citations.length > 0 && (
            <div className="space-y-1 border-t border-border pt-3">
              <div className="text-xs font-medium uppercase tracking-wide text-text-muted">Sources</div>
              <ul className="space-y-1">
                {turn.answer.citations.map((c, i) => (
                  <li key={`${c.document_id}-${i}`} className="text-sm text-text-muted">
                    {c.storage_path ? (
                      <button
                        onClick={() => void openSource(c)}
                        className="inline-flex items-center gap-1 text-left hover:text-text underline decoration-dotted"
                      >
                        {c.title} — {c.node_title} (p.{c.page_start}
                        {c.page_end !== c.page_start ? `–${c.page_end}` : ''})
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    ) : (
                      <>
                        {c.title} — {c.node_title} (p.{c.page_start}
                        {c.page_end !== c.page_start ? `–${c.page_end}` : ''})
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ))}

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={turns.length ? 'Ask a follow-up…' : 'e.g. What outcomes did the 2025 progress reports highlight?'}
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-text hover:bg-surface-hover disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> {loading ? 'Asking…' : 'Ask'}
        </button>
      </form>

      {error && <div className="text-sm text-danger">{error}</div>}
    </div>
  );
}
