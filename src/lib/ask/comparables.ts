import { supabase } from '../../utils/supabaseClient';

/** Budget/timeline facts for a similar-work match, keyed by document_id.
 *  'project_report' matches resolve to the parent project via project_no
 *  (joined against DataContext projects by the caller); 'proposal' matches
 *  carry their own requested budget and proposed timeline. */
export interface ComparableRef {
  kind: 'project_report' | 'proposal';
  projectNo?: string;
  proposal?: {
    requestedBudget: number;
    proposedStartDate: string;
    proposedDurationMonths: number;
    status: string;
  };
}

export async function resolveComparables(
  documentIds: string[],
): Promise<Record<string, ComparableRef>> {
  if (!supabase || documentIds.length === 0) return {};
  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, entity_type, entity_id')
    .in('id', documentIds);
  if (error || !docs) return {};

  const out: Record<string, ComparableRef> = {};
  const reportIds: { docId: string; entityId: string }[] = [];
  const proposalIds: { docId: string; entityId: string }[] = [];
  for (const d of docs) {
    if (d.entity_type === 'project_report') reportIds.push({ docId: d.id, entityId: d.entity_id });
    if (d.entity_type === 'proposal') proposalIds.push({ docId: d.id, entityId: d.entity_id });
  }

  const [reportsRes, proposalsRes] = await Promise.all([
    reportIds.length > 0
      ? supabase.from('project_reports').select('id, project_no').in('id', reportIds.map((r) => r.entityId))
      : Promise.resolve({ data: null }),
    proposalIds.length > 0
      ? supabase
          .from('proposals')
          .select('id, requested_budget, proposed_start_date, proposed_duration_months, status')
          .in('id', proposalIds.map((p) => p.entityId))
      : Promise.resolve({ data: null }),
  ]);

  if (reportsRes.data) {
    const reportById = new Map(reportsRes.data.map((r) => [r.id, r]));
    for (const { docId, entityId } of reportIds) {
      const rep = reportById.get(entityId);
      if (rep) out[docId] = { kind: 'project_report', projectNo: rep.project_no };
    }
  }

  if (proposalsRes.data) {
    const proposalById = new Map(proposalsRes.data.map((p) => [p.id, p]));
    for (const { docId, entityId } of proposalIds) {
      const prop = proposalById.get(entityId);
      if (prop) {
        out[docId] = {
          kind: 'proposal',
          proposal: {
            requestedBudget: Number(prop.requested_budget) || 0,
            proposedStartDate: prop.proposed_start_date ?? '',
            proposedDurationMonths: Number(prop.proposed_duration_months) || 0,
            status: prop.status ?? '',
          },
        };
      }
    }
  }
  return out;
}
