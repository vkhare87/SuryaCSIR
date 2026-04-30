import { DynamicTable } from './DynamicTable';
import { WordCountTextarea } from './WordCountTextarea';

type SectionProps = { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void };

function getItems(data: Record<string, unknown>): Record<string, string>[] {
  return (data.items as Record<string, string>[]) ?? [];
}
function getText(data: Record<string, unknown>): string {
  return (data.text as string) ?? '';
}

export function SectionI1Form({ data, onChange }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">List research publications during the appraisal period.</p>
      <DynamicTable
        columns={[
          { key: 'title', label: 'Title' },
          { key: 'journal', label: 'Journal/Conference' },
          { key: 'year', label: 'Year' },
          { key: 'doi', label: 'DOI/ISBN' },
        ]}
        rows={getItems(data)}
        onChange={rows => onChange({ ...data, items: rows })}
      />
    </div>
  );
}

export function SectionI2Form({ data, onChange }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">List research projects handled during the appraisal period.</p>
      <DynamicTable
        columns={[
          { key: 'title', label: 'Project Title' },
          { key: 'fundingBody', label: 'Funding Body' },
          { key: 'amount', label: 'Amount (₹)' },
          { key: 'role', label: 'Role' },
        ]}
        rows={getItems(data)}
        onChange={rows => onChange({ ...data, items: rows })}
      />
    </div>
  );
}

export function SectionI3Form({ data, onChange }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">List patents and IPR filings.</p>
      <DynamicTable
        columns={[
          { key: 'title', label: 'Title' },
          { key: 'filingNo', label: 'Filing No.' },
          { key: 'status', label: 'Status' },
          { key: 'year', label: 'Year' },
        ]}
        rows={getItems(data)}
        onChange={rows => onChange({ ...data, items: rows })}
      />
    </div>
  );
}

export function SectionI4Form({ data, onChange }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">Summarize key research highlights (max 150 words).</p>
      <WordCountTextarea
        value={getText(data)}
        onChange={text => onChange({ ...data, text })}
        maxWords={150}
        placeholder="Describe key research highlights…"
      />
    </div>
  );
}

export function SectionI5Form({ data, onChange }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">Outline research plans for the next period (max 100 words).</p>
      <WordCountTextarea
        value={getText(data)}
        onChange={text => onChange({ ...data, text })}
        maxWords={100}
        placeholder="Describe research plans…"
      />
    </div>
  );
}

export function SectionIIForm({ data, onChange }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">List technology transfers and consultancy assignments.</p>
      <DynamicTable
        columns={[
          { key: 'title', label: 'Title' },
          { key: 'client', label: 'Client/Industry' },
          { key: 'value', label: 'Value (₹)' },
          { key: 'year', label: 'Year' },
        ]}
        rows={getItems(data)}
        onChange={rows => onChange({ ...data, items: rows })}
      />
    </div>
  );
}

export function SectionIIIForm({ data, onChange }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">Describe contributions to human resource development (max 300 words).</p>
      <WordCountTextarea
        value={getText(data)}
        onChange={text => onChange({ ...data, text })}
        maxWords={300}
        rows={8}
        placeholder="Describe mentoring, training, PhD supervision…"
      />
    </div>
  );
}

export function SectionIVForm({ data, onChange }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">Describe contributions to institutional development (max 300 words).</p>
      <WordCountTextarea
        value={getText(data)}
        onChange={text => onChange({ ...data, text })}
        maxWords={300}
        rows={8}
        placeholder="Describe committee work, administrative duties, infrastructure…"
      />
    </div>
  );
}

export function SectionVCurriculumForm({ data, onChange }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">Describe curriculum design contributions (max 100 words).</p>
      <WordCountTextarea
        value={getText(data)}
        onChange={text => onChange({ ...data, text })}
        maxWords={100}
        placeholder="Describe curriculum design work…"
      />
    </div>
  );
}

export function SectionVExtensionForm({ data, onChange }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">List extension and outreach activities.</p>
      <DynamicTable
        columns={[
          { key: 'activity', label: 'Activity' },
          { key: 'date', label: 'Date' },
          { key: 'audience', label: 'Audience' },
          { key: 'outcome', label: 'Outcome' },
        ]}
        rows={getItems(data)}
        onChange={rows => onChange({ ...data, items: rows })}
      />
    </div>
  );
}

export function SectionVOtherForm({ data, onChange }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">Describe other contributions not covered above (max 150 words).</p>
      <WordCountTextarea
        value={getText(data)}
        onChange={text => onChange({ ...data, text })}
        maxWords={150}
        placeholder="Describe other contributions…"
      />
    </div>
  );
}

export function SectionVINationalForm({ data, onChange }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">List national awards, honours, and recognitions.</p>
      <DynamicTable
        columns={[
          { key: 'award', label: 'Award/Recognition' },
          { key: 'body', label: 'Awarding Body' },
          { key: 'year', label: 'Year' },
        ]}
        rows={getItems(data)}
        onChange={rows => onChange({ ...data, items: rows })}
      />
    </div>
  );
}

export function SectionVIInternationalForm({ data, onChange }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">List international awards, honours, and recognitions.</p>
      <DynamicTable
        columns={[
          { key: 'award', label: 'Award/Recognition' },
          { key: 'body', label: 'Awarding Body' },
          { key: 'country', label: 'Country' },
          { key: 'year', label: 'Year' },
        ]}
        rows={getItems(data)}
        onChange={rows => onChange({ ...data, items: rows })}
      />
    </div>
  );
}

export function SummaryForm({ data, onChange }: SectionProps) {
  const title      = (data.title as string) ?? '';
  const periodFrom = (data.periodFrom as string) ?? '';
  const periodTo   = (data.periodTo as string) ?? '';
  const selfScore  = data.selfScore !== undefined ? String(data.selfScore) : '';

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">Fill in the basic details for your appraisal report.</p>
      <div>
        <label className="block text-sm font-medium text-text-muted mb-1">Report Title</label>
        <input
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
          value={title}
          onChange={e => onChange({ ...data, title: e.target.value })}
          placeholder="Annual Performance Report 2025-26"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">Period From</label>
          <input
            type="date"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
            value={periodFrom}
            onChange={e => onChange({ ...data, periodFrom: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">Period To</label>
          <input
            type="date"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
            value={periodTo}
            onChange={e => onChange({ ...data, periodTo: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-text-muted mb-1">
          Self Assessment Score (0.5 – 1.1)
        </label>
        <input
          type="number"
          step="0.1"
          min="0.5"
          max="1.1"
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
          value={selfScore}
          onChange={e => onChange({ ...data, selfScore: parseFloat(e.target.value) })}
          placeholder="e.g. 0.9"
        />
      </div>
    </div>
  );
}
