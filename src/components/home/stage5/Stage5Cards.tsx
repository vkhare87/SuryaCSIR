import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, FileSpreadsheet, Send } from 'lucide-react';
import { Card } from '../../ui/Cards';
import {
  assembleDivisionReport,
  fetchDirectorWatch,
  fetchDivisionReports,
  sendDivisionReport,
  type DirectorWatchRow,
  type DivisionReportRow,
} from '../../../lib/home/stage5Api';

export function DivisionUpwardReportCard({ divisionCode, todayIso }: { divisionCode: string; todayIso: string }) {
  const [reports, setReports] = useState<DivisionReportRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!divisionCode) return;
    try {
      setReports(await fetchDivisionReports(divisionCode));
    } catch {
      // ignore offline
    }
  }, [divisionCode]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!divisionCode) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <FileSpreadsheet size={13} /> Division Upward Reports (HH4)
        </h2>
        <div className="flex items-center gap-2">
          <Link to="/desk" className="text-xs text-text-muted hover:text-text hover:underline">
            Operations Desk
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const [y, m] = todayIso.split('-').map(Number);
                const from = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
                await assembleDivisionReport(divisionCode, 'MONTHLY', from, todayIso);
                await load();
              } finally {
                setBusy(false);
              }
            }}
            className="px-2.5 py-1 rounded border border-border text-xs text-text hover:bg-surface-hover"
          >
            Assemble monthly draft
          </button>
        </div>
      </div>
      {reports.length === 0 ? (
        <p className="text-xs text-text-muted">No upward reports assembled yet for {divisionCode}.</p>
      ) : (
        <ul className="space-y-2 text-xs">
          {reports.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
              <span>
                <span className="font-mono text-text-muted mr-2">{r.kind}</span>
                {r.period_from} → {r.period_to} · <span className="font-mono">{r.status}</span>
              </span>
              {r.status === 'DRAFT' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await sendDivisionReport(r.id);
                      await load();
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-terracotta text-ivory text-[11px] font-semibold"
                >
                  <Send size={11} /> Send
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DirectorWatchCard() {
  const [items, setItems] = useState<DirectorWatchRow[]>([]);

  useEffect(() => {
    fetchDirectorWatch().then(setItems).catch(() => {});
  }, []);

  return (
    <Card className="p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Eye size={13} /> Critical Briefing &amp; Watch List (DH13)
        </h2>
        <Link to="/desk" className="text-xs text-text-muted hover:text-text hover:underline">
          HQ &amp; Operations Desk
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">No active Director watch items pinned.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {items.map((w) => (
            <li key={w.id} className="flex items-baseline justify-between gap-2 border-b border-border pb-1.5 last:border-0 last:pb-0">
              <span className="text-text font-medium">{w.title}</span>
              <span className="font-mono text-[11px] text-text-muted shrink-0">{w.tag}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
