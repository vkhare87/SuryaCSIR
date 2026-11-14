import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Card } from '../ui/Cards';
import { scoreHistory } from '../../lib/pms/assessment2026Api';
import type { ScoreHistoryRow } from '../../types/pms';

/**
 * PMS record across cycles. pms_score_history returns rows only to those the
 * rules entitle (the person, the Director, the Empowered Committee, the RO /
 * RvO of the current cycle); for everyone else this renders nothing.
 */
export function ScoreHistoryCard({ staffId }: { staffId: string }) {
  const [rows, setRows] = useState<ScoreHistoryRow[]>([]);
  useEffect(() => {
    let live = true;
    scoreHistory(staffId).then(r => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [staffId]);

  if (rows.length === 0) return null;
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <ClipboardCheck size={16} className="text-terracotta" />
        <h3 className="text-base font-[500] text-text font-serif">PMS record</h3>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-text-muted"><tr>
          <th className="text-left px-5 py-2">Cycle</th><th className="text-right">Score</th><th className="text-left px-3">Grade</th>
          <th className="text-right">Lab average</th><th className="text-right px-5" title="Score as a percentage of the lab average">% of average</th>
        </tr></thead>
        <tbody className="divide-y divide-border">
          {rows.map(r => (
            <tr key={r.cycleId} title={r.remarks}>
              <td className="px-5 py-2 text-text">{r.cycle}</td>
              <td className="text-right font-mono tabular-nums">{r.score}</td>
              <td className="px-3 text-text">{r.grade}</td>
              <td className="text-right font-mono tabular-nums text-text-muted">{r.labAverage ?? '—'}</td>
              <td className="text-right px-5 font-mono tabular-nums">{r.normalised ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
