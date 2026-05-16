/* eslint-disable react-refresh/only-export-components */
import {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode,
} from 'react';
import { supabase, isProvisioned } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';
import {
  mapProposalRow, mapCoPIRow, mapDocumentRow, mapHistoryRow,
} from '../utils/proposalMappers';
import type { Proposal, ProposalCoPI } from '../types/proposal';

interface ProposalsContextType {
  proposals: Proposal[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getProposal: (id: string) => Promise<Proposal>;
  createDraft: (input: Partial<Proposal> & { title: string }, coPIs: ProposalCoPI[]) => Promise<Proposal>;
  updateDraft: (id: string, input: Partial<Proposal>, coPIs: ProposalCoPI[]) => Promise<void>;
}

const ProposalsContext = createContext<ProposalsContextType | undefined>(undefined);

export function useProposals() {
  const ctx = useContext(ProposalsContext);
  if (ctx === undefined) throw new Error('useProposals must be used within a ProposalsProvider');
  return ctx;
}

export function ProposalsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const provisioned = isProvisioned();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!provisioned || !supabase || !user) {
      setProposals([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('proposals')
        .select('*')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setProposals((data ?? []).map(mapProposalRow));
    } catch (e) {
      console.error('[proposals] refresh failed', e);
      setError((e as Error).message);
      setProposals([]);
    } finally {
      setIsLoading(false);
    }
  }, [provisioned, user]);

  useEffect(() => { refresh(); }, [refresh]);

  const getProposal = useCallback(async (id: string): Promise<Proposal> => {
    if (!supabase) throw new Error('Database not provisioned');
    const [pRes, cRes, dRes, hRes] = await Promise.all([
      supabase.from('proposals').select('*').eq('id', id).single(),
      supabase.from('proposal_copis').select('*').eq('proposal_id', id),
      supabase.from('proposal_documents').select('*').eq('proposal_id', id)
        .order('uploaded_at', { ascending: false }),
      supabase.from('proposal_status_history').select('*').eq('proposal_id', id)
        .order('changed_at', { ascending: true }),
    ]);
    if (pRes.error) throw pRes.error;
    const proposal = mapProposalRow(pRes.data);
    proposal.coPIs     = (cRes.data ?? []).map(mapCoPIRow);
    proposal.documents = (dRes.data ?? []).map(mapDocumentRow);
    proposal.history   = (hRes.data ?? []).map(mapHistoryRow);
    return proposal;
  }, []);

  const createDraft = useCallback(
    async (input: Partial<Proposal> & { title: string }, coPIs: ProposalCoPI[]) => {
      if (!supabase || !user) throw new Error('Not authenticated');
      const insertRow = {
        title: input.title,
        acronym: input.acronym ?? null,
        domain_theme: input.domainTheme ?? '',
        fund_type: input.fundType ?? '',
        sponsor_type: input.sponsorType ?? '',
        sponsor_name: input.sponsorName ?? '',
        project_category: input.projectCategory ?? '',
        proposed_start_date: input.proposedStartDate ?? new Date().toISOString().slice(0, 10),
        proposed_duration_months: input.proposedDurationMonths ?? 1,
        requested_budget: input.requestedBudget ?? 0,
        pi_user_id: user.id,
        pi_name: input.piName ?? user.email,
        division_code: input.divisionCode ?? user.divisionCode ?? '',
        abstract: input.abstract ?? '',
        problem_statement: input.problemStatement ?? '',
        objectives: input.objectives ?? '',
        expected_outcomes: input.expectedOutcomes ?? '',
        current_trl: input.currentTrl ?? null,
        target_trl: input.targetTrl ?? null,
        status: 'DRAFT' as const,
        created_by: user.id,
      };
      const { data, error: err } = await supabase
        .from('proposals')
        .insert(insertRow)
        .select()
        .single();
      if (err || !data) throw err ?? new Error('Insert failed');
      const proposal = mapProposalRow(data);

      if (coPIs.length > 0) {
        const { error: copErr } = await supabase
          .from('proposal_copis')
          .insert(coPIs.map((c) => ({
            proposal_id: proposal.id, staff_id: c.staffId, staff_name: c.staffName,
          })));
        if (copErr) throw copErr;
      }
      await refresh();
      return proposal;
    },
    [user, refresh],
  );

  const updateDraft = useCallback(
    async (id: string, input: Partial<Proposal>, coPIs: ProposalCoPI[]) => {
      if (!supabase) throw new Error('Database not provisioned');
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.title !== undefined)                  patch.title = input.title;
      if (input.acronym !== undefined)                patch.acronym = input.acronym;
      if (input.domainTheme !== undefined)            patch.domain_theme = input.domainTheme;
      if (input.fundType !== undefined)               patch.fund_type = input.fundType;
      if (input.sponsorType !== undefined)            patch.sponsor_type = input.sponsorType;
      if (input.sponsorName !== undefined)            patch.sponsor_name = input.sponsorName;
      if (input.projectCategory !== undefined)        patch.project_category = input.projectCategory;
      if (input.proposedStartDate !== undefined)      patch.proposed_start_date = input.proposedStartDate;
      if (input.proposedDurationMonths !== undefined) patch.proposed_duration_months = input.proposedDurationMonths;
      if (input.requestedBudget !== undefined)        patch.requested_budget = input.requestedBudget;
      if (input.divisionCode !== undefined)           patch.division_code = input.divisionCode;
      if (input.abstract !== undefined)               patch.abstract = input.abstract;
      if (input.problemStatement !== undefined)       patch.problem_statement = input.problemStatement;
      if (input.objectives !== undefined)             patch.objectives = input.objectives;
      if (input.expectedOutcomes !== undefined)       patch.expected_outcomes = input.expectedOutcomes;
      if (input.currentTrl !== undefined)             patch.current_trl = input.currentTrl;
      if (input.targetTrl !== undefined)              patch.target_trl = input.targetTrl;

      const { error: err } = await supabase.from('proposals').update(patch).eq('id', id);
      if (err) throw err;

      const { error: delErr } = await supabase.from('proposal_copis').delete().eq('proposal_id', id);
      if (delErr) throw delErr;
      if (coPIs.length > 0) {
        const { error: insErr } = await supabase
          .from('proposal_copis')
          .insert(coPIs.map((c) => ({
            proposal_id: id, staff_id: c.staffId, staff_name: c.staffName,
          })));
        if (insErr) throw insErr;
      }
      await refresh();
    },
    [refresh],
  );

  return (
    <ProposalsContext.Provider value={{
      proposals, isLoading, error, refresh, getProposal, createDraft, updateDraft,
    }}>
      {children}
    </ProposalsContext.Provider>
  );
}
