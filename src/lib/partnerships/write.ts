import { supabase } from '../../utils/supabaseClient';
import type { MoU, TechTransfer } from '../../types';

type WriteResult = { ok: true } | { ok: false; error: string };

export async function addMoU(input: Omit<MoU, 'id'>): Promise<WriteResult> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.from('mous').insert({
    partner_name: input.partnerName, partner_type: input.partnerType,
    purpose: input.purpose, signed_date: input.signedDate || null,
    valid_until: input.validUntil || null, status: input.status,
    division_code: input.divisionCode || null,
    linked_project_no: input.linkedProjectNo || null, remarks: input.remarks || null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function addTechTransfer(input: Omit<TechTransfer, 'id'>): Promise<WriteResult> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.from('tech_transfers').insert({
    technology_title: input.technologyTitle, licensee: input.licensee,
    licensee_type: input.licenseeType, agreement_type: input.agreementType,
    agreement_date: input.agreementDate || null,
    value_lakhs: input.valueLakhs ?? null, status: input.status,
    linked_project_no: input.linkedProjectNo || null, linked_ip_id: input.linkedIpId || null,
    division_code: input.divisionCode || null, remarks: input.remarks || null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
