import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Card, Badge } from './ui/Cards';
import { Button } from './ui/Button';
import { friendlyError } from '../lib/errors';
import {
  KIND_LABEL, confirmTag, loadTags, loadTerms, removeTag, suggestTerms,
  type ExpertiseTerm, type StaffTag, type TermSuggestion,
} from '../lib/expertise/api';

// Tags on a staff profile. Everyone sees the confirmed ones. The person adds,
// confirms and removes their own; only confirmed tags count in the finder.
export function ExpertisePanel({ staffId, isOwn, note }: { staffId: string; isOwn: boolean; note?: string }) {
  const { push } = useToast();
  const [terms, setTerms] = useState<ExpertiseTerm[]>([]);
  const [tags, setTags] = useState<StaffTag[]>([]);
  const [suggestions, setSuggestions] = useState<TermSuggestion[]>([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, g, s] = await Promise.all([loadTerms(), loadTags(staffId), isOwn ? suggestTerms(staffId) : Promise.resolve([])]);
      setTerms(t); setTags(g); setSuggestions(s);
    } catch (err) { push(friendlyError(err), 'error'); }
  }, [staffId, isOwn, push]);

  useEffect(() => { void load(); }, [load]);

  const termById = useMemo(() => new Map(terms.map(t => [t.id, t])), [terms]);
  const confirmed = useMemo(() => tags.filter(t => t.confirmed_at), [tags]);
  const proposed = useMemo(() => tags.filter(t => !t.confirmed_at), [tags]);
  const free = useMemo(() => terms.filter(t => !tags.some(g => g.term_id === t.id)), [terms, tags]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); }
    catch (err) { push(friendlyError(err), 'error'); }
    finally { setBusy(false); }
  };

  const chip = (termId: string, extra?: ReactNode) => {
    const t = termById.get(termId);
    return (
      <span key={termId} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm text-text">
        {t?.label ?? 'Merged term'}
        {t && <span className="text-xs text-text-muted">{KIND_LABEL[t.kind]}</span>}
        {extra}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-text uppercase tracking-wide">Confirmed expertise</h3>
        <div className="flex flex-wrap gap-2">
          {confirmed.map(g => chip(g.term_id, isOwn && (
            <button aria-label="Remove" disabled={busy} onClick={() => void act(() => removeTag(staffId, g.term_id))} className="text-text-muted hover:text-text"><X size={12} /></button>
          )))}
          {confirmed.length === 0 && <p className="text-sm text-text-muted">No confirmed expertise yet.</p>}
        </div>
        {note && <p className="text-xs text-text-muted">Note on the staff record: {note}</p>}
      </Card>

      {isOwn && (
        <Card className="space-y-4">
          <h3 className="text-sm font-semibold text-text uppercase tracking-wide">Confirm your expertise</h3>
          <p className="text-sm text-text-muted">The finder ranks you only on tags you confirm.</p>
          <div className="flex flex-wrap gap-2">
            {proposed.map(g => (
              <Button key={g.term_id} variant="secondary" disabled={busy} onClick={() => void act(() => confirmTag(staffId, g.term_id, 'SUGGESTED'))}>
                <Check size={14} className="mr-1 inline" /> {termById.get(g.term_id)?.label} <Badge variant="neutral">Proposed by HR</Badge>
              </Button>
            ))}
            {suggestions.map(s => (
              <Button key={s.term_id} variant="secondary" disabled={busy} onClick={() => void act(() => confirmTag(staffId, s.term_id, 'SUGGESTED'))}>
                <Check size={14} className="mr-1 inline" /> {s.label} <span className="text-xs text-text-muted">· in {s.evidence_count} of your records</span>
              </Button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <select aria-label="Add a term" value={pick} onChange={e => setPick(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text min-w-[16rem]">
              <option value="">Add a term from the list…</option>
              {free.map(t => <option key={t.id} value={t.id}>{t.label} · {KIND_LABEL[t.kind]}</option>)}
            </select>
            <Button disabled={!pick || busy} onClick={() => void act(async () => { await confirmTag(staffId, pick, 'SELF'); setPick(''); })}>
              <Plus size={14} className="mr-1 inline" /> Add
            </Button>
          </div>
          <p className="text-xs text-text-muted">A term is missing? Ask HR to add it to the vocabulary.</p>
        </Card>
      )}
    </div>
  );
}
