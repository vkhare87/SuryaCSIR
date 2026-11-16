/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';
import { usePMS } from './PMSContext';
import { useProposals } from './ProposalsContext';
import { useProjectReports } from './ProjectReportsContext';
import { deriveMyActions, type MyAction } from '../lib/dashboard/myActions';
import { myChangeSteps, myClosureItems, myDueSlots } from '../lib/projects/projectFileApi';
import { callerStaffId } from '../lib/home/api';
import { loadPriorities, splitPriorities } from '../lib/home/priorities';
import type { WorkPriority } from '../lib/home/priorities';
import { rankActions } from '../lib/home/doNext';
import { doneToday, localIso, mergeSeen } from '../lib/home/today';
import type { ClosureItem, DueSlot, MyChangeStep } from '../types/projectFile';
import type { StaffMember } from '../types';

interface HomeContextType {
  /** staff."ID" linked to this account; null when none (or while loading). */
  staffId: string | null;
  ownStaff: StaffMember | null;
  /** True once the staff link has been looked up. */
  staffResolved: boolean;
  /** Open items for this user, ranked for the home screen. */
  actions: MyAction[];
  /** Items that were open earlier today and are closed now. */
  doneCount: number;
  /** Keys the role half shows; the common half leaves them out (one item, one place). */
  claimed: ReadonlySet<string>;
  claim: (keys: string[]) => void;
  /** Open priorities a senior pinned on me, soonest first. */
  prioritiesForMe: WorkPriority[];
  /** Priorities I pinned on others: open ones, and those closed in the last 14 days. */
  prioritiesAsked: WorkPriority[];
  refreshPriorities: () => void;
}

const HomeContext = createContext<HomeContextType | undefined>(undefined);

export function useHome() {
  const ctx = useContext(HomeContext);
  if (ctx === undefined) throw new Error('useHome must be used within a HomeProvider');
  return ctx;
}

/** The role half calls this with the keys it shows. */
export function useClaim(keys: string[]) {
  const { claim } = useHome();
  const joined = keys.join('|');
  useEffect(() => {
    claim(joined ? joined.split('|') : []);
    return () => claim([]);
  }, [claim, joined]);
}

// A view convenience only (the "done today" ring). Never a source of truth.
function readSeen(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as string[]; } catch { return []; }
}
function writeSeen(key: string, ids: string[]) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* private window */ }
}

/** Mounted by the home page only, so its reads do not run at login for other pages. */
export function HomeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { staff, actionItems, tickets, contractStaff, contributionRequests, dataStewards } = useData();
  const { reports, evaluations } = usePMS();
  const { proposals } = useProposals();
  const { reports: progressReports } = useProjectReports();

  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffResolved, setStaffResolved] = useState(false);
  const [dueSlots, setDueSlots] = useState<DueSlot[]>([]);
  const [changeSteps, setChangeSteps] = useState<MyChangeStep[]>([]);
  const [closureItems, setClosureItems] = useState<ClosureItem[]>([]);

  const userId = user?.id;
  const [priorities, setPriorities] = useState<WorkPriority[]>([]);
  const [prioritiesTick, setPrioritiesTick] = useState(0);
  const refreshPriorities = useCallback(() => setPrioritiesTick(t => t + 1), []);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadPriorities().then((p) => { if (!cancelled) setPriorities(p); });
    return () => { cancelled = true; };
  }, [userId, prioritiesTick]);
  const split = useMemo(() => splitPriorities(priorities, userId ?? ''), [priorities, userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    callerStaffId().then((id) => { if (!cancelled) { setStaffId(id); setStaffResolved(true); } });
    myDueSlots().then((s) => { if (!cancelled) setDueSlots(s); }, () => {});
    myChangeSteps().then((s) => { if (!cancelled) setChangeSteps(s); }, () => {});
    myClosureItems().then((s) => { if (!cancelled) setClosureItems(s); }, () => {});
    return () => { cancelled = true; };
  }, [userId]);

  const ownStaff = useMemo(
    () => (staffId ? staff.find(s => s.ID === staffId) ?? null : null),
    [staff, staffId],
  );

  const actions = useMemo(() => {
    if (!user) return [];
    return rankActions(deriveMyActions({
      userId: user.id,
      // Committee action items and contract rows hold a name, not a staff ID, until CM0.
      staffName: ownStaff?.Name ?? '',
      role: user.activeRole,
      reports, evaluations, proposals, progressReports, actionItems, tickets, staff, contractStaff,
      roles: user.roles,
      contributions: contributionRequests,
      stewards: dataStewards,
      dueSlots, changeSteps, closureItems,
    }));
  }, [user, ownStaff, reports, evaluations, proposals, progressReports, actionItems, tickets, staff, contractStaff,
      contributionRequests, dataStewards, dueSlots, changeSteps, closureItems]);

  // Per role: each role has its own list, so a role switch must not count as work done.
  const seenKey = user ? `surya_home_seen_${user.id}_${user.activeRole}_${localIso(new Date())}` : '';
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    if (!seenKey) return;
    const merged = mergeSeen(readSeen(seenKey), actions.map(a => a.id));
    writeSeen(seenKey, merged);
    setSeen(merged);
  }, [seenKey, actions]);

  const [claimed, setClaimed] = useState<ReadonlySet<string>>(new Set());
  const claim = useCallback((keys: string[]) => setClaimed(new Set(keys)), []);

  const value = useMemo<HomeContextType>(() => ({
    staffId, ownStaff, staffResolved, actions,
    doneCount: doneToday(seen, actions.map(a => a.id)),
    claimed, claim,
    prioritiesForMe: split.forMe, prioritiesAsked: split.askedByMe, refreshPriorities,
  }), [staffId, ownStaff, staffResolved, actions, seen, claimed, claim, split, refreshPriorities]);

  return <HomeContext.Provider value={value}>{children}</HomeContext.Provider>;
}
