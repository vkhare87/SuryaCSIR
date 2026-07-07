import { describe, it, expect } from 'vitest';
import { mapMoURow } from './dataMapper';

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
