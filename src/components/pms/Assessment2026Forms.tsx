import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePMS } from '../../contexts/PMSContext';
import { useToast } from '../../contexts/ToastContext';
import { Card } from '../ui/Cards';
import { Button } from '../ui/Button';
import { Part1Panel } from './Part1Panel';
import { PenPictureForm } from './PenPictureForm';
import { PEN_PICTURE_SCALE_2026 } from '../../lib/pms/proforma2026';
import type { PenPictureGroup } from '../../lib/pms/annexureSpecs';
import { ReportItemsPanel } from './ReportItemsPanel';
import { getGrade, requiresBelowThresholdReasons, requiresOutstandingReasons } from '../../lib/pms/scoring';
import { finalize2026, loadPanelScore, loadPenPictureGroups, recordPanelScore } from '../../lib/pms/assessment2026Api';
import { friendlyError } from '../../lib/errors';
import type { EcAction, PenPicture, PMSReport, PmsPanelScore } from '../../types/pms';

const area = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-terracotta/40';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs text-text-muted space-y-1"><span>{label}</span>{children}</label>;
}

/** What every reader of a 2026 report sees above the forms. */
export function Report2026Summary({ report }: { report: PMSReport }) {
  return (
    <>
      <Part1Panel report={report} />
      {report.questionnaireB && (
        <p className="text-xs text-text-muted">Pay Level 13 or above: Questionnaire B applies to this report.</p>
      )}
      <ReportItemsPanel reportId={report.id} editable={false} />
    </>
  );
}

/** Part III of a 2026 report: one score for the whole panel, recorded by the Reporting Officer. */
export function PanelScore2026({ report }: { report: PMSReport }) {
  const { user } = useAuth();
  const { committees, refreshData } = usePMS();
  const { push } = useToast();
  const navigate = useNavigate();
  const members = committees.find(c => c.id === report.committeeId)?.members ?? [];
  const isRO = members.some(m => m.userId === user?.id && m.role === 'REPORTING_OFFICER');
  const [f, setF] = useState({ score: '', out: '', below: '', sugg: '', integrity: '', adverse: false, adverseText: '', critical: '', quorum: String(members.length) });
  const [pen, setPen] = useState<PenPicture>({ ratings: {}, narrative: '' });
  const [groups, setGroups] = useState<PenPictureGroup[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadPenPictureGroups(PEN_PICTURE_SCALE_2026).then(setGroups).catch(e => push(friendlyError(e), 'error')); }, [push]);
  const score = Number(f.score);
  const scored = f.score !== '' && Number.isInteger(score);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await recordPanelScore(report.id, {
        score, reasonsForOutstanding: f.out, reasonsBelowThreshold: f.below, suggestions: f.sugg, penPicture: pen,
        integrity: f.integrity, adverseRemarks: f.adverse ? f.adverseText : '', criticalAssessment: f.critical, quorumPresent: Number(f.quorum),
      });
      await refreshData();
      push('Panel score recorded; the report goes to the Empowered Committee', 'success');
      navigate('/pms/evaluate');
    } catch (err) { push(friendlyError(err), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Report2026Summary report={report} />
      {!isRO ? (
        <Card className="p-4 text-sm text-text-muted">
          The panel meets and agrees one score. The Reporting Officer records it here, with the pen picture and quorum.
        </Card>
      ) : (
        <Card className="p-4">
          <h3 className="text-sm font-medium text-text mb-3">Part III — the panel's assessment</h3>
          <form onSubmit={e => void submit(e)} className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Panel score (0–100)">
                <input type="number" min={0} max={100} step={1} required value={f.score} onChange={e => setF({ ...f, score: e.target.value })} className={area} />
              </Field>
              <Field label="Grade"><p className="text-sm text-text py-2">{scored ? getGrade(score) : '—'}</p></Field>
              <Field label={`Members present (of ${members.length})`}>
                <input type="number" min={1} max={members.length} required value={f.quorum} onChange={e => setF({ ...f, quorum: e.target.value })} className={area} />
              </Field>
            </div>
            {scored && requiresOutstandingReasons(score) && (
              <Field label="Reasons for Outstanding"><textarea rows={2} required value={f.out} onChange={e => setF({ ...f, out: e.target.value })} className={area} /></Field>
            )}
            {scored && requiresBelowThresholdReasons(score) && (
              <>
                <Field label="Reasons"><textarea rows={2} required value={f.below} onChange={e => setF({ ...f, below: e.target.value })} className={area} /></Field>
                <Field label="Suggestions for improvement"><textarea rows={2} required value={f.sugg} onChange={e => setF({ ...f, sugg: e.target.value })} className={area} /></Field>
              </>
            )}
            <PenPictureForm groups={groups} value={pen} onChange={setPen}
              intro="Pen picture — behavioural aspects. Qualitative only: no marks. Rate every item. The box below holds the Evaluation Committee's remarks." />
            <Field label="D. Integrity — mandatory; read Appendix-B (GOI OM 51/5/72-Estt A, 20 May 1972) first">
              <textarea rows={2} required value={f.integrity} onChange={e => setF({ ...f, integrity: e.target.value })}
                placeholder="For example: certified; or, the committee has not watched the work long enough to make a definite remark" className={area} />
            </Field>
            <Field label="E. Any adverse remarks?">
              <select value={f.adverse ? 'Yes' : 'No'} onChange={e => setF({ ...f, adverse: e.target.value === 'Yes' })} className={area}>
                <option>No</option><option>Yes</option>
              </select>
            </Field>
            {f.adverse && <Field label="If yes, give details"><textarea rows={2} required value={f.adverseText} onChange={e => setF({ ...f, adverseText: e.target.value })} className={area} /></Field>}
            <Field label="F. Critical assessment of the scientist"><textarea rows={3} value={f.critical} onChange={e => setF({ ...f, critical: e.target.value })} className={area} /></Field>
            <Button type="submit" disabled={busy}>{busy ? 'Recording…' : 'Record the panel score'}</Button>
          </form>
        </Card>
      )}
    </div>
  );
}

/** Part IV of a 2026 report: concur with, upgrade or downgrade the panel score. */
export function Finalize2026({ report, onDone }: { report: PMSReport; onDone: () => void }) {
  const { empoweredMembers, refreshData } = usePMS();
  const { push } = useToast();
  const [panel, setPanel] = useState<PmsPanelScore | null>(null);
  const members = empoweredMembers.filter(m => m.cycleId === report.cycleId);
  const [f, setF] = useState({ action: 'CONCUR' as EcAction, score: '', reasons: '', sugg: '', general: '', critical: '', quorum: String(members.length) });
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadPanelScore(report.id).then(setPanel).catch(e => push(friendlyError(e), 'error')); }, [report.id, push]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await finalize2026(report.id, {
        action: f.action, finalScore: f.action === 'CONCUR' ? null : Number(f.score), reasons: f.reasons, suggestions: f.sugg,
        generalComments: f.general, criticalAssessment: f.critical, quorumPresent: Number(f.quorum),
      });
      await refreshData();
      push('Report finalized and communicated', 'success');
      onDone();
    } catch (err) { push(friendlyError(err), 'error'); }
    finally { setBusy(false); }
  };

  if (!panel) return <p className="text-sm text-text-muted">Waiting for the Evaluation Committee's panel score.</p>;
  return (
    <form onSubmit={e => void submit(e)} className="space-y-3">
      <p className="text-sm text-text">Evaluation Committee: <strong>{panel.score}</strong> ({getGrade(panel.score)}) · integrity {panel.integrity}
        · {panel.quorumPresent} of {panel.membersTotal} present</p>
      {panel.criticalAssessment && <p className="text-xs text-text-muted">{panel.criticalAssessment}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Decision">
          <select value={f.action} onChange={e => setF({ ...f, action: e.target.value as EcAction })} className={area}>
            <option value="CONCUR">Concur</option><option value="UPGRADE">Upgrade to</option><option value="DOWNGRADE">Downgrade to</option>
          </select>
        </Field>
        {f.action !== 'CONCUR' && (
          <Field label="Score"><input type="number" min={0} max={100} step={1} required value={f.score} onChange={e => setF({ ...f, score: e.target.value })} className={area} /></Field>
        )}
        <Field label={`Present (chair + ${members.length - 1})`}>
          <input type="number" min={1} max={members.length} required value={f.quorum} onChange={e => setF({ ...f, quorum: e.target.value })} className={area} />
        </Field>
      </div>
      {f.action !== 'CONCUR' && (
        <>
          <Field label="Reasons for the change"><textarea rows={2} required value={f.reasons} onChange={e => setF({ ...f, reasons: e.target.value })} className={area} /></Field>
          <Field label="Suggestions for improvement (needed at 75 or below)"><textarea rows={2} value={f.sugg} onChange={e => setF({ ...f, sugg: e.target.value })} className={area} /></Field>
        </>
      )}
      <Field label="General comments"><textarea rows={2} value={f.general} onChange={e => setF({ ...f, general: e.target.value })} className={area} /></Field>
      <Field label="Critical assessment"><textarea rows={2} value={f.critical} onChange={e => setF({ ...f, critical: e.target.value })} className={area} /></Field>
      <Button type="submit" disabled={busy}>{busy ? 'Finalizing…' : 'Finalize and communicate'}</Button>
    </form>
  );
}
