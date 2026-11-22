import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck2, ShieldCheck } from 'lucide-react';
import { Card, Badge } from '../ui/Cards';
import {
  approveMinutesVersion,
  attestSignature,
  createMinutesDraft,
  fetchMinutesVersions,
  type MinutesVersionRow,
} from '../../lib/home/stage4Api';

interface MinutesWorkflowPanelProps {
  meetingId: string;
  canRun: boolean;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function MinutesWorkflowPanel({ meetingId, canRun }: MinutesWorkflowPanelProps) {
  const [versions, setVersions] = useState<MinutesVersionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setVersions(await fetchMinutesVersions(meetingId));
    } catch {
      // Offline/non-Supabase fallback
    }
  }, [meetingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const latest = versions[0] ?? null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileCheck2 size={16} className="text-terracotta" />
          <h3 className="text-sm font-medium text-text">Formal Minutes &amp; Attested Sign-off</h3>
          {latest && <Badge variant={latest.status === 'SIGNED' ? 'success' : 'info'}>{latest.status} v{latest.version_no}</Badge>}
        </div>
        {canRun && (!latest || latest.status !== 'SIGNED') && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  await createMinutesDraft(meetingId);
                  await load();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : 'Failed to draft minutes');
                } finally {
                  setBusy(false);
                }
              }}
              className="px-2.5 py-1 rounded border border-border text-xs text-text hover:bg-surface-hover"
            >
              Draft version
            </button>
            {latest && (latest.status === 'DRAFT' || latest.status === 'CIRCULATED') && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    await approveMinutesVersion(latest.id);
                    await load();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Failed to approve');
                  } finally {
                    setBusy(false);
                  }
                }}
                className="px-2.5 py-1 rounded border border-border text-xs text-archive-green hover:bg-surface-hover"
              >
                Approve
              </button>
            )}
            {latest && latest.status === 'APPROVED' && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    const hash = await sha256Hex(latest.body_markdown || latest.id);
                    await attestSignature('minutes_version', latest.id, hash, 'ATTEST');
                    await load();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Failed to attest signature');
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex items-center gap-1 px-3 py-1 rounded bg-terracotta text-ivory text-xs font-semibold"
              >
                <ShieldCheck size={13} /> Attest &amp; sign
              </button>
            )}
          </div>
        )}
      </div>

      {err && <p className="text-xs text-error-crimson">{err}</p>}

      {latest?.verification_code && (
        <p className="text-xs text-text-muted font-mono">
          Signed · Verification:{' '}
          <Link to={`/verify/${latest.verification_code}`} className="text-terracotta hover:underline">
            {latest.verification_code}
          </Link>
        </p>
      )}
    </Card>
  );
}
