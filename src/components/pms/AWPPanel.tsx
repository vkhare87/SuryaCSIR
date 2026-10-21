import type { ReactNode } from 'react';
import {
  AWP_DEVELOPMENT_LABELS, AWP_OBJECTIVE_LABELS, AWP_PROJECT_LABELS, AWP_STATUS_LABEL, activityTotal,
} from '../../lib/pms/awp';
import type { PMSAWP } from '../../types/pms';

interface Props {
  awp: PMSAWP;
  /** Committees see the plan but not projects the scientist marked confidential. */
  hideConfidential?: boolean;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN') : '—');

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h4>
      {children}
    </div>
  );
}

function Text({ value }: { value: string }) {
  return value.trim()
    ? <p className="text-sm text-text whitespace-pre-line">{value}</p>
    : <p className="text-sm text-text-muted">—</p>;
}

export function AWPPanel({ awp, hideConfidential }: Props) {
  const total = activityTotal(awp.activitySplit);

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text">Annual Work Plan {awp.reportingYear}</span>
        <span className="text-xs px-2 py-1 rounded-full border border-border text-text-muted">
          {AWP_STATUS_LABEL[awp.status]}
        </span>
      </div>

      <dl className="grid sm:grid-cols-3 gap-2 text-xs">
        <div><dt className="text-text-muted">HoD / Reporting Officer</dt>
          <dd className="text-text">{awp.roVerdict ? `${awp.roVerdict === 'REASONABLE' ? 'Appears reasonable' : 'Does not appear reasonable'} · ${fmt(awp.roAt)}` : '—'}</dd></div>
        <div><dt className="text-text-muted">Reviewing Officer</dt>
          <dd className="text-text">{awp.rvoAt ? fmt(awp.rvoAt) : '—'}</dd></div>
        <div><dt className="text-text-muted">Director</dt>
          <dd className="text-text">{awp.directorDecision ? `${awp.directorDecision === 'MODIFIED' ? 'Approved with changes' : 'Approved'} · ${fmt(awp.approvedAt)}` : '—'}</dd></div>
      </dl>
      {awp.roReasons && awp.roVerdict === 'NOT_REASONABLE' && <Block title="HoD reasons"><Text value={awp.roReasons} /></Block>}
      {awp.rvoRemarks && <Block title="Reviewing Officer remarks"><Text value={awp.rvoRemarks} /></Block>}
      {awp.directorRemarks && <Block title="Director remarks"><Text value={awp.directorRemarks} /></Block>}
      {awp.status === 'RETURNED' && awp.returnReasons && <Block title="Returned because"><Text value={awp.returnReasons} /></Block>}

      <Block title={`Activities · total ${total}%`}>
        <div className="divide-y divide-border border border-border rounded-xl">
          {awp.activitySplit.map((r, i) => (
            <div key={i} className="grid grid-cols-[10rem_1fr_3rem] gap-3 px-3 py-2 text-sm">
              <span className="text-text">{r.label}</span>
              <span className="text-text-muted whitespace-pre-line">{r.role || '—'}</span>
              <span className="text-text tabular-nums text-right">{r.timePct}%</span>
            </div>
          ))}
        </div>
      </Block>

      <Block title="1. Research projects">
        {awp.projects.map(p => (
          <div key={p.kind} className="text-sm">
            <span className="font-medium text-text">{AWP_PROJECT_LABELS[p.kind]}</span>
            {p.confidential && hideConfidential ? (
              <p className="text-text-muted italic">Confidential — details withheld</p>
            ) : (
              <>
                {p.details && <p className="text-text whitespace-pre-line">{p.details}</p>}
                {p.objectives && <p className="text-text whitespace-pre-line">{p.objectives}</p>}
                {p.resources && <p className="text-text-muted whitespace-pre-line">Resources: {p.resources}</p>}
                {!p.details && !p.objectives && !p.resources && <p className="text-text-muted">—</p>}
              </>
            )}
          </div>
        ))}
      </Block>

      <Block title="2. Research objectives and planned activities">
        {AWP_OBJECTIVE_LABELS.map(([k, label]) => (
          <div key={k}><span className="text-xs text-text-muted">{label}</span><Text value={awp.objectives[k] ?? ''} /></div>
        ))}
      </Block>

      <Block title="3. Professional & personal development">
        {AWP_DEVELOPMENT_LABELS.map(([k, label]) => (
          <div key={k}><span className="text-xs text-text-muted">{label}</span><Text value={awp.development[k] ?? ''} /></div>
        ))}
      </Block>

      <Block title="4. Other institutional work"><Text value={awp.institutionalWork} /></Block>
      <Block title="5. Other matters"><Text value={awp.other} /></Block>
    </div>
  );
}
