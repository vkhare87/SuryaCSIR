import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, Send, ThumbsUp, ThumbsDown, FileText, CalendarClock, Bookmark, BookmarkCheck } from 'lucide-react';
import { Card, Badge } from '../components/ui/Cards';
import { Sheet } from '../components/ui/Sheet';
import { OfflineServiceBanner } from '../components/ui/OfflineServiceBanner';
import { useAuth } from '../contexts/AuthContext';
import {
  askSuryaStream, parseAskEntity, sendFeedback, scheduleBrief, fetchAskHistory, setQuestionPinned, SAVED_LIMIT,
} from '../lib/ask/client';
import type { AskAnswer, AskHistory, AskHistoryItem } from '../lib/ask/client';
import { citationHref } from '../lib/ask/citations';
import { extractChartData } from '../lib/ask/stage7';
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
  const entity = useMemo(() => parseAskEntity(searchParams.get('entity')), [searchParams]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState('');
  const [source, setSource] = useState<SourceView | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [history, setHistory] = useState<AskHistory>({ recent: [], frequent: [], saved: [] });

  const userId = user?.id;
  const loadHistory = useCallback(async () => {
    if (!userId) return;
    try {
      setHistory(await fetchAskHistory(userId));
    } catch (err) {
      console.error('Ask history failed', err);
    }
  }, [userId]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  async function togglePin(item: AskHistoryItem) {
    try {
      await setQuestionPinned(item.id, !item.pinned);
      await loadHistory();
    } catch (err) {
      setError(friendlyError(err, 'Could not save the question'));
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void ask(question, true);
  }

  // fromForm: only a question typed in the box clears the box. A click on a
  // history question must not wipe a half-typed draft.
  async function ask(text: string, fromForm = false) {
    const q = text.trim();
    if (!q || loading) return;
    setLoading(true);
    setError('');
    setStreamText('');
    try {
      const recentTurns = turns
        .slice(-HISTORY_TURNS)
        .map((t) => ({ question: t.question, answer: t.answer.answer }));
      const answer = await askSuryaStream(q, recentTurns, (chunk) =>
        setStreamText((prev) => prev + chunk), entity);
      setTurns((prev) => [...prev, { question: q, answer, rated: false }]);
      if (fromForm) setQuestion('');
    } catch (err) {
      setError(friendlyError(err, 'Query failed'));
    } finally {
      setLoading(false);
      setStreamText('');
      void loadHistory();
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
        <p className="text-xs text-text-muted">Out-of-scope requests are recorded.</p>
      </div>

      <AskHistoryPanel history={history} disabled={loading} onAsk={(q) => void ask(q)} onTogglePin={(i) => void togglePin(i)} />

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

          {(() => {
            const pts = extractChartData(turn.answer.answer);
            if (pts.length === 0) return null;
            const maxVal = Math.max(...pts.map((p) => p.value), 1);
            return (
              <div className="rounded-lg border border-border bg-background p-3 space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Structured Breakdown</p>
                {pts.map((pt) => (
                  <div key={pt.label} className="flex items-center gap-2 text-xs">
                    <span className="w-28 truncate text-text-muted">{pt.label}</span>
                    <div className="flex-1 h-2 rounded bg-surface overflow-hidden">
                      <div className="h-full bg-terracotta" style={{ width: `${Math.round((pt.value / maxVal) * 100)}%` }} />
                    </div>
                    <span className="font-mono tabular-nums text-text">{pt.value}</span>
                  </div>
                ))}
              </div>
            );
          })()}

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

      <OfflineServiceBanner />

      {entity && (
        <p className="text-xs text-text-muted">
          Asking about {entity.type} <span className="font-mono text-text">{entity.id}</span>. Answers use its records and documents first.
        </p>
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

const HISTORY_LISTS: { key: keyof AskHistory; title: string }[] = [
  { key: 'saved', title: 'Saved' },
  { key: 'recent', title: 'Recent' },
  { key: 'frequent', title: 'Most used' },
];

function AskHistoryPanel({ history, disabled, onAsk, onTogglePin }: {
  history: AskHistory;
  disabled: boolean;
  onAsk: (question: string) => void;
  onTogglePin: (item: AskHistoryItem) => void;
}) {
  const lists = HISTORY_LISTS.filter((l) => history[l.key].length > 0);
  if (lists.length === 0) return null;
  const savedFull = history.saved.length >= SAVED_LIMIT;
  return (
    <Card className="p-4 grid gap-4 sm:grid-cols-3">
      {lists.map((l) => (
        <div key={l.key} className="space-y-1 min-w-0">
          <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">{l.title}</h2>
          <ul className="space-y-1">
            {history[l.key].map((item) => (
              <li key={`${l.key}-${item.id}`} className="flex items-start gap-1">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onAsk(item.question)}
                  className="flex-1 min-w-0 truncate text-left text-sm text-text hover:underline disabled:opacity-50"
                  title={item.question}
                >
                  {item.question}
                </button>
                <button
                  type="button"
                  disabled={!item.pinned && savedFull}
                  onClick={() => onTogglePin(item)}
                  aria-label={item.pinned ? `Remove saved question: ${item.question}` : `Save question: ${item.question}`}
                  aria-pressed={item.pinned}
                  title={!item.pinned && savedFull ? `You can save up to ${SAVED_LIMIT} questions` : undefined}
                  className="shrink-0 text-text-muted hover:text-text disabled:opacity-40"
                >
                  {item.pinned ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}
