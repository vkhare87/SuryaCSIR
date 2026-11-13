import { useCallback, useEffect, useState } from 'react';
import { FileDown, UserCheck } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import { delayReport, prefillPart1, timelineStatus } from '../../lib/pms/assessment2026Api';
import { friendlyError } from '../../lib/errors';
import type { AppraisalCycle, TimelineStep } from '../../types/pms';

/** The nine Annexure-B steps of one cycle, with Part I pre-fill and the delay report to the DG. */
export function TimelineCard({ cycle }: { cycle: AppraisalCycle }) {
  const { push } = useToast();
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    timelineStatus(cycle.id).then(setSteps).catch(e => push(friendlyError(e), 'error'));
  }, [cycle.id, push]);
  useEffect(() => { reload(); }, [reload]);

  const prefill = async () => {
    setBusy(true);
    try { push(`Part I filled for ${await prefillPart1(cycle.id)} report(s)`, 'success'); }
    catch (e) { push(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  };

  const printDelays = async () => {
    setBusy(true);
    try {
      const rows = await delayReport(cycle.id);
      const [{ pdf }, { DelayReportPdf }] = await Promise.all([import('@react-pdf/renderer'), import('../../lib/pms/delayReportPdf')]);
      const url = URL.createObjectURL(await pdf(<DelayReportPdf cycle={cycle.name} steps={steps} rows={rows} />).toBlob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `pms_delay_report_${cycle.name.replace(/\W+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { push(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="px-5 pb-4 bg-surface space-y-3">
      <table className="w-full text-xs">
        <thead className="text-text-muted"><tr>
          <th className="text-left py-1">Annexure-B step</th><th className="text-left">Due</th>
          <th className="text-right">Done</th><th className="text-right">Pending</th><th className="text-right">Overdue</th>
        </tr></thead>
        <tbody className="divide-y divide-border">
          {steps.map(s => (
            <tr key={s.step}>
              <td className="py-1 text-text">{s.step}. {s.label}</td>
              <td className="font-mono text-text-muted">{s.due ?? 'per case'}</td>
              <td className="text-right font-mono">{s.done}</td>
              <td className="text-right font-mono">{s.pending}</td>
              <td className="text-right">{s.overdue ? <Badge variant="danger">{s.overdue}</Badge> : <span className="font-mono text-text-muted">0</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2 flex-wrap">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void prefill()}><UserCheck size={14} className="mr-1.5 inline" />Fill Part I from staff records</Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void printDelays()}><FileDown size={14} className="mr-1.5 inline" />Delay report to DG</Button>
      </div>
    </div>
  );
}
