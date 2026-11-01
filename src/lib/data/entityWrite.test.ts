import { describe, it, expect, vi, beforeEach } from 'vitest';

let result: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null };
const selectSpy = vi.fn(async () => result);
const eqSpy = vi.fn(() => ({ select: selectSpy }));
const updateSpy = vi.fn(() => ({ eq: eqSpy }));

vi.mock('../../utils/supabaseClient', () => ({
  supabase: { from: () => ({ update: updateSpy }) },
}));

import { updateEntityRecord } from './entityWrite';

describe('updateEntityRecord', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails loudly when RLS filters the UPDATE down to 0 rows', async () => {
    result = { data: [], error: null };
    const res = await updateEntityRecord('projects', 'P-1', { ProjectName: 'X' });
    expect(res).toEqual({ ok: false, error: 'No record was updated — you may not have edit rights on this record, or it no longer exists.' });
    expect(eqSpy).toHaveBeenCalledWith('ProjectID', 'P-1');
    expect(selectSpy).toHaveBeenCalledWith('ProjectID');
  });

  it('succeeds when a row comes back', async () => {
    result = { data: [{ ProjectID: 'P-1' }], error: null };
    expect(await updateEntityRecord('projects', 'P-1', { ProjectName: 'X' })).toEqual({ ok: true });
  });

  it('turns a database error into friendly text (SEC-06)', async () => {
    result = { data: null, error: { code: '23505', message: 'Key ("ProjectID")=(P-1) already exists.' } };
    expect(await updateEntityRecord('projects', 'P-1', {})).toEqual({ ok: false, error: 'That record already exists.' });
  });
});
