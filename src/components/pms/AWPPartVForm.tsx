import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  AWP_ACTIVITY_LABELS, AWP_DEVELOPMENT_LABELS, AWP_OBJECTIVE_LABELS, AWP_PROJECT_LABELS, activityTotal,
} from '../../lib/pms/awp';
import type { AWPContent, AWPPartA } from '../../types/pms';

export type AWPFormSection = 'partA' | 'activities' | 'projects' | 'objectives' | 'development' | 'other';

interface Props {
  value: AWPContent;
  onChange: (v: AWPContent) => void;
  disabled?: boolean;
  /** Sections to outline for a human check (e.g. low OCR confidence). */
  flagged?: Partial<Record<AWPFormSection, boolean>>;
}

const PART_A_FIELDS: [keyof AWPPartA, string][] = [
  ['name', 'Name of Employee'], ['employeeId', 'Employee ID'], ['group', 'Group / Grade'],
  ['dob', 'Date of Birth'], ['designation', 'Current Designation'], ['division', 'Division / Department'],
  ['dojCsir', 'Date of Joining CSIR'], ['dojGrade', 'Date of Joining Present Grade'],
  ['category', 'Category (SC/ST/OBC)'], ['email', 'Email ID'], ['mobile', 'Mobile No.'],
  ['reportingOfficer', 'Reporting Officer'], ['reviewingOfficer', 'Reviewing Officer'],
  ['prevPmsDate', "Previous year's PMS submitted on (date)"],
];

const input = 'w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-text focus:outline-none focus:border-terracotta disabled:opacity-60';

function Section({ title, flagged, children }: { title: string; flagged?: boolean; children: ReactNode }) {
  return (
    <section className={clsx('bg-surface border rounded-2xl p-4 space-y-3', flagged ? 'border-turmeric border-2' : 'border-border')}>
      <h3 className="text-sm font-semibold text-text">
        {title}
        {flagged && <span className="ml-2 text-xs font-normal text-turmeric">Check this section</span>}
      </h3>
      {children}
    </section>
  );
}

export function AWPPartVForm({ value, onChange, disabled, flagged = {} }: Props) {
  const set = (patch: Partial<AWPContent>) => onChange({ ...value, ...patch });
  const total = activityTotal(value.activitySplit);
  const fixed = (label: string) => (AWP_ACTIVITY_LABELS as readonly string[]).includes(label);

  const setActivity = (i: number, patch: Partial<AWPContent['activitySplit'][number]>) =>
    set({ activitySplit: value.activitySplit.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div className="space-y-4">
      <Section title="Part A — Personal Details" flagged={flagged.partA}>
        <div className="grid sm:grid-cols-2 gap-3">
          {PART_A_FIELDS.map(([key, label]) => (
            <label key={key} className="block text-xs text-text-muted">
              {label}
              <input
                className={clsx(input, 'mt-1')}
                value={(value.partA[key] as string) ?? ''}
                disabled={disabled}
                onChange={e => set({ partA: { ...value.partA, [key]: e.target.value } })}
              />
            </label>
          ))}
          <label className="block text-xs text-text-muted">
            Previous year's PMS submitted on time?
            <select
              className={clsx(input, 'mt-1')}
              value={value.partA.prevPmsOnTime == null ? '' : value.partA.prevPmsOnTime ? 'yes' : 'no'}
              disabled={disabled}
              onChange={e => set({ partA: { ...value.partA, prevPmsOnTime: e.target.value === '' ? null : e.target.value === 'yes' } })}
            >
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
      </Section>

      <Section title="Part B — Proposed Plan: nature of activity, role and time committed" flagged={flagged.activities}>
        <div className="space-y-3">
          {value.activitySplit.map((row, i) => (
            <div key={i} className="grid sm:grid-cols-[14rem_1fr_6rem_auto] gap-2 items-start">
              {fixed(row.label) ? (
                <span className="text-sm text-text pt-2">{row.label}</span>
              ) : (
                <input
                  aria-label="Activity name"
                  className={input}
                  value={row.label}
                  disabled={disabled}
                  onChange={e => setActivity(i, { label: e.target.value })}
                />
              )}
              <textarea
                aria-label={`Role for ${row.label || 'activity'}`}
                rows={2}
                className={clsx(input, 'resize-y')}
                value={row.role}
                disabled={disabled}
                onChange={e => setActivity(i, { role: e.target.value })}
              />
              <input
                aria-label={`Time committed (%) for ${row.label || 'activity'}`}
                type="number"
                min={0}
                max={100}
                className={input}
                value={row.timePct}
                disabled={disabled}
                onChange={e => setActivity(i, { timePct: Number(e.target.value) || 0 })}
              />
              {fixed(row.label) ? <span /> : (
                <button
                  type="button"
                  aria-label="Remove activity"
                  disabled={disabled}
                  onClick={() => set({ activitySplit: value.activitySplit.filter((_, j) => j !== i) })}
                  className="p-2 text-text-muted hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => set({ activitySplit: [...value.activitySplit, { label: '', role: '', timePct: 0 }] })}
          >
            <Plus size={14} className="mr-1" /> Add activity
          </Button>
          <span className={clsx('text-sm tabular-nums', total === 100 ? 'text-text-muted' : 'text-danger')}>
            Total {total}%{total !== 100 && <> · <span>Total must be 100%</span></>}
          </span>
        </div>
      </Section>

      <Section title="1. Research projects for the reporting year" flagged={flagged.projects}>
        {value.projects.map((p, i) => (
          <div key={p.kind} className="space-y-2 border-b border-border pb-3 last:border-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text">{AWP_PROJECT_LABELS[p.kind]}</span>
              <label className="flex items-center gap-1.5 text-xs text-text-muted">
                <input
                  type="checkbox"
                  className="accent-terracotta"
                  checked={p.confidential}
                  disabled={disabled}
                  onChange={e => set({ projects: value.projects.map((q, j) => (j === i ? { ...q, confidential: e.target.checked } : q)) })}
                />
                Confidential (hidden from committees)
              </label>
            </div>
            {(['details', 'objectives', 'resources'] as const).map(field => (
              <textarea
                key={field}
                rows={2}
                placeholder={field === 'details' ? 'Project details' : field === 'objectives' ? 'Objective(s) to be addressed in the RY' : 'Resources (availability, requirements, constraints)'}
                className={clsx(input, 'resize-y')}
                value={p[field]}
                disabled={disabled}
                onChange={e => set({ projects: value.projects.map((q, j) => (j === i ? { ...q, [field]: e.target.value } : q)) })}
              />
            ))}
          </div>
        ))}
      </Section>

      <Section title="2. Research objectives and planned activities" flagged={flagged.objectives}>
        {AWP_OBJECTIVE_LABELS.map(([key, label]) => (
          <label key={key} className="block text-xs text-text-muted">
            {label}
            <textarea
              rows={3}
              className={clsx(input, 'mt-1 resize-y')}
              value={value.objectives[key]}
              disabled={disabled}
              onChange={e => set({ objectives: { ...value.objectives, [key]: e.target.value } })}
            />
          </label>
        ))}
      </Section>

      <Section title="3. Professional & personal development" flagged={flagged.development}>
        {AWP_DEVELOPMENT_LABELS.map(([key, label]) => (
          <label key={key} className="block text-xs text-text-muted">
            {label}
            <textarea
              rows={2}
              className={clsx(input, 'mt-1 resize-y')}
              value={value.development[key]}
              disabled={disabled}
              onChange={e => set({ development: { ...value.development, [key]: e.target.value } })}
            />
          </label>
        ))}
      </Section>

      <Section title="4–5. Other institutional work and other matters" flagged={flagged.other}>
        <label className="block text-xs text-text-muted">
          4. Any other institutional work to be undertaken in the RY (work, role)
          <textarea rows={3} className={clsx(input, 'mt-1 resize-y')} value={value.institutionalWork} disabled={disabled}
            onChange={e => set({ institutionalWork: e.target.value })} />
        </label>
        <label className="block text-xs text-text-muted">
          5. Any other matter not covered above
          <textarea rows={2} className={clsx(input, 'mt-1 resize-y')} value={value.other} disabled={disabled}
            onChange={e => set({ other: e.target.value })} />
        </label>
      </Section>
    </div>
  );
}
