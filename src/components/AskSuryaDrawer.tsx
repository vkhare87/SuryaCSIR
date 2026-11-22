import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sparkles, Send, ExternalLink, FileText, ThumbsUp, ThumbsDown, X } from 'lucide-react';
import { Sheet } from './ui/Sheet';
import { Badge, Card } from './ui/Cards';
import { inferRouteEntity, useCopilot } from '../contexts/CopilotContext';
import {
  askAboutHref, askSuryaStream, sendFeedback,
  type AskAnswer, type AskEntity, type AskEntityType,
} from '../lib/ask/client';
import { citationHref } from '../lib/ask/citations';
import { friendlyError } from '../lib/errors';

interface DrawerTurn {
  question: string;
  answer: AskAnswer;
  rated: boolean;
}

const STARTER_PROMPTS: Record<AskEntityType | 'global', string[]> = {
  project: [
    'Summarize recent progress reports and milestones for this project',
    'What funds or utilization notes are recorded for this project?',
    'Which CSIR guidelines apply to project closure or extensions?',
  ],
  staff: [
    'Summarize recent publications and active projects for this researcher',
    'Which committees or supervision responsibilities are linked here?',
    'What CSIR appraisal criteria apply to this designation?',
  ],
  division: [
    'Summarize key projects and outputs across this division',
    'Highlight current staffing and PhD supervision load',
    'What recent progress reports mention this division?',
  ],
  instrument: [
    'Summarize maintenance history and usage logs for this instrument',
    'Which projects or divisions rely on this facility?',
    'What SOPs or calibration notes are indexed for this instrument?',
  ],
  global: [
    'What outcomes did recent progress reports highlight?',
    'Summarize active CSIR rules for PMS evaluation',
    'Which divisions have the highest publication output this year?',
  ],
};

/**
 * Lazy-loaded ambient AI Copilot drawer ("Ask SURYA Anywhere").
 * Reuses existing streaming RAG client and scopes automatically to the active page.
 */
export default function AskSuryaDrawer() {
  const copilot = useCopilot();
  const { pathname, search } = useLocation();
  const [turns, setTurns] = useState<DrawerTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState('');
  const [clearedScope, setClearedScope] = useState(false);

  const inferred = useMemo(() => inferRouteEntity(pathname, search), [pathname, search]);
  const activeEntity: AskEntity | null = useMemo(() => {
    if (clearedScope) return null;
    if (!copilot) return inferred;
    if (copilot.entityOverride !== undefined) return copilot.entityOverride;
    return inferred;
  }, [clearedScope, copilot, inferred]);

  useEffect(() => {
    if (!copilot?.isOpen) return;
    setClearedScope(false);
    if (copilot.initialQuestion) setQuestion(copilot.initialQuestion);
  }, [copilot?.isOpen, copilot?.initialQuestion, pathname]);

  if (!copilot) return null;

  const starters = STARTER_PROMPTS[activeEntity?.type ?? 'global'];
  const fullHref = activeEntity
    ? `${askAboutHref(activeEntity)}${question.trim() ? `&q=${encodeURIComponent(question.trim())}` : ''}`
    : `/ask${question.trim() ? `?q=${encodeURIComponent(question.trim())}` : ''}`;

  async function runQuery(raw: string) {
    const q = raw.trim();
    if (!q || loading) return;
    setLoading(true);
    setError('');
    setStreamText('');
    try {
      const history = turns.slice(-3).map(t => ({ question: t.question, answer: t.answer.answer }));
      const answer = await askSuryaStream(q, history, chunk => setStreamText(prev => prev + chunk), activeEntity);
      setTurns(prev => [...prev, { question: q, answer, rated: false }]);
      setQuestion('');
    } catch (err) {
      setError(friendlyError(err, 'Ask SURYA query failed'));
    } finally {
      setLoading(false);
      setStreamText('');
    }
  }

  async function openCitation(c: AskAnswer['citations'][number]) {
    const url = await citationHref(c);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else setError('Source document is unavailable.');
  }

  async function rate(index: number, value: 1 | -1) {
    const turn = turns[index];
    if (!turn?.answer.queryId || turn.rated) return;
    try {
      await sendFeedback(turn.answer.queryId, value);
      setTurns(prev => prev.map((t, i) => (i === index ? { ...t, rated: true } : t)));
    } catch { /* ignore */ }
  }

  return (
    <Sheet
      isOpen={copilot.isOpen}
      onClose={copilot.closeCopilot}
      className="max-w-lg"
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles size={17} className="text-terracotta" />
          <span>Ask SURYA</span>
        </span>
      }
    >
      <div className="flex flex-col h-full gap-4">
        {/* Scope + full view bar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {activeEntity ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-terracotta/12 text-terracotta px-2.5 py-1 text-xs font-medium">
              Scoped to {activeEntity.type}: <span className="font-mono">{activeEntity.id}</span>
              <button
                type="button"
                aria-label="Clear scope"
                onClick={() => setClearedScope(true)}
                className="ml-0.5 hover:bg-terracotta/20 rounded-full p-0.5"
              >
                <X size={11} />
              </button>
            </span>
          ) : (
            <span className="text-xs text-text-muted">Institute-wide · role-scoped answers</span>
          )}

          <Link
            to={fullHref}
            onClick={copilot.closeCopilot}
            className="inline-flex items-center gap-1 text-xs font-medium text-iron-gall hover:underline"
          >
            Full view <ExternalLink size={12} />
          </Link>
        </div>

        <p className="text-[11px] text-text-muted -mt-2">Out-of-scope requests are recorded.</p>

        {/* Starter prompts when empty */}
        {turns.length === 0 && !loading && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
              Suggested questions
            </p>
            <div className="space-y-1.5">
              {starters.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void runQuery(prompt)}
                  className="w-full text-left px-3 py-2.5 rounded-xl bg-surface border border-border text-xs text-text hover:border-terracotta/50 hover:bg-surface-hover transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversation */}
        <div aria-live="polite" aria-busy={loading} className="flex-1 overflow-y-auto space-y-3 pr-1">
          {turns.map((turn, idx) => (
            <Card key={idx} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-text">{turn.question}</p>
                <Badge variant={turn.answer.mode === 'structured' ? 'info' : turn.answer.mode === 'hybrid' ? 'warning' : 'success'}>
                  {turn.answer.mode}
                </Badge>
              </div>
              <p className="text-sm leading-relaxed text-text whitespace-pre-wrap">{turn.answer.answer}</p>
              {turn.answer.citations.length > 0 && (
                <div className="pt-2 border-t border-border space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Sources</div>
                  {turn.answer.citations.map((c, i) => (
                    <button
                      key={`${c.document_id}-${i}`}
                      type="button"
                      onClick={() => void openCitation(c)}
                      className="flex items-center gap-1.5 text-xs text-iron-gall hover:underline text-left"
                    >
                      <FileText size={12} className="shrink-0" />
                      <span className="truncate">
                        {c.title} — {c.node_title} (p.{c.page_start})
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {turn.answer.queryId && (
                <div className="flex items-center gap-2 text-text-muted pt-1">
                  {turn.rated ? (
                    <span className="text-[11px]">Thanks for the feedback</span>
                  ) : (
                    <>
                      <button type="button" aria-label="Helpful" onClick={() => void rate(idx, 1)} className="hover:text-text">
                        <ThumbsUp size={13} />
                      </button>
                      <button type="button" aria-label="Not helpful" onClick={() => void rate(idx, -1)} className="hover:text-text">
                        <ThumbsDown size={13} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}

          {loading && (
            <Card className="p-4">
              <p className="text-sm leading-relaxed text-text whitespace-pre-wrap">
                {streamText || 'Searching institute records and indexed documents…'}
              </p>
            </Card>
          )}
        </div>

        {error && (
          <div role="alert" className="text-xs text-danger bg-badge-danger-bg px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        {/* Sticky prompt composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runQuery(question);
          }}
          className="flex gap-2 pt-2 border-t border-border shrink-0"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            aria-label="Ask SURYA"
            placeholder={turns.length ? 'Ask a follow-up…' : 'Ask about documents, rules, or records…'}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-terracotta outline-none"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-terracotta text-ivory px-3.5 py-2 text-sm font-medium hover:bg-terracotta-hover disabled:opacity-50 transition-colors"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </Sheet>
  );
}
