import { describe, it, expect } from 'vitest';
import { mapMoURow, mapTechTransferRow, mapContributionRow, mapContributionEventRow, mapStewardRow } from './dataMapper';

describe('mapMoURow', () => {
  it('maps snake_case row to MoU', () => {
    const m = mapMoURow({
      id: 'u1', partner_name: 'IIT Indore', partner_type: 'Academic',
      purpose: 'Joint research', signed_date: '2025-04-01', valid_until: '2028-03-31',
      status: 'Active', division_code: 'LWMD', linked_project_no: 'GAP-101', remarks: null,
    });
    expect(m).toEqual({
      id: 'u1', partnerName: 'IIT Indore', partnerType: 'Academic',
      purpose: 'Joint research', signedDate: '2025-04-01', validUntil: '2028-03-31',
      status: 'Active', divisionCode: 'LWMD', linkedProjectNo: 'GAP-101', remarks: undefined,
    });
  });

  it('defaults missing fields', () => {
    const m = mapMoURow({ id: 7 });
    expect(m.id).toBe('7');
    expect(m.partnerType).toBe('Other');
    expect(m.status).toBe('Active');
    expect(m.linkedProjectNo).toBeUndefined();
  });
});

describe('mapTechTransferRow', () => {
  it('maps row and parses value', () => {
    const t = mapTechTransferRow({
      id: 't1', technology_title: 'Red-mud bricks', licensee: 'ABC Pvt Ltd',
      licensee_type: 'Industry', agreement_type: 'License', agreement_date: '2025-06-15',
      value_lakhs: '25.5', status: 'Active', linked_project_no: 'GAP-101',
      linked_ip_id: 'i9', division_code: 'SCMD', remarks: '',
    });
    expect(t.technologyTitle).toBe('Red-mud bricks');
    expect(t.valueLakhs).toBe(25.5);
    expect(t.linkedIpId).toBe('i9');
  });

  it('defaults missing value to undefined', () => {
    expect(mapTechTransferRow({ id: 1 }).valueLakhs).toBeUndefined();
  });
});

describe('mapContributionRow', () => {
  it('maps snake_case row and defaults prefill', () => {
    const r = mapContributionRow({
      id: 'c1', domain: 'equipment', record_ref: 'UI-1', division_code: 'IMD',
      title: 'Confirm AMC date', reason: 'AMC field empty', link: '/facilities/UI-1',
      requested_by: 'u1', assignee_id: 'u2', delegate_id: null, status: 'open',
      due_date: null, prefill: null, response: null,
      created_at: '2026-11-01T00:00:00Z', resolved_at: null,
    });
    expect(r).toEqual({
      id: 'c1', domain: 'equipment', recordRef: 'UI-1', divisionCode: 'IMD',
      title: 'Confirm AMC date', reason: 'AMC field empty', link: '/facilities/UI-1',
      requestedBy: 'u1', assigneeId: 'u2', delegateId: null, status: 'open',
      dueDate: null, prefill: {}, response: null,
      createdAt: '2026-11-01T00:00:00Z', resolvedAt: null,
    });
  });
});

describe('mapContributionEventRow', () => {
  it('maps an event row', () => {
    const e = mapContributionEventRow({
      id: 'e1', request_id: 'c1', actor_id: null, action: 'created',
      from_status: null, to_status: 'open', note: null, payload: null,
      created_at: '2026-11-01T00:00:00Z',
    });
    expect(e).toEqual({
      id: 'e1', requestId: 'c1', actorId: null, action: 'created',
      fromStatus: null, toStatus: 'open', note: null, payload: {},
      createdAt: '2026-11-01T00:00:00Z',
    });
  });
});

describe('mapStewardRow', () => {
  it('maps cadence_days to cadenceDays', () => {
    const s = mapStewardRow({
      id: 's1', domain: 'equipment', division_code: null, user_id: 'u3',
      kind: 'steward', cadence_days: 30,
    });
    expect(s).toEqual({
      id: 's1', domain: 'equipment', divisionCode: null, userId: 'u3',
      kind: 'steward', cadenceDays: 30,
    });
  });
});
