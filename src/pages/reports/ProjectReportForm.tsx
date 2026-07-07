import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useProjectReports, type ProjectReportDraft } from '../../contexts/ProjectReportsContext';
import { useData } from '../../contexts/DataContext';
import { Card } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { PERIOD_LABELS } from '../../lib/projectReports/constants';
import type { ProjectReportPeriod } from '../../types/projectReport';

const EMPTY: ProjectReportDraft = {
  projectNo: '', projectName: '', divisionCode: null,
  periodType: 'Q', periodLabel: '', dueDate: null,
  objectivesProgress: '', milestones: '', expenditureSummary: '', outcomes: '', remarks: '',
};

export default function ProjectReportForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { projects } = useData();
  const { getReport, createDraft, updateDraft } = useProjectReports();

  const [form, setForm] = useState<ProjectReportDraft>(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    getReport(id).then((r) => {
      if (cancelled) return;
      setForm({
        projectNo: r.projectNo, projectName: r.projectName, divisionCode: r.divisionCode,
        periodType: r.periodType, periodLabel: r.periodLabel, dueDate: r.dueDate,
        objectivesProgress: r.objectivesProgress, milestones: r.milestones,
        expenditureSummary: r.expenditureSummary, outcomes: r.outcomes, remarks: r.remarks,
      });
      setLoading(false);
    }).catch((e) => { setError((e as Error).message); setLoading(false); });
    return () => { cancelled = true; };
  }, [isEdit, id, getReport]);

  const projectOptions = useMemo(
    () => projects.map((p) => ({ no: p.ProjectNo, name: p.ProjectName, div: p.DivisionCode })),
    [projects],
  );

  function set<K extends keyof ProjectReportDraft>(key: K, value: ProjectReportDraft[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onPickProject(no: string) {
    const p = projectOptions.find((o) => o.no === no);
    setForm((f) => ({ ...f, projectNo: no, projectName: p?.name ?? '', divisionCode: p?.div ?? null }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.projectNo) { setError('Select a project'); return; }
    if (!form.periodLabel.trim()) { setError('Period label is required'); return; }
    setSaving(true);
    try {
      if (isEdit && id) { await updateDraft(id, form); navigate(`/reports/${id}`); }
      else { const created = await createDraft(form); navigate(`/reports/${created.id}`); }
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-text-muted">Loading…</div>;

  const field = 'w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text';

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      <button onClick={() => navigate('/reports')} className="flex items-center gap-1 text-sm text-text-muted hover:text-text">
        <ArrowLeft size={16} /> Back
      </button>
      <h1 className="text-2xl font-semibold text-text">{isEdit ? 'Edit' : 'New'} Progress Report</h1>

      <form onSubmit={onSubmit} className="space-y-5">
        <Card className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="block mb-1 text-text-muted">Project</span>
              <select value={form.projectNo} onChange={(e) => onPickProject(e.target.value)} className={field} disabled={isEdit}>
                <option value="">Select project…</option>
                {projectOptions.map((o) => (
                  <option key={o.no} value={o.no}>{o.no} — {o.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-text-muted">Period type</span>
              <select value={form.periodType} onChange={(e) => set('periodType', e.target.value as ProjectReportPeriod)} className={field}>
                {(Object.keys(PERIOD_LABELS) as ProjectReportPeriod[]).map((k) => (
                  <option key={k} value={k}>{PERIOD_LABELS[k]}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-text-muted">Period label</span>
              <input value={form.periodLabel} onChange={(e) => set('periodLabel', e.target.value)} placeholder="e.g. Q2 2026-27" className={field} />
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-text-muted">Due date</span>
              <input type="date" value={form.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || null)} className={field} />
            </label>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          {([
            ['objectivesProgress', 'Objectives progress'],
            ['milestones', 'Milestones achieved'],
            ['expenditureSummary', 'Expenditure summary'],
            ['outcomes', 'Outcomes / deliverables'],
            ['remarks', 'Remarks'],
          ] as [keyof ProjectReportDraft, string][]).map(([key, label]) => (
            <label key={key} className="text-sm block">
              <span className="block mb-1 text-text-muted">{label}</span>
              <textarea
                value={form[key] as string}
                onChange={(e) => set(key, e.target.value as ProjectReportDraft[typeof key])}
                rows={3}
                className={field}
              />
            </label>
          ))}
        </Card>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" isLoading={saving}>{isEdit ? 'Save' : 'Create draft'}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/reports')}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
