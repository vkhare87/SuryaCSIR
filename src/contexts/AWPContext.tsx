/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { supabase, isProvisioned } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';
import { mapAWPRow, mapAWPRevisionRow } from '../utils/pmsMappers';
import type { AWPContent, AWPVerdict, PMSAWP, PMSAWPRevision } from '../types/pms';
import { fetchAll } from '../lib/data/fetchAll';

export interface AWPImportInput {
  staffId: string;
  year: string;
  content: AWPContent;
  status: 'APPROVED' | 'WITH_DIRECTOR' | 'WITH_RO';
  pdf: File;
  roVerdict?: AWPVerdict;
  roDate?: string;
  approvedDate?: string;
}

interface AWPContextType {
  awps: PMSAWP[];
  revisions: PMSAWPRevision[];
  /** The signed-in user's staff."ID", or null when they have no staff row. */
  myStaffId: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  awpFor: (staffId: string, year: string) => PMSAWP | undefined;
  saveDraft: (staffId: string, year: string, content: AWPContent) => Promise<string>;
  submit: (id: string) => Promise<void>;
  /** `content` only for a blank-forwarded AWP the RO fills in (§5.E.a.iii). */
  roReview: (id: string, verdict: AWPVerdict, reasons: string, content?: AWPContent) => Promise<void>;
  rvoReview: (id: string, remarks: string) => Promise<void>;
  directorDecide: (id: string, decision: 'ACCEPTED' | 'MODIFIED', remarks: string, content?: AWPContent) => Promise<void>;
  returnAWP: (id: string, reasons: string) => Promise<void>;
  forwardBlank: (staffId: string, year: string) => Promise<void>;
  importAWP: (input: AWPImportInput) => Promise<string>;
  requestRevision: (id: string, reasons: string, after: AWPContent) => Promise<void>;
  decideRevision: (revisionId: string, approve: boolean, remarks: string) => Promise<void>;
  getSignedPdfUrl: (path: string) => Promise<string>;
  /** Committee view: the report's AWP with confidential projects removed by the server. */
  awpForReport: (reportId: string) => Promise<PMSAWP | null>;
  setReviewingOfficer: (id: string, staffId: string | null) => Promise<void>;
}

const AWPContext = createContext<AWPContextType | undefined>(undefined);

export function useAWP() {
  const ctx = useContext(AWPContext);
  if (ctx === undefined) throw new Error('useAWP must be used within an AWPProvider');
  return ctx;
}

function client() {
  if (!supabase) throw new Error('Supabase not provisioned');
  return supabase;
}

export function AWPProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const provisioned = isProvisioned();

  const [awps, setAwps] = useState<PMSAWP[]>([]);
  const [revisions, setRevisions] = useState<PMSAWPRevision[]>([]);
  const [myStaffId, setMyStaffId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!provisioned || !supabase || !user) {
        setAwps([]);
        setRevisions([]);
        setMyStaffId(null);
        return;
      }
      const [awpRes, revRes, staffRes] = await Promise.all([
        fetchAll(supabase.from('pms_awps').select('*').order('updated_at', { ascending: false }).order('id')),
        fetchAll(supabase.from('pms_awp_revisions').select('*').order('created_at', { ascending: false }).order('id')),
        supabase.rpc('caller_staff_id'),
      ]);
      if (awpRes.error) throw awpRes.error;
      setAwps(awpRes.data ? awpRes.data.map(r => mapAWPRow(r as Record<string, unknown>)) : []);
      setRevisions(revRes.data ? revRes.data.map(r => mapAWPRevisionRow(r as Record<string, unknown>)) : []);
      setMyStaffId((staffRes.data as string | null) ?? null);
    } catch (e) {
      console.error('[awp] load failed', e);
      setError(e instanceof Error ? e.message : 'Failed to load Annual Work Plans');
      setAwps([]);
      setRevisions([]);
    } finally {
      setIsLoading(false);
    }
  }, [provisioned, user]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Every write is an RPC; reload afterwards so status/timestamps come from the DB.
  const call = useCallback(async <T = void,>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error: err } = await client().rpc(fn, args);
    if (err) throw new Error(err.message);
    await refresh();
    return data as T;
  }, [refresh]);

  const awpFor = useCallback((staffId: string, year: string) =>
    awps.find(a => a.staffId === staffId && a.reportingYear === year), [awps]);

  const saveDraft = useCallback((staffId: string, year: string, content: AWPContent) =>
    call<string>('pms_awp_save_draft', { p_staff_id: staffId, p_year: year, p_payload: content }), [call]);

  const submit = useCallback((id: string) => call('pms_awp_submit', { p_awp_id: id }), [call]);

  const roReview = useCallback((id: string, verdict: AWPVerdict, reasons: string, content?: AWPContent) =>
    call('pms_awp_ro_review', { p_awp_id: id, p_verdict: verdict, p_reasons: reasons || null, p_payload: content ?? null }), [call]);

  const rvoReview = useCallback((id: string, remarks: string) =>
    call('pms_awp_rvo_review', { p_awp_id: id, p_remarks: remarks }), [call]);

  const directorDecide = useCallback((id: string, decision: 'ACCEPTED' | 'MODIFIED', remarks: string, content?: AWPContent) =>
    call('pms_awp_director_decide', {
      p_awp_id: id, p_decision: decision, p_remarks: remarks || null, p_payload: content ?? null,
    }), [call]);

  const returnAWP = useCallback((id: string, reasons: string) =>
    call('pms_awp_return', { p_awp_id: id, p_reasons: reasons }), [call]);

  const forwardBlank = useCallback(async (staffId: string, year: string) => {
    await call('pms_awp_forward_blank', { p_staff_id: staffId, p_year: year });
  }, [call]);

  const importAWP = useCallback(async (input: AWPImportInput): Promise<string> => {
    const sb = client();
    // Fail before uploading: a retry must not leave another orphan PDF.
    if (awpFor(input.staffId, input.year)) throw new Error('AWP already exists for this scientist and year');
    // Upload first so the RPC can record the path; an RPC failure leaves an
    // orphan admin-only file, which is cheaper than an AWP without its proof.
    const path = `import/${crypto.randomUUID()}.pdf`;
    const { error: upErr } = await sb.storage.from('awp-pdfs').upload(path, input.pdf, {
      contentType: 'application/pdf',
    });
    if (upErr) throw new Error(upErr.message);
    return call<string>('pms_awp_import', {
      p_staff_id: input.staffId,
      p_year: input.year,
      p_payload: input.content,
      p_status: input.status,
      p_pdf_path: path,
      p_ro_verdict: input.roVerdict ?? null,
      p_ro_date: input.roDate || null,
      p_approved_date: input.approvedDate || null,
    });
  }, [awpFor, call]);

  const requestRevision = useCallback(async (id: string, reasons: string, after: AWPContent) => {
    await call('pms_awp_request_revision', { p_awp_id: id, p_reasons: reasons, p_after: after });
  }, [call]);

  const decideRevision = useCallback((revisionId: string, approve: boolean, remarks: string) =>
    call('pms_awp_decide_revision', { p_revision_id: revisionId, p_approve: approve, p_remarks: remarks || null }), [call]);

  const getSignedPdfUrl = useCallback(async (path: string): Promise<string> => {
    const { data, error: err } = await client().storage.from('awp-pdfs').createSignedUrl(path, 3600);
    if (err || !data) throw new Error(err?.message ?? 'Could not open PDF');
    return data.signedUrl;
  }, []);

  const awpForReport = useCallback(async (reportId: string): Promise<PMSAWP | null> => {
    const { data, error: err } = await client().rpc('pms_awp_for_report', { p_report_id: reportId });
    if (err) throw new Error(err.message);
    const row = (data as Record<string, unknown>[] | null)?.[0];
    return row ? mapAWPRow(row) : null;
  }, []);

  const setReviewingOfficer = useCallback((id: string, staffId: string | null) =>
    call('pms_awp_set_reviewing_officer', { p_awp_id: id, p_staff_id: staffId }), [call]);

  const value = useMemo(() => ({
    awps, revisions, myStaffId, isLoading, error, refresh, awpFor,
    saveDraft, submit, roReview, rvoReview, directorDecide, returnAWP, forwardBlank,
    importAWP, requestRevision, decideRevision, getSignedPdfUrl, awpForReport, setReviewingOfficer,
  }), [
    awps, revisions, myStaffId, isLoading, error, refresh, awpFor,
    saveDraft, submit, roReview, rvoReview, directorDecide, returnAWP, forwardBlank,
    importAWP, requestRevision, decideRevision, getSignedPdfUrl, awpForReport, setReviewingOfficer,
  ]);

  return (
    <AWPContext.Provider value={value}>
      {children}
    </AWPContext.Provider>
  );
}
