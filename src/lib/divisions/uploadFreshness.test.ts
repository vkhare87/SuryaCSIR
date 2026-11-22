import { describe, it, expect } from 'vitest';
import { domainUploadLedger } from './uploadFreshness';
import type { DataSteward, ImportEvent } from '../../types';

const ev = (file_type: string, uploaded_at: string, division_code: string | null = null): ImportEvent => ({
  id: `${uploaded_at}:${division_code ?? 'all'}`, file_type, row_count: 1, division_code,
  uploaded_by: 'u1', uploaded_by_email: 'a@b.c', uploaded_at,
});

describe('domainUploadLedger', () => {
  const now = new Date('2026-07-19T12:00:00Z');

  it('never-uploaded domains are urgent with null days', () => {
    const staff = domainUploadLedger([], [], now).find((d) => d.domain === 'staff')!;
    expect(staff.status).toBe('urgent');
    expect(staff.daysSinceUpload).toBeNull();
  });

  it('uses the latest event per domain and classifies fresh/stale/urgent', () => {
    const rows = domainUploadLedger([
      ev('staff', '2026-07-01T00:00:00Z'),   // 18d < 90 → fresh
      ev('staff', '2026-01-01T00:00:00Z'),   // older, ignored
      ev('projects', '2026-06-01T00:00:00Z'), // 48d ≥ 30 → stale
      ev('contractStaff', '2026-01-01T00:00:00Z'), // 199d ≥ 60 → urgent
    ], [], now);
    const by = Object.fromEntries(rows.map((r) => [r.domain, r]));
    expect(by.staff.status).toBe('fresh');
    expect(by.staff.daysSinceUpload).toBe(18);
    expect(by.projects.status).toBe('stale');
    expect(by.contractStaff.status).toBe('urgent');
  });

  it('clamps future timestamps to 0 days (clock skew)', () => {
    const rows = domainUploadLedger([ev('staff', '2026-07-20T00:00:00Z')], [], now);
    expect(rows.find((d) => d.domain === 'staff')!.daysSinceUpload).toBe(0);
  });

  it('marks a domain with no steward rows as no-owner', () => {
    const steward: DataSteward = { id: 's1', domain: 'staff', divisionCode: null, userId: 'u1', kind: 'steward', cadenceDays: 90 };
    const rows = domainUploadLedger([], [steward], now);
    const by = Object.fromEntries(rows.map((r) => [r.domain, r]));
    expect(by.staff.ownerStatus).toBe('owned');
    expect(by.staff.owners).toEqual([steward]);
    expect(by.equipment.ownerStatus).toBe('no-owner');
    expect(by.equipment.owners).toEqual([]);
  });

  it('uses the steward cadence over the default', () => {
    const rows = domainUploadLedger(
      [ev('equipment', '2026-06-09T12:00:00Z')], // 40 days ago
      [
        { id: 's1', domain: 'equipment', divisionCode: null, userId: 'u1', kind: 'steward', cadenceDays: 60 },
        { id: 's2', domain: 'equipment', divisionCode: 'D1', userId: 'u2', kind: 'steward', cadenceDays: 30 },
      ],
      now,
    );
    const eq = rows.find((d) => d.domain === 'equipment')!;
    expect(eq.daysSinceUpload).toBe(40);
    expect(eq.cadenceDays).toBe(30);
    expect(eq.status).toBe('stale');
  });

  it('tracks division-scoped uploads separately when divisionCode is supplied', () => {
    const events = [
      ev('staff', '2026-07-10T00:00:00Z', 'CMPD'),
      ev('staff', '2026-01-01T00:00:00Z', 'IMD'),
    ];
    const cmpd = domainUploadLedger(events, [], now, 'CMPD').find((d) => d.domain === 'staff')!;
    const imd = domainUploadLedger(events, [], now, 'IMD').find((d) => d.domain === 'staff')!;
    const other = domainUploadLedger(events, [], now, 'NST').find((d) => d.domain === 'staff')!;
    expect(cmpd.status).toBe('fresh');
    expect(cmpd.divisionsUploaded).toEqual(['CMPD', 'IMD']);
    expect(imd.status).toBe('urgent');
    expect(other.daysSinceUpload).toBeNull();
    expect(other.status).toBe('urgent');
  });
});
