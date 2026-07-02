import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, Download } from 'lucide-react';
import { useProjectReports } from '../../contexts/ProjectReportsContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card, Badge } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { PR_STATUS_LABELS, PR_STATUS_VARIANT, PR_EDITABLE } from '../../lib/projectReports/constants';
import { uploadDocument, getDocumentUrl, listDocuments } from '../../lib/documents/registry';
import type { ProjectReport } from '../../types/projectReport';

const REVIEWER_ROLES = ['HOD', 'DivisionHead', 'Director', 'HRAdmin', 'SystemAdmin', 'MasterAdmin'];

type DocRow = Awaited<ReturnType<typeof listDocuments>>[number];

export default function ProjectReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getReport, submitReport, reviewReport } = useProjectReports();

  const [report, setReport] = useState<ProjectReport | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const r = await getReport(id);
    setReport(r);
    setDocs(await listDocuments('project_report', id));
    setLoading(false);
  }, [id, getReport]);

  useEffect(() => { load().catch((e) => { setError((e as Error).message); setLoading(false); }); }, [load]);

  if (loading) return <div className="p-6 text-text-muted">Loading…</div>;
  if (!report) return (
    <div className="p-6 space-y-3">
      <p className="text-text-muted">Report not found.</p>
      <Button onClick={() => navigate('/reports')}>Back to reports</Button>
    </div>
  );

  const isOwner = user?.id === report.submittedBy;
  const editable = PR_EDITABLE.includes(report.status);
  const canReview = user ? REVIEWER_ROLES.includes(user.activeRole)
    && (report.status === 'SUBMITTED' || report.status === 'UNDER_REVIEW') : false;

  async function act(fn: () => Promise<void>) {
    setBusy(true); setError('');
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !id) return;
    setBusy(true); setError('');
    const res = await uploadDocument(file, {
      entityType: 'project_report', entityId: id, docType: 'progress_report',
      accessTier: 'division', divisionCode: report!.divisionCode,
    });
    if (!res.ok) setError(res.error);
    else setDocs(await listDocuments('project_report', id));
    setBusy(false);
  }

  async function onDownload(path: string) {
    const url = await getDocumentUrl(path);
    if (url) window.open(url, '_blank');
  }

  const rows: [string, string][] = [
    ['Objectives progress', report.objectivesProgress],
    ['Milestones achieved', report.milestones],
    ['Expenditure summary', report.expenditureSummary],
    ['Outcomes / deliverables', report.outcomes],
    ['Remarks', report.remarks],
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      <button onClick={() => navigate('/reports')} className="flex items-center gap-1 text-sm text-text-muted hover:text-text">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">{report.projectName}</h1>
          <p className="text-text-muted text-sm">{report.projectNo} · {report.periodLabel}{report.dueDate ? ` · due ${report.dueDate}` : ''}</p>
        </div>
        <Badge variant={PR_STATUS_VARIANT[report.status]}>{PR_STATUS_LABELS[report.status]}</Badge>
      </div>

      {report.reviewNotes && (
        <Card className="p-4 border-l-4 border-l-warning">
          <p className="text-xs text-text-muted mb-1">Reviewer notes</p>
          <p className="text-sm text-text whitespace-pre-wrap">{report.reviewNotes}</p>
        </Card>
      )}

      <Card className="p-5 space-y-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-text-muted mb-1">{label}</p>
            <p className="text-sm text-text whitespace-pre-wrap">{value || '—'}</p>
          </div>
        ))}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Attachments</h2>
          {(isOwner && editable) && (
            <>
              <input ref={fileInput} type="file" accept="application/pdf" className="hidden" onChange={onUpload} />
              <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
                <Upload size={14} className="mr-1" /> Upload PDF
              </Button>
            </>
          )}
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-text-muted">No attachments.</p>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-2 py-2">
                <FileText size={14} className="text-text-muted" />
                <span className="flex-1 text-sm truncate">{d.file_name}</span>
                <Badge variant="neutral">{d.ingest_status}</Badge>
                <button onClick={() => onDownload(d.storage_path)} className="text-brand-blue hover:underline text-xs flex items-center gap-1">
                  <Download size={12} /> Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {(isOwner && editable) && (
          <>
            <Button variant="secondary" onClick={() => navigate(`/reports/${report.id}/edit`)}>Edit</Button>
            <Button isLoading={busy} onClick={() => act(() => submitReport(report.id))}>Submit for review</Button>
          </>
        )}
      </div>

      {canReview && (
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-semibold">Review</h2>
          <textarea
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            rows={3}
            placeholder="Notes (required to request revision)"
            className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text"
          />
          <div className="flex gap-3">
            <Button isLoading={busy} onClick={() => act(() => reviewReport(report.id, 'REVIEWED', reviewNotes))}>
              Accept
            </Button>
            <Button variant="danger" isLoading={busy} onClick={() => act(() => reviewReport(report.id, 'REVISION_REQUESTED', reviewNotes))}>
              Request revision
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
