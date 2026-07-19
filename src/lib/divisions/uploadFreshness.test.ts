import { describe, it, expect } from 'vitest';
import { domainUploadLedger } from './uploadFreshness';
import type { ImportEvent } from '../../types';

const ev = (file_type: string, uploaded_at: string): ImportEvent => ({
  id: uploaded_at, file_type, row_count: 1,
  uploaded_by: 'u1', uploaded_by_email: 'a@b.c', uploaded_at,
});

describe('domainUploadLedger', () => {
  const now = new Date('2026-07-19T12:00:00Z');

  it('never-uploaded domains are urgent with null days', () => {
    const staff = domainUploadLedger([], now).find((d) => d.domain === 'staff')!;
    expect(staff.status).toBe('urgent');
    expect(staff.daysSinceUpload).toBeNull();
  });

  it('uses the latest event per domain and classifies fresh/stale/urgent', () => {
    const rows = domainUploadLedger([
      ev('staff', '2026-07-01T00:00:00Z'),   // 18d < 90 → fresh
      ev('staff', '2026-01-01T00:00:00Z'),   // older, ignored
      ev('projects', '2026-06-01T00:00:00Z'), // 48d ≥ 30 → stale
      ev('contractStaff', '2026-01-01T00:00:00Z'), // 199d ≥ 60 → urgent
    ], now);
    const by = Object.fromEntries(rows.map((r) => [r.domain, r]));
    expect(by.staff.status).toBe('fresh');
    expect(by.staff.daysSinceUpload).toBe(18);
    expect(by.projects.status).toBe('stale');
    expect(by.contractStaff.status).toBe('urgent');
  });

  it('clamps future timestamps to 0 days (clock skew)', () => {
    const rows = domainUploadLedger([ev('staff', '2026-07-20T00:00:00Z')], now);
    expect(rows.find((d) => d.domain === 'staff')!.daysSinceUpload).toBe(0);
  });
});
