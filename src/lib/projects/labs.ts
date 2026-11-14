import { supabase } from '../../utils/supabaseClient';

// Multi-lab projects (EP1, 20261113000009). Writes are PME RPCs.
export const HOME_LAB = 'AMPRI';

export interface LabMoney { lab_code: string; role: 'NODAL' | 'PARTICIPATING' | null; sanctioned: number; received: number; spent: number; balance: number }

function client() {
  if (!supabase) throw new Error('Database not provisioned');
  return supabase;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const loadLabMoney = async (projectId: string): Promise<LabMoney[]> =>
  ((await rpc<Record<string, unknown>[] | null>('project_lab_money', { p_project_id: projectId })) ?? []).map(r => ({
    lab_code: String(r.lab_code), role: (r.role as LabMoney['role']) ?? null,
    sanctioned: Number(r.sanctioned), received: Number(r.received), spent: Number(r.spent), balance: Number(r.balance),
  }));

export const ipAgreementMissing = (projectId: string) => rpc<boolean>('project_ip_agreement_missing', { p_project_id: projectId });

export const setLab = (projectId: string, labCode: string, role: 'NODAL' | 'PARTICIPATING', rcDocumentId: string | null) =>
  rpc('project_lab_set', { p_project_id: projectId, p_lab_code: labCode, p_role: role, p_rc_document_id: rcDocumentId });

export const setEntryLab = (kind: 'receipt' | 'expenditure' | 'budget', id: string, labCode: string) =>
  rpc('project_entry_set_lab', { p_kind: kind, p_id: id, p_lab_code: labCode });

export const addIpAgreement = (projectId: string, documentId: string, signedOn: string) =>
  rpc('project_ip_agreement_add', { p_project_id: projectId, p_document_id: documentId, p_signed_on: signedOn });
