import { useMemo } from 'react';
import { Download } from 'lucide-react';
import clsx from 'clsx';
import { Card } from './ui/Cards';
import { Button } from './ui/Button';
import { generateTemplate, FILE_TYPE_LABELS, type FileType } from '../utils/dataMigration';
import { domainUploadLedger, type UploadStatus } from '../lib/divisions/uploadFreshness';
import { useData } from '../contexts/DataContext';

const STATUS_LABEL: Record<UploadStatus, string> = {
  fresh: 'Fresh',
  stale: 'Stale',
  urgent: 'Urgent',
};

const STATUS_CLASS: Record<UploadStatus, string> = {
  fresh: 'text-archive-green',
  stale: 'text-turmeric',
  urgent: 'text-rose-600 dark:text-rose-400',
};

function downloadTemplate(type: FileType, format: 'xlsx' | 'csv') {
  const blob = generateTemplate(type, format);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${type}-template.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Always-visible per-domain upload ledger on Data Management. Upload-recency
 * signal — distinct from lib/divisions/freshness.ts's content-recency signal.
 * See design doc Phase A revision (2026-07-19 /plan-design-review, D2/D3). */
export function DataFreshnessLedger() {
  const { importEvents } = useData();
  const ledger = useMemo(() => domainUploadLedger(importEvents), [importEvents]);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Per-domain data upload freshness and templates</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">Domain</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">Last Uploaded</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">By</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">Status</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">Template</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((row) => (
              <tr key={row.domain} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-text">{FILE_TYPE_LABELS[row.domain]}</td>
                <td className="px-4 py-3 font-mono [font-variant-numeric:tabular-nums] text-text-muted whitespace-nowrap">
                  {formatDate(row.lastUploadedAt)}
                </td>
                <td className="px-4 py-3 text-text-muted truncate max-w-[200px]">{row.uploadedByEmail ?? '—'}</td>
                <td className={clsx('px-4 py-3 font-semibold', STATUS_CLASS[row.status])}>
                  {STATUS_LABEL[row.status]}
                </td>
                <td className="px-4 py-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-[44px]"
                    onClick={() => downloadTemplate(row.domain, 'xlsx')}
                  >
                    <span className="text-archive-green flex items-center gap-1.5">
                      <Download size={14} /> Template
                    </span>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
