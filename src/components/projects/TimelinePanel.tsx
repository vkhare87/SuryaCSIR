import { FileText } from 'lucide-react';
import { Card } from '../ui/Cards';
import { openDocumentUrl } from '../../lib/documents/registry';
import { projectDocumentUrl } from '../../lib/projects/projectFileApi';
import type { ProjectDocument, ProjectEvent } from '../../types/projectFile';

const DOC_LABEL: Record<ProjectDocument['docType'], string> = {
  receipt_order: 'Release order', expenditure_statement: 'Expenditure statement',
  milestone_evidence: 'Milestone evidence', other: 'Document',
};

export function TimelinePanel({ events, documents }: { events: ProjectEvent[]; documents: ProjectDocument[] }) {
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem] gap-6">
      <Card className="p-4 space-y-3">
        <h2 className="text-base font-[500] font-serif text-text">Timeline</h2>
        {events.length === 0 ? <p className="text-sm text-text-muted">Nothing recorded yet.</p> : (
          <ol className="space-y-2">
            {events.map(e => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="font-mono text-xs text-text-muted w-24 shrink-0 pt-0.5">
                  {new Date(e.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span className="text-text">{e.summary}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card className="p-4 space-y-3">
        <h2 className="text-base font-[500] font-serif text-text">Documents</h2>
        {documents.length === 0 ? <p className="text-sm text-text-muted">None filed.</p> : (
          <ul className="space-y-2">
            {documents.map(d => (
              <li key={d.id}>
                <button type="button" className="flex items-start gap-2 text-left text-sm text-text hover:underline"
                  onClick={() => void openDocumentUrl(() => projectDocumentUrl(d.storagePath))}>
                  <FileText size={14} className="mt-0.5 shrink-0 text-text-muted" />
                  <span>
                    {DOC_LABEL[d.docType]}
                    <span className="block text-xs text-text-muted">{d.fileName} · {new Date(d.uploadedAt).toLocaleDateString('en-IN')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
