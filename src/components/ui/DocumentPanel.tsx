import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, FileText, Download } from 'lucide-react';
import { Card, Badge } from './Cards';
import { Button } from './Button';
import { uploadDocument, getDocumentUrl, listDocuments, type DocAccessTier } from '../../lib/documents/registry';

interface DocumentPanelProps {
  entityType: string;
  entityId: string;
  docType: string;
  accessTier: DocAccessTier;
  title: string;
  canUpload: boolean;
  divisionCode?: string | null;
}

type DocRow = Awaited<ReturnType<typeof listDocuments>>[number];

const TIER_LABELS: Record<string, string> = {
  institute: 'Internal',
  division: 'Division',
  owner: 'Restricted',
  confidential: 'Confidential',
};

/**
 * Reusable upload + list panel backed by the unified documents registry (T1).
 * Any module can mount this for an entity; uploads land in the shared bucket
 * and enter the RAG ingestion queue automatically.
 */
export function DocumentPanel({ entityType, entityId, docType, accessTier, title, canUpload, divisionCode }: DocumentPanelProps) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setDocs(await listDocuments(entityType, entityId));
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    const res = await uploadDocument(file, { entityType, entityId, docType, accessTier, divisionCode });
    if (!res.ok) setError(res.error);
    else await load();
    setBusy(false);
  }

  async function onDownload(path: string) {
    const url = await getDocumentUrl(path);
    if (url) window.open(url, '_blank');
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-[#5e5d59]" />
          <h3 className="text-base font-[500] text-text font-serif">{title}</h3>
        </div>
        {canUpload && (
          <>
            <input ref={fileInput} type="file" accept="application/pdf" className="hidden" onChange={onUpload} />
            <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Upload size={14} className="mr-1" /> Upload PDF
            </Button>
          </>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {docs.length === 0 ? (
        <p className="text-sm text-text-muted">No documents uploaded.</p>
      ) : (
        <ul className="divide-y divide-border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-2">
              <FileText size={14} className="text-text-muted" />
              <span className="flex-1 text-sm truncate" title={d.file_name}>{d.file_name}</span>
              <Badge variant={d.access_tier === 'confidential' ? 'danger' : 'neutral'}>
                {TIER_LABELS[d.access_tier] ?? d.access_tier}
              </Badge>
              <Badge variant="neutral">{d.ingest_status}</Badge>
              <button onClick={() => onDownload(d.storage_path)} className="text-brand-blue hover:underline text-xs flex items-center gap-1">
                <Download size={12} /> Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
