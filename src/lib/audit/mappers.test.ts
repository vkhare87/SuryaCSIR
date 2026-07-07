import { describe, it, expect } from 'vitest';
import { mapPmsRow, mapModuleRow, summarizeDetails } from './mappers';

describe('audit mappers', () => {
  it('maps a pms_audit_logs row', () => {
    const log = mapPmsRow({
      id: '1', user_id: 'u1', action: 'SUBMIT', entity_type: 'pms_report',
      entity_id: 'r1', details: { status: 'SUBMITTED' }, created_at: '2026-07-01',
    });
    expect(log).toEqual({
      id: '1', source: 'pms', actorId: 'u1', action: 'SUBMIT',
      entityType: 'pms_report', entityId: 'r1',
      details: { status: 'SUBMITTED' }, createdAt: '2026-07-01',
    });
  });

  it('maps an audit_log row (actor_id/changes fields)', () => {
    const log = mapModuleRow({
      id: '2', actor_id: 'u2', action: 'updated', entity_type: 'ticket',
      entity_id: 't1', changes: { old: { status: 'open' }, new: { status: 'closed' } },
      created_at: '2026-07-02',
    });
    expect(log.source).toBe('modules');
    expect(log.actorId).toBe('u2');
    expect(log.details).toEqual({ old: { status: 'open' }, new: { status: 'closed' } });
  });

  it('null details/changes become empty object', () => {
    expect(mapPmsRow({ id: '1', details: null }).details).toEqual({});
    expect(mapModuleRow({ id: '2', changes: null }).details).toEqual({});
  });
});

describe('summarizeDetails', () => {
  it('pms: key/value pairs joined', () => {
    const log = mapPmsRow({ id: '1', details: { from: 'DRAFT', to: 'SUBMITTED' } });
    expect(summarizeDetails(log)).toBe('from: DRAFT · to: SUBMITTED');
  });

  it('modules update: old → new diff', () => {
    const log = mapModuleRow({
      id: '2', changes: { old: { status: 'open' }, new: { status: 'closed' } },
    });
    expect(summarizeDetails(log)).toBe('status: open → closed');
  });

  it('modules insert: preferred keys only, capped at 3', () => {
    const log = mapModuleRow({
      id: '3',
      changes: { name: 'X', subject: 'Y', status: 'open', urgency: 'high', junk: 'z' },
    });
    expect(summarizeDetails(log)).toBe('name: X · subject: Y · status: open');
  });

  it('empty details -> empty string', () => {
    expect(summarizeDetails(mapPmsRow({ id: '1', details: {} }))).toBe('');
  });
});
