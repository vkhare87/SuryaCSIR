/* eslint-disable react-refresh/only-export-components */
import {
  createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode,
} from 'react';
import { supabase, isProvisioned } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';
import {
  mapProposalRow, mapCoPIRow, mapDocumentRow, mapHistoryRow, toProposalRowPatch,
  mapBudgetLineRow, mapReviewStepRow, mapReviewCommentRow,
} from '../utils/proposalMappers';
import type { Proposal, ProposalCoPI } from '../types/proposal';
import { fetchAll } from '../lib/data/fetchAll';
import { friendlyError } from '../lib/errors';

interface ProposalsContextType {
  proposals: Proposal[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getProposal: (id: string) => Promise<Proposal>;
  startIdea: (title: string, piName: string, parentProjectId?: string | null) => Promise<Proposal>;
  saveFields: (id: string, patch: Partial<Proposal>) => Promise<void>;
  saveCoPIs: (id: string, coPIs: ProposalCoPI[]) => Promise<void>;
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
  const userId = user?.id ?? null;
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!provisioned || !supabase || !userId) {
      setProposals([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: err } = await fetchAll(supabase
        .from('proposals')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id'));
      if (err) throw err;
      setProposals((data ?? []).map(mapProposalRow));
    } catch (e) {
      console.error('[proposals] refresh failed', e);
      setError(friendlyError(e));
      setProposals([]);
    } finally {
      setIsLoading(false);
    }
  }, [provisioned, userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const getProposal = useCallback(async (id: string): Promise<Proposal> => {
    if (!supabase) throw new Error('Database not provisioned');
    const [pRes, cRes, dRes, hRes, bRes, sRes, kRes] = await Promise.all([
      supabase.from('proposals').select('*').eq('id', id).single(),
      supabase.from('proposal_copis').select('*').eq('proposal_id', id),
      supabase.from('proposal_documents').select('*').eq('proposal_id', id)
        .order('uploaded_at', { ascending: false }),
      supabase.from('proposal_status_history').select('*').eq('proposal_id', id)
        .order('changed_at', { ascending: true }),
      supabase.from('proposal_budget_lines').select('*').eq('proposal_id', id)
        .order('fiscal_year').order('created_at'),
      supabase.from('proposal_review_steps').select('*').eq('proposal_id', id)
        .order('round').order('seq'),
      supabase.from('proposal_review_comments').select('*').eq('proposal_id', id)
        .order('created_at'),
    ]);
    if (pRes.error) throw pRes.error;
    const proposal = mapProposalRow(pRes.data);
    proposal.coPIs     = (cRes.data ?? []).map(mapCoPIRow);
    proposal.documents = (dRes.data ?? []).map(mapDocumentRow);
    proposal.history   = (hRes.data ?? []).map(mapHistoryRow);
    // Tables from 20261111000001; empty until it is applied.
    proposal.budgetLines = (bRes.data ?? []).map(mapBudgetLineRow);
    proposal.steps       = (sRes.data ?? []).map(mapReviewStepRow);
    proposal.comments    = (kRes.data ?? []).map(mapReviewCommentRow);
    return proposal;
  }, []);

  // A private draft from a title alone. Everything else is optional until submit.
  const startIdea = useCallback(async (title: string, piName: string, parentProjectId: string | null = null): Promise<Proposal> => {
    if (!supabase || !user) throw new Error('Not authenticated');
    const { data, error: err } = await supabase
      .from('proposals')
      .insert({
        title,
        pi_user_id: user.id,
        pi_name: piName || user.email,
        created_by: user.id,
        status: 'DRAFT',
        track: 'ULIP',
        division_code: user.divisionCode,
        ...(parentProjectId ? { parent_project_id: parentProjectId } : {}),
      })
      .select()
      .single();
    if (err || !data) throw err ?? new Error('Insert failed');
    const proposal = mapProposalRow(data);
    setProposals((prev) => [proposal, ...prev]);
    return proposal;
  }, [user]);

  // Autosave path: writes only the changed fields and patches the list in
  // place — no refetch, so it is cheap enough to run as the PI types.
  const saveFields = useCallback(async (id: string, patch: Partial<Proposal>): Promise<void> => {
    if (!supabase) throw new Error('Database not provisioned');
    const row = toProposalRowPatch(patch);
    if (Object.keys(row).length === 0) return;
    const { error: err } = await supabase
      .from('proposals').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id);
    if (err) throw err;
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const saveCoPIs = useCallback(async (id: string, coPIs: ProposalCoPI[]): Promise<void> => {
    if (!supabase) throw new Error('Database not provisioned');
    const payload = coPIs.map((c) => ({ staff_id: c.staffId, staff_name: c.staffName }));
    if (typeof supabase.rpc === 'function') {
      const { error: rpcErr } = await supabase.rpc('proposal_save_copis', {
        p_proposal_id: id,
        p_copis: payload,
      });
      if (rpcErr) throw rpcErr;
      return;
    }
    const { error: delErr } = await supabase.from('proposal_copis').delete().eq('proposal_id', id);
    if (delErr) throw delErr;
    if (coPIs.length === 0) return;
    const { error: insErr } = await supabase
      .from('proposal_copis')
      .insert(payload.map((c) => ({ proposal_id: id, ...c })));
    if (insErr) throw insErr;
  }, []);

  const value = useMemo(() => ({
    proposals, isLoading, error, refresh, getProposal, startIdea, saveFields, saveCoPIs,
  }), [proposals, isLoading, error, refresh, getProposal, startIdea, saveFields, saveCoPIs]);

  return (
    <ProposalsContext.Provider value={value}>
      {children}
    </ProposalsContext.Provider>
  );
}
