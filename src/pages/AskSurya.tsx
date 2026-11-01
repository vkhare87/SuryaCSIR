import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, Send, ThumbsUp, ThumbsDown, FileText, CalendarClock } from 'lucide-react';
import { Card, Badge } from '../components/ui/Cards';
import { Sheet } from '../components/ui/Sheet';
import { useAuth } from '../contexts/AuthContext';
import { askSuryaStream, sendFeedback, scheduleBrief } from '../lib/ask/client';
import type { AskAnswer } from '../lib/ask/client';
import { citationHref } from '../lib/ask/citations';
import { friendlyError } from '../lib/errors';

const HISTORY_TURNS = 3;

interface Turn {
  question: string;
  answer: AskAnswer;
  rated: boolean;
  scheduled?: boolean;
}

/** The cited source, shown beside the conversation rather than replacing it.
 * `url` already carries the page anchor (#page=N) from citationHref(). */
interface SourceView {
  url: string;
  label: string;
}

export default function AskSurya() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [question, setQuestion] = useState(() => searchParams.get('q') ?? '');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState('');
  const [source, setSource] = useState<SourceView | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setStreamText('');
    try {
      const history = turns
        .slice(-HISTORY_TURNS)
        .map((t) => ({ question: t.question, answer: t.answer.answer }));
      const answer = await askSuryaStream(q, history, (chunk) =>
        setStreamText((prev) => prev + chunk));
      setTurns((prev) => [...prev, { question: q, answer, rated: false }]);
      setQuestion('');
    } catch (err) {
      setError(friendlyError(err, 'Query failed'));
    } finally {
      setLoading(false);
      setStreamText('');
    }
  }

  // Opens beside the conversation instead of a new tab: a new tab drops the asker out
  // of the session they were mid-question in, and the tab is also silently blocked
  // whenever the click's user-activation has already been spent on the surrounding
  // await (getSession(), the signed-URL round trip) by the time window.open() runs.
  async function openSource(c: AskAnswer['citations'][number]) {
    const label = `${c.title} — ${c.node_title}`;
    setSourceLoading(true);
    setSource({ url: '', label });
    const url = await citationHref(c);
    if (!url) {
      setError('Source document is unavailable.');
      setSource(null);
    } else {
      setSource({ url, label });
    }
    setSourceLoading(false);
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

  async function schedule(index: number) {
    const turn = turns[index];
    if (!user || !turn || turn.scheduled) return;
    try {
      await scheduleBrief(user.id, turn.question);
      setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, scheduled: true } : t)));
    } catch (err) {
      setError(friendlyError(err, 'Could not save the brief'));
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

      {/* Busy while streaming, so a screen reader announces the finished answer once, not every chunk. */}
      <div aria-live="polite" aria-busy={loading} className="space-y-6">
      {turns.map((turn, index) => (
        <Card key={index} className="p-5 space-y-4">
          <p className="text-sm font-medium text-text">{turn.question}</p>
          <div className="flex items-center justify-between">
            <Badge variant={turn.answer.mode === 'structured' ? 'info' : turn.answer.mode === 'hybrid' ? 'warning' : 'success'}>
              {turn.answer.mode}
            </Badge>
            <div className="flex items-center gap-3 text-text-muted">
              {turn.scheduled ? (
                <span className="text-xs">Weekly brief saved</span>
              ) : (
                <button onClick={() => void schedule(index)} className="inline-flex items-center gap-1 text-xs hover:text-text">
                  <CalendarClock className="h-4 w-4" /> Send me this weekly
                </button>
              )}
            {turn.answer.queryId && (
              <div className="flex items-center gap-2">
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
                        <FileText className="h-3 w-3" />
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
      </div>

      {loading && streamText && (
        <Card className="p-5">
          <p className="text-sm leading-relaxed text-text whitespace-pre-wrap">{streamText}</p>
        </Card>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          aria-label="Ask SURYA a question"
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

      {error && <div role="alert" className="text-sm text-danger">{error}</div>}

      <Sheet isOpen={source !== null} onClose={() => setSource(null)} title={source?.label}>
        {sourceLoading || !source?.url ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            Loading source…
          </div>
        ) : (
          // citationHref() already anchors the URL to the cited page (#page=N);
          // appending it again here breaks the anchor for the second #-fragment.
          <iframe
            key={source.url}
            src={source.url}
            title={source.label}
            className="h-full w-full rounded-md border border-border"
          />
        )}
      </Sheet>
    </div>
  );
}
