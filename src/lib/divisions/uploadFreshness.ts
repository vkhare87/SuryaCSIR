import type { ImportEvent } from '../../types';
import { FILE_TYPE_LABELS, type FileType } from '../../utils/dataMigration';

export type UploadStatus = 'fresh' | 'stale' | 'urgent';

export interface DomainUpload {
  domain: FileType;
  label: string;
  lastUploadedAt: string | null;
  uploadedByEmail: string | null;
  cadenceDays: number;
  daysSinceUpload: number | null;
  status: UploadStatus;
}

/**
 * Expected upload cadence per domain, in days. Open question per the design
 * doc (needs one conversation with HR/stores/finance section heads) — these
 * are a reasonable placeholder split by how often the underlying source
 * system actually turns over records, not a confirmed institute policy.
 */
const CADENCE_DAYS: Record<FileType, number> = {
  divisions: 90,
  staff: 90,
  projects: 30,
  projectStaff: 30,
  phd: 90,
  equipment: 90,
  contractStaff: 30,
};

function statusFor(daysSinceUpload: number | null, cadenceDays: number): UploadStatus {
  if (daysSinceUpload === null) return 'urgent';
  if (daysSinceUpload >= cadenceDays * 2) return 'urgent';
  if (daysSinceUpload >= cadenceDays) return 'stale';
  return 'fresh';
}

/** Upload-recency ledger, one row per FileType domain, worst first is left to
 * callers — this returns declaration order (matches the template stepper).
 * Distinct from lib/divisions/freshness.ts's content-recency signal: this one
 * answers "when was this domain last uploaded", not "how recent are the
 * records inside it". */
export function domainUploadLedger(events: ImportEvent[], now: Date = new Date()): DomainUpload[] {
  return (Object.keys(FILE_TYPE_LABELS) as FileType[]).map((domain) => {
    const latest = events
      .filter((e) => e.file_type === domain)
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0] ?? null;

    let daysSinceUpload: number | null = null;
    if (latest) {
      const ms = now.getTime() - new Date(latest.uploaded_at).getTime();
      // Clock skew (future timestamp) clamps to 0 days, not negative.
      daysSinceUpload = Math.max(0, Math.floor(ms / 86_400_000));
    }

    const cadenceDays = CADENCE_DAYS[domain];
    return {
      domain,
      label: FILE_TYPE_LABELS[domain],
      lastUploadedAt: latest?.uploaded_at ?? null,
      uploadedByEmail: latest?.uploaded_by_email ?? null,
      cadenceDays,
      daysSinceUpload,
      status: statusFor(daysSinceUpload, cadenceDays),
    };
  });
}
