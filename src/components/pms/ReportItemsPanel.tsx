import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { Card, Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import { addItem, loadItems, prefillItems, setItem } from '../../lib/pms/assessment2026Api';
import { friendlyError } from '../../lib/errors';
import type { PmsReportItem, ReportItemSection } from '../../types/pms';

const SECTION_LABELS: Record<ReportItemSection, string> = {
  PROJECT: 'Projects', OUTPUT: 'Publications', IP: 'Patents & IP', TECH_TRANSFER: 'Technology transfer',
  STUDENT: 'PhD students', COMMITTEE: 'Committees', OTHER: 'Other work',
};
const STATE_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'info' | 'neutral' }> = {
  PREFILLED: { label: 'Suggested', variant: 'warning' }, CONFIRMED: { label: 'Confirmed', variant: 'success' },
  EDITED: { label: 'Edited', variant: 'success' }, ADDED: { label: 'Added', variant: 'info' }, REMOVED: { label: 'Removed', variant: 'neutral' },
};

function ItemLink({ item }: { item: PmsReportItem }) {
  if (!item.link) return <span className="text-text">{item.text}</span>;
  return /^https?:\/\//.test(item.link)
    ? <a href={item.link} target="_blank" rel="noreferrer" className="text-text hover:text-terracotta hover:underline">{item.text}</a>
    : <Link to={item.link} className="text-text hover:text-terracotta hover:underline">{item.text}</Link>;
}

/**
 * The year's work, filled from the records (2026 Part II). A suggestion is
 * not a claim until the scientist confirms or edits it; the committees see
 * claims only, each opening its record.
 */
export function ReportItemsPanel({ reportId, editable }: { reportId: string; editable: boolean }) {
  const { push } = useToast();
  const [items, setItems] = useState<PmsReportItem[]>([]);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [newItem, setNewItem] = useState({ section: 'OTHER' as ReportItemSection, text: '' });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    loadItems(reportId).then(setItems).catch(e => push(friendlyError(e), 'error'));
  }, [reportId, push]);
  useEffect(() => { reload(); }, [reload]);

  const groups = useMemo(() => (Object.keys(SECTION_LABELS) as ReportItemSection[])
    .map(s => ({ section: s, items: items.filter(i => i.section === s && (editable || i.state !== 'REMOVED')) }))
    .filter(g => g.items.length > 0), [items, editable]);
  const suggested = items.filter(i => i.state === 'PREFILLED').length;

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try { await fn(); if (done) push(done, 'success'); reload(); }
    catch (e) { push(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-medium text-text">The year's work, from the records</h3>
          <p className="text-xs text-text-muted">
            {editable ? 'Suggested lines are not claims until you confirm or correct them. The committee sees only confirmed lines.'
              : 'Lines the scientist confirmed, each linked to its record.'}
          </p>
        </div>
        {editable && (
          <Button variant="secondary" disabled={busy} onClick={() => void run(async () => {
            const n = await prefillItems(reportId);
            push(n ? `${n} line(s) filled from your records` : 'Nothing new in your records', 'success');
          })}><Sparkles size={14} className="mr-1.5 inline" />Fill from my records</Button>
        )}
      </div>
      {editable && suggested > 0 && <p className="text-xs text-turmeric">{suggested} suggested line(s) wait for you to confirm.</p>}
      {groups.length === 0 && <p className="text-sm text-text-muted">{editable ? 'Nothing yet. Fill from your records, or add a line.' : 'No confirmed lines.'}</p>}

      {groups.map(g => (
        <div key={g.section}>
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{SECTION_LABELS[g.section]}</p>
          <ul className="divide-y divide-border border border-border rounded-lg">
            {g.items.map(i => (
              <li key={i.id} className="px-3 py-2 text-sm flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {editing?.id === i.id ? (
                    <textarea aria-label="Corrected text" rows={2} value={editing.text} onChange={e => setEditing({ id: i.id, text: e.target.value })}
                      className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text" />
                  ) : <span className={i.state === 'REMOVED' ? 'line-through text-text-muted' : ''}><ItemLink item={i} /></span>}
                </div>
                {editable && <Badge variant={STATE_BADGE[i.state].variant}>{STATE_BADGE[i.state].label}</Badge>}
                {editable && i.state !== 'REMOVED' && (
                  <div className="flex gap-2 shrink-0 text-xs">
                    {editing?.id === i.id ? (
                      <>
                        <button className="text-terracotta hover:underline" disabled={busy} onClick={() => void run(() => setItem(i.id, 'EDITED', editing.text)).then(() => setEditing(null))}>Save</button>
                        <button className="text-text-muted hover:underline" onClick={() => setEditing(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        {i.state === 'PREFILLED' && <button className="text-terracotta hover:underline" disabled={busy} onClick={() => void run(() => setItem(i.id, 'CONFIRMED'))}>Confirm</button>}
                        <button className="text-text-muted hover:underline" onClick={() => setEditing({ id: i.id, text: i.text })}>Edit</button>
                        <button className="text-text-muted hover:underline" disabled={busy} onClick={() => void run(() => setItem(i.id, 'REMOVED'))}>Remove</button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {editable && (
        <div className="flex flex-wrap gap-2 items-end border-t border-border pt-3">
          <select aria-label="Section" value={newItem.section} onChange={e => setNewItem({ ...newItem, section: e.target.value as ReportItemSection })}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text">
            {(Object.keys(SECTION_LABELS) as ReportItemSection[]).map(s => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}
          </select>
          <input aria-label="New line" value={newItem.text} onChange={e => setNewItem({ ...newItem, text: e.target.value })}
            placeholder="Something the records do not hold" className="flex-1 min-w-48 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text" />
          <Button variant="secondary" disabled={busy || !newItem.text.trim()}
            onClick={() => void run(() => addItem(reportId, newItem.section, newItem.text), 'Line added').then(() => setNewItem({ ...newItem, text: '' }))}>Add</Button>
        </div>
      )}
    </Card>
  );
}
