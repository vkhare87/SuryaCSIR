/* eslint-disable react-refresh/only-export-components */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';
import { usePMS } from './PMSContext';
import { useProposals } from './ProposalsContext';
import { useProjectReports } from './ProjectReportsContext';
import { supabase } from '../utils/supabaseClient';
import { deriveMyActions } from '../lib/dashboard/myActions';
import { myChangeSteps, myClosureItems, myDueSlots } from '../lib/projects/projectFileApi';
import { classifyAction, summarizeByGroup, type HomeAction, type HomeGroup } from '../lib/home/classify';
import { canSnoozeForTomorrow, pickDoNext, rankHomeActions } from '../lib/home/doNext';
import { computeTodayProgress, type TodayProgress } from '../lib/home/today';
import { buildGreetingSentence } from '../lib/home/greeting';
import type {
  AnswerTimeStat,
  DecisionRow,
  NoticeItem,
  OnTimeRecord,
  WorkPriority,
} from '../lib/home/stage3Api';
import type { StaffMember } from '../types';
import type { ClosureItem, DueSlot, MyChangeStep, ProjectMilestone } from '../types/projectFile';

export interface ReportTimerRow {
  kind: string;
  subject: string;
  dueDate: string | null;
  state: string;
  draftReady: boolean;
  linesLeft: number;
  link: string;
}

export interface MyDayItem {
  at: string;
  until: string;
  kind: string;
  title: string;
  place: string;
  link: string;
  subjectType: string;
  subjectId: string;
}

export interface MyRequestItem {
  kind: string;
  title: string;
  askedAt: string;
  holderLabel: string;
  holderSince: string;
  normDays: number;
  state: string;
  link: string;
}

export interface RequestCatalogEntry {
  key: string;
  label: string;
  groupName: string;
  desk: string;
  category: string;
  normDays: number;
  handler: string;
}

interface HomeContextType {
  loading: boolean;
  ownStaff: StaffMember | null;
  ownStaffId: string;
  todayIso: string;
  actions: HomeAction[];
  rankedActions: HomeAction[];
  doNext: HomeAction | null;
  quickWins: HomeAction[];
  groupCounts: Record<HomeGroup, number>;
  todayProgress: TodayProgress;
  greeting: string;
  snoozedIds: ReadonlySet<string>;
  doneTodayIds: ReadonlySet<string>;
  snoozeTomorrow: (action: HomeAction) => void;
  markDoneToday: (actionId: string) => void;
  claimedKeys: ReadonlySet<string>;
  registerClaimedKeys: (keys: string[]) => void;
  commonDeskCollapsed: boolean;
  toggleCommonDesk: () => void;
  coPiProposalIds: ReadonlySet<string>;
  milestonesByProject: Record<string, ProjectMilestone[]>;
  reportTimers: ReportTimerRow[];
  myDayItems: MyDayItem[];
  myRequestsItems: MyRequestItem[];
  requestCatalog: RequestCatalogEntry[];
  priorities: WorkPriority[];
  askedPriorities: WorkPriority[];
  decisions: DecisionRow[];
  answerTime: AnswerTimeStat | null;
  onTimeRecord: OnTimeRecord | null;
  notices: NoticeItem[];
  ensureLoaded: () => void;
  refreshHome: () => Promise<void>;
}

const HomeContext = createContext<HomeContextType | undefined>(undefined);

export function useHome() {
  const ctx = useContext(HomeContext);
  if (ctx === undefined) throw new Error('useHome must be used within a HomeProvider');
  return ctx;
}

function readStorageJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorageJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors in restricted environments
  }
}

function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function HomeProvider({ children }: { children: ReactNode }) {
  const { user, activeRole } = useAuth();
  const { staff, actionItems, tickets, contractStaff, contributionRequests, dataStewards } = useData();
  const { reports, evaluations } = usePMS();
  const { proposals } = useProposals();
  const { reports: progressReports } = useProjectReports();

  const todayIso = useMemo(() => localIsoDate(), []);
  const userId = user?.id ?? '';

  const [activated, setActivated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dueSlots, setDueSlots] = useState<DueSlot[]>([]);
  const [changeSteps, setChangeSteps] = useState<MyChangeStep[]>([]);
  const [closureItems, setClosureItems] = useState<ClosureItem[]>([]);
  const [coPiProposalIds, setCoPiProposalIds] = useState<Set<string>>(new Set());
  const [milestonesByProject, setMilestonesByProject] = useState<Record<string, ProjectMilestone[]>>({});
  const [reportTimers, setReportTimers] = useState<ReportTimerRow[]>([]);
  const [myDayItems, setMyDayItems] = useState<MyDayItem[]>([]);
  const [myRequestsItems, setMyRequestsItems] = useState<MyRequestItem[]>([]);
  const [requestCatalog, setRequestCatalog] = useState<RequestCatalogEntry[]>([]);
  const [priorities, setPriorities] = useState<WorkPriority[]>([]);
  const [askedPriorities, setAskedPriorities] = useState<WorkPriority[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [answerTime, setAnswerTime] = useState<AnswerTimeStat | null>(null);
  const [onTimeRecord, setOnTimeRecord] = useState<OnTimeRecord | null>(null);
  const [notices, setNotices] = useState<NoticeItem[]>([]);

  const [doneTodayIds, setDoneTodayIds] = useState<Set<string>>(
    () => new Set(userId ? readStorageJson<string[]>(`surya.home.done.${userId}.${todayIso}`, []) : []),
  );
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(
    () => new Set(userId ? readStorageJson<string[]>(`surya.home.snooze.${userId}.${todayIso}`, []) : []),
  );
  const [commonDeskCollapsed, setCommonDeskCollapsed] = useState<boolean>(
    () => (userId ? readStorageJson<boolean>(`surya.home.deskCollapsed.${userId}`, false) : false),
  );
  const [claimedKeys, setClaimedKeys] = useState<Set<string>>(new Set());
  const loadedForUserRef = useRef<string | null>(null);

  // Sync per-user local preferences when switching accounts
  useEffect(() => {
    if (!userId) {
      setDoneTodayIds(new Set());
      setSnoozedIds(new Set());
      setCommonDeskCollapsed(false);
      loadedForUserRef.current = null;
      return;
    }
    setDoneTodayIds(new Set(readStorageJson<string[]>(`surya.home.done.${userId}.${todayIso}`, [])));
    setSnoozedIds(new Set(readStorageJson<string[]>(`surya.home.snooze.${userId}.${todayIso}`, [])));
    setCommonDeskCollapsed(readStorageJson<boolean>(`surya.home.deskCollapsed.${userId}`, false));
  }, [userId, todayIso]);

  // SH1: Match staff strictly by linked user_id (never name or email)
  const ownStaff = useMemo(
    () => (userId ? staff.find((s) => s.user_id === userId) ?? null : null),
    [staff, userId],
  );
  const ownStaffId = ownStaff?.ID ?? '';
  const ownStaffName = ownStaff?.Name ?? '';

  const refreshHome = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [slots, steps, closures] = await Promise.all([
        myDueSlots().catch(() => [] as DueSlot[]),
        myChangeSteps().catch(() => [] as MyChangeStep[]),
        myClosureItems().catch(() => [] as ClosureItem[]),
      ]);
      setDueSlots(slots);
      setChangeSteps(steps);
      setClosureItems(closures);

      if (supabase) {
        const [
          timersRes, dayRes, reqRes, catRes,
          prioRes, decRes, ansTimeRes, onTimeRes, noticesRes, readsRes,
        ] = await Promise.all([
          supabase.rpc('my_report_timers'),
          supabase.rpc('my_day'),
          supabase.rpc('my_requests'),
          supabase.from('request_catalog').select('key, label, group_name, desk, category, norm_days, handler').eq('active', true).order('sort_order'),
          supabase.from('work_priorities').select('*').eq('status', 'OPEN').order('wanted_by', { ascending: true }),
          supabase.rpc('my_decisions'),
          supabase.rpc('my_answer_time'),
          supabase.rpc('my_on_time_record'),
          supabase.from('notices').select('*').order('issued_on', { ascending: false }).order('created_at', { ascending: false }).limit(20),
          supabase.from('notice_reads').select('notice_id, read_at, acked_at').eq('user_id', user.id),
        ]);
        const allPrios = (prioRes.data ?? []) as WorkPriority[];
        setPriorities(allPrios.filter((p) => p.assignee_user_id === user.id));
        setAskedPriorities(allPrios.filter((p) => p.asked_by === user.id));
        setDecisions(((decRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
          kind: String(r.kind ?? ''),
          subject_type: String(r.subject_type ?? ''),
          subject_id: String(r.subject_id ?? ''),
          title: String(r.title ?? ''),
          requester_user_id: r.requester_user_id ? String(r.requester_user_id) : null,
          waiting_since: String(r.waiting_since ?? ''),
          quick: Boolean(r.quick),
          link: String(r.link ?? '/'),
          days_waiting: Number(r.days_waiting ?? 0),
          open_question: Boolean(r.open_question),
        })));
        const ansRow = Array.isArray(ansTimeRes.data) ? ansTimeRes.data[0] : ansTimeRes.data;
        setAnswerTime(ansRow ? {
          median_days: Number((ansRow as Record<string, unknown>).median_days ?? 0),
          decision_count: Number((ansRow as Record<string, unknown>).decision_count ?? 0),
        } : null);
        const otRow = Array.isArray(onTimeRes.data) ? onTimeRes.data[0] : onTimeRes.data;
        setOnTimeRecord(otRow ? {
          on_time_count: Number((otRow as Record<string, unknown>).on_time_count ?? 0),
          total_count: Number((otRow as Record<string, unknown>).total_count ?? 0),
        } : null);
        const readsMap = new Map<string, { read_at: string | null; acked_at: string | null }>();
        for (const rd of (readsRes.data ?? []) as Array<{ notice_id: string; read_at: string | null; acked_at: string | null }>) {
          readsMap.set(rd.notice_id, { read_at: rd.read_at, acked_at: rd.acked_at });
        }
        setNotices(((noticesRes.data ?? []) as Record<string, unknown>[]).map((n) => {
          const rd = readsMap.get(String(n.id));
          return {
            id: String(n.id),
            notice_no: String(n.notice_no ?? ''),
            kind: (n.kind as NoticeItem['kind']) ?? 'NOTICE',
            title: String(n.title ?? ''),
            body: String(n.body ?? ''),
            issued_by: String(n.issued_by ?? ''),
            issued_on: String(n.issued_on ?? ''),
            audience: (n.audience as Record<string, unknown>) ?? { scope: 'ALL' },
            must_ack: Boolean(n.must_ack),
            ack_by: n.ack_by ? String(n.ack_by) : null,
            valid_to: n.valid_to ? String(n.valid_to) : null,
            supersedes: n.supersedes ? String(n.supersedes) : null,
            superseded_by: n.superseded_by ? String(n.superseded_by) : null,
            read_at: rd?.read_at ?? null,
            acked_at: rd?.acked_at ?? null,
          };
        }));
        setReportTimers(((timersRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
          kind: String(r.kind ?? ''),
          subject: String(r.subject ?? ''),
          dueDate: r.due_date ? String(r.due_date) : null,
          state: String(r.state ?? ''),
          draftReady: Boolean(r.draft_ready),
          linesLeft: Number(r.lines_left ?? 0),
          link: String(r.link ?? '/reports'),
        })));
        setMyDayItems(((dayRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
          at: String(r.at ?? ''),
          until: String(r.until ?? ''),
          kind: String(r.kind ?? ''),
          title: String(r.title ?? ''),
          place: String(r.place ?? ''),
          link: String(r.link ?? '/calendar'),
          subjectType: String(r.subject_type ?? ''),
          subjectId: String(r.subject_id ?? ''),
        })));
        setMyRequestsItems(((reqRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
          kind: String(r.kind ?? ''),
          title: String(r.title ?? ''),
          askedAt: String(r.asked_at ?? ''),
          holderLabel: String(r.holder_label ?? ''),
          holderSince: String(r.holder_since ?? ''),
          normDays: Number(r.norm_days ?? 3),
          state: String(r.state ?? ''),
          link: String(r.link ?? '/helpdesk'),
        })));
        setRequestCatalog(((catRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
          key: String(r.key ?? ''),
          label: String(r.label ?? ''),
          groupName: String(r.group_name ?? ''),
          desk: String(r.desk ?? ''),
          category: String(r.category ?? 'Administrative'),
          normDays: Number(r.norm_days ?? 3),
          handler: String(r.handler ?? 'ticket'),
        })));
      }

      if (supabase && ownStaffId) {
        const [{ data: copiRows }, { data: msRows }] = await Promise.all([
          supabase.from('proposal_copis').select('proposal_id').eq('staff_id', ownStaffId),
          supabase.from('project_milestones').select('*').order('target_date', { ascending: true }),
        ]);
        setCoPiProposalIds(new Set((copiRows ?? []).map((r) => String(r.proposal_id))));
        const grouped: Record<string, ProjectMilestone[]> = {};
        for (const row of (msRows ?? []) as Record<string, unknown>[]) {
          const pid = String(row.project_id ?? '');
          if (!pid) continue;
          if (!grouped[pid]) grouped[pid] = [];
          grouped[pid].push({
            id: String(row.id ?? ''),
            title: String(row.title ?? ''),
            targetDate: String(row.target_date ?? ''),
            status: (row.status as ProjectMilestone['status']) ?? 'PLANNED',
            achievedOn: row.achieved_on ? String(row.achieved_on) : null,
            reportNote: row.report_note ? String(row.report_note) : null,
            documentId: row.document_id ? String(row.document_id) : null,
            decisionNote: row.decision_note ? String(row.decision_note) : null,
          });
        }
        setMilestonesByProject(grouped);
      } else {
        setCoPiProposalIds(new Set());
        setMilestonesByProject({});
      }
    } finally {
      setLoading(false);
    }
  }, [user, ownStaffId]);

  const ensureLoaded = useCallback(() => {
    setActivated(true);
  }, []);

  useEffect(() => {
    if (!activated || !userId) return;
    const key = `${userId}:${ownStaffId}`;
    if (loadedForUserRef.current === key) return;
    loadedForUserRef.current = key;
    void refreshHome();
  }, [activated, userId, ownStaffId, refreshHome]);

  const rawActions = useMemo(() => {
    if (!user || !activeRole) return [];
    return deriveMyActions({
      userId: user.id,
      staffName: ownStaffName,
      role: activeRole,
      reports,
      evaluations,
      proposals,
      progressReports,
      actionItems,
      tickets,
      staff,
      contractStaff,
      roles: user.roles,
      dueSlots,
      changeSteps,
      closureItems,
      contributions: contributionRequests,
      stewards: dataStewards,
    });
  }, [
    user, activeRole, ownStaffName, reports, evaluations, proposals, progressReports,
    actionItems, tickets, staff, contractStaff, dueSlots, changeSteps, closureItems,
    contributionRequests, dataStewards,
  ]);

  const actions = useMemo(
    () => rawActions.map(classifyAction).filter((a) => !doneTodayIds.has(a.id)),
    [rawActions, doneTodayIds],
  );

  const rankedActions = useMemo(
    () => rankHomeActions(actions, snoozedIds, todayIso),
    [actions, snoozedIds, todayIso],
  );

  const doNext = useMemo(
    () => pickDoNext(actions, snoozedIds, todayIso),
    [actions, snoozedIds, todayIso],
  );

  const quickWins = useMemo(
    () => rankedActions.filter((a) => a.quickWin && a.id !== doNext?.id),
    [rankedActions, doNext],
  );

  const groupCounts = useMemo(() => summarizeByGroup(actions), [actions]);
  const todayProgress = useMemo(
    () => computeTodayProgress(actions.length, doneTodayIds),
    [actions.length, doneTodayIds],
  );
  const greeting = useMemo(
    () => buildGreetingSentence(ownStaff?.Name, actions.length, todayProgress.done),
    [ownStaff?.Name, actions.length, todayProgress.done],
  );

  const snoozeTomorrow = useCallback((action: HomeAction) => {
    if (!userId || !canSnoozeForTomorrow(action, todayIso)) return;
    setSnoozedIds((prev) => {
      const next = new Set(prev);
      next.add(action.id);
      writeStorageJson(`surya.home.snooze.${userId}.${todayIso}`, [...next]);
      return next;
    });
  }, [userId, todayIso]);

  const markDoneToday = useCallback((actionId: string) => {
    if (!userId) return;
    setDoneTodayIds((prev) => {
      const next = new Set(prev);
      next.add(actionId);
      writeStorageJson(`surya.home.done.${userId}.${todayIso}`, [...next]);
      return next;
    });
  }, [userId, todayIso]);

  const registerClaimedKeys = useCallback((keys: string[]) => {
    setClaimedKeys((prev) => {
      if (prev.size === keys.length && keys.every((k) => prev.has(k))) return prev;
      return new Set(keys);
    });
  }, []);

  const toggleCommonDesk = useCallback(() => {
    setCommonDeskCollapsed((prev) => {
      const next = !prev;
      if (userId) writeStorageJson(`surya.home.deskCollapsed.${userId}`, next);
      return next;
    });
  }, [userId]);

  const value = useMemo<HomeContextType>(() => ({
    loading,
    ownStaff,
    ownStaffId,
    todayIso,
    actions,
    rankedActions,
    doNext,
    quickWins,
    groupCounts,
    todayProgress,
    greeting,
    snoozedIds,
    doneTodayIds,
    snoozeTomorrow,
    markDoneToday,
    claimedKeys,
    registerClaimedKeys,
    commonDeskCollapsed,
    toggleCommonDesk,
    coPiProposalIds,
    milestonesByProject,
    reportTimers,
    myDayItems,
    myRequestsItems,
    requestCatalog,
    priorities,
    askedPriorities,
    decisions,
    answerTime,
    onTimeRecord,
    notices,
    ensureLoaded,
    refreshHome,
  }), [
    loading, ownStaff, ownStaffId, todayIso, actions, rankedActions, doNext, quickWins,
    groupCounts, todayProgress, greeting, snoozedIds, doneTodayIds, snoozeTomorrow,
    markDoneToday, claimedKeys, registerClaimedKeys, commonDeskCollapsed, toggleCommonDesk,
    coPiProposalIds, milestonesByProject, reportTimers, myDayItems, myRequestsItems, requestCatalog,
    priorities, askedPriorities, decisions, answerTime, onTimeRecord, notices,
    ensureLoaded, refreshHome,
  ]);

  return <HomeContext.Provider value={value}>{children}</HomeContext.Provider>;
}
