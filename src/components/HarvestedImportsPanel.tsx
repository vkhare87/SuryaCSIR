import { useEffect, useState, useCallback } from 'react';
import { Inbox, Folder, Mail, X } from 'lucide-react';
import clsx from 'clsx';
import { Card } from './ui/Cards';
import { Button } from './ui/Button';
import { ImportFlow } from './ImportFlow';
import type { FileType } from '../utils/dataMigration';
import { FILE_TYPE_LABELS } from '../utils/dataMigration';
import {
  listPendingHarvested,
  downloadHarvestedFile,
  markHarvestedReviewed,
  markHarvestedDiscarded,
} from '../lib/ingest/harvestedImports';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type { HarvestedImport } from '../types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Phase B review queue — structured files landed by the folder-watch / mail-in
 * worker (ingest/) that have NOT been committed to HR tables. A human picks the
 * entity type and confirms via the same ImportFlow used for manual uploads;
 * nothing here writes to HR tables unreviewed. See design doc Phase B. */
export function HarvestedImportsPanel({ onImported }: { onImported: () => void }) {
  const { user } = useAuth();
  const { push: pushToast } = useToast();
  const [rows, setRows] = useState<HarvestedImport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewing, setReviewing] = useState<{ row: HarvestedImport; file: File; entityType: FileType } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);
    try {
      setRows(await listPendingHarvested(supabase));
    } catch (err) {
      pushToast(`Failed to load harvested files: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [pushToast]);

  useEffect(() => { load(); }, [load]);

  const openReview = async (row: HarvestedImport) => {
    if (!supabase) return;
    try {
      const file = await downloadHarvestedFile(supabase, row);
      setReviewing({ row, file, entityType: guessType(row.file_name) });
    } catch (err) {
      pushToast(`Failed to open file: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const handleDiscard = async (row: HarvestedImport) => {
    if (!supabase || !user) return;
    try {
      await markHarvestedDiscarded(supabase, row.id, user.id);
    } catch (err) {
      pushToast(`Failed to discard: ${err instanceof Error ? err.message : String(err)}`, 'error');
      return;
    }
    await load();
  };

  const handleImportComplete = async () => {
    if (!supabase || !user || !reviewing) return;
    try {
      await markHarvestedReviewed(supabase, reviewing.row.id, user.id);
    } catch (err) {
      pushToast(`Imported, but marking the file reviewed failed: ${err instanceof Error ? err.message : String(err)}`, 'warning');
    }
    setReviewing(null);
    await load();
    onImported();
  };

  if (reviewing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Reviewing <span className="font-medium text-text">{reviewing.row.file_name}</span> from{' '}
            {reviewing.row.source === 'folder' ? 'watched folder' : 'mail-in'} (
            {reviewing.row.source_identifier})
          </p>
          <button
            onClick={() => setReviewing(null)}
            className="text-xs font-medium text-text-muted hover:text-text inline-flex items-center gap-1"
          >
            <X size={14} /> Cancel
          </button>
        </div>
        <ImportFlow
          type={reviewing.entityType}
          showTypePicker
          initialFile={reviewing.file}
          onComplete={handleImportComplete}
        />
      </div>
    );
  }

  if (isLoading) {
    return <Card className="text-sm text-text-muted">Loading harvested files…</Card>;
  }

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 py-10 text-center">
        <Inbox size={24} className="text-text-muted" />
        <p className="text-sm text-text-muted">
          Nothing waiting. Files landed by the watched folder or mail-in inbox will show up here for review.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">File</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">Source</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">Division</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">Landed</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-muted"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-text">{row.file_name}</td>
                <td className="px-4 py-3 text-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    {row.source === 'folder' ? <Folder size={13} /> : <Mail size={13} />}
                    {row.source_identifier}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-muted">
                  {row.division_code ?? <span className="text-turmeric">Unmapped</span>}
                </td>
                <td className="px-4 py-3 font-mono [font-variant-numeric:tabular-nums] text-text-muted whitespace-nowrap">
                  {formatDate(row.landed_at)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button variant="secondary" size="sm" className="mr-2" onClick={() => openReview(row)}>
                    Review &amp; Import
                  </Button>
                  <button
                    onClick={() => handleDiscard(row)}
                    className={clsx('text-xs font-medium text-text-muted hover:text-rose-600 dark:hover:text-rose-400')}
                  >
                    Discard
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Best-effort default entity type from the file name, so the review picker
 * doesn't default to "staff" for an obvious equipment/PhD file. Admin can
 * still change it via the type dropdown before confirming — this is only a
 * starting point, not a classifier (that's Phase C). */
function guessType(fileName: string): FileType {
  const name = fileName.toLowerCase();
  const hit = (Object.keys(FILE_TYPE_LABELS) as FileType[]).find((t) => name.includes(t.toLowerCase()));
  return hit ?? 'staff';
}
