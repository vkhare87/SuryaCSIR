/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import type {
  DivisionInfo,
  StaffMember,
  ProjectInfo,
  ProjectStaff,
  PhDStudent,
  PhDMilestone,
  Equipment,
  Lab,
  ScientificOutput,
  IPIntelligence,
  MoU,
  TechTransfer,
  ContractStaff,
  VacancyAdvertisement,
  VacancyApplication,
  Role,
  Committee,
  CommitteeMember,
  Meeting,
  AgendaItem,
  ActionItem,
  MeetingDocument,
  Ticket,
  TicketResponse,
  TicketEvent,
  HelpdeskRouting,
  CalendarEvent,
  Holiday,
  ImportEvent,
  ContributionRequest,
  DataSteward,
} from '../types';
import { supabase, isProvisioned } from '../utils/supabaseClient';
import {
  mapDivisionRow,
  mapStaffRow,
  mapProjectRow,
  mapProjectStaffRow,
  mapPhDStudentRow,
  mapPhDMilestoneRow,
  mapEquipmentRow,
  mapLabRow,
  mapScientificOutputRow,
  mapIPIntelligenceRow,
  mapMoURow,
  mapTechTransferRow,
  mapContractStaffRow,
  mapVacancyAdvertisementRow,
  mapVacancyApplicationRow,
  mapCommitteeRow,
  mapCommitteeMemberRow,
  mapMeetingRow,
  mapAgendaItemRow,
  mapActionItemRow,
  mapMeetingDocumentRow,
  mapTicketRow,
  mapTicketResponseRow,
  mapTicketEventRow,
  mapHelpdeskRoutingRow,
  mapCalendarEventRow,
  mapHolidayRow,
  mapImportEventRow,
  mapContributionRow,
  mapStewardRow,
} from '../utils/dataMapper';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useFeatureControls } from './FeatureControlContext';
import { logger } from '../utils/logger';
import { fetchAll, isMissingTable } from '../lib/data/fetchAll';
import { withPostTotals } from '../lib/recruitment/posts';
import { friendlyError } from '../lib/errors';

// ---------------------------------------------------------------------------
// Client-side division scoping helpers (applied after data load)
// ---------------------------------------------------------------------------

function scopeData<T extends { Division?: string }>(
  items: T[],
  role: Role | null,
  divisionCode: string | null
): T[] {
  if ((role === 'DivisionHead' || role === 'Technician') && divisionCode) {
    return items.filter(item => item.Division === divisionCode);
  }
  return items;
}

function scopeProjects(
  items: ProjectInfo[],
  role: Role | null,
  divisionCode: string | null
): ProjectInfo[] {
  if ((role === 'DivisionHead' || role === 'Technician') && divisionCode) {
    return items.filter(item => item.DivisionCode === divisionCode);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

interface DataContextType {
  divisions: DivisionInfo[];
  staff: StaffMember[];
  projects: ProjectInfo[];
  projectStaff: ProjectStaff[];
  phDStudents: PhDStudent[];
  phdMilestones: PhDMilestone[];
  contractStaff: ContractStaff[];
  scientificOutputs: ScientificOutput[];
  ipIntelligence: IPIntelligence[];
  mous: MoU[];
  techTransfers: TechTransfer[];
  equipment: Equipment[];
  labs: Lab[];
  vacancyAdvertisements: VacancyAdvertisement[];
  vacancyApplications: VacancyApplication[];
  committees: Committee[];
  committeeMembers: CommitteeMember[];
  meetings: Meeting[];
  agendaItems: AgendaItem[];
  actionItems: ActionItem[];
  meetingDocs: MeetingDocument[];
  tickets: Ticket[];
  ticketResponses: TicketResponse[];
  ticketEvents: TicketEvent[];
  helpdeskRouting: HelpdeskRouting[];
  calendarEvents: CalendarEvent[];
  holidays: Holiday[];
  importEvents: ImportEvent[];
  contributionRequests: ContributionRequest[];
  dataStewards: DataSteward[];
  refreshContributions: () => Promise<void>;
  refreshCalendar: () => Promise<void>;
  refreshHolidays: () => Promise<void>;
  isLoading: boolean;
  isBackendProvisioned: boolean;
  refreshData: () => Promise<void>;
  saveEquipment: (payload: Record<string, unknown>) => Promise<void>;
  error: string | null;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// DataProvider
// ---------------------------------------------------------------------------

export function DataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, role, divisionCode } = useAuth();
  const { push: pushToast } = useToast();
  const { canAccess } = useFeatureControls();
  const provisioned = isProvisioned();

  // Tables only HR / data-ops pages read: no request at all for a user who
  // cannot open those pages. ProjectStaff keeps contract_staff (RLS: own row)
  // for the "your engagement ends" action.
  const loadRecruitment = canAccess('/recruitment');
  const loadDataOps = canAccess('/data');
  const loadContracts = loadDataOps || role === 'ProjectStaff';

  const [divisions, setDivisions] = useState<DivisionInfo[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [projectStaff, setProjectStaff] = useState<ProjectStaff[]>([]);
  const [phDStudents, setPhDStudents] = useState<PhDStudent[]>([]);
  const [phdMilestones, setPhdMilestones] = useState<PhDMilestone[]>([]);
  const [contractStaff, setContractStaff] = useState<ContractStaff[]>([]);
  const [scientificOutputs, setScientificOutputs] = useState<ScientificOutput[]>([]);
  const [ipIntelligence, setIPIntelligence] = useState<IPIntelligence[]>([]);
  const [mous, setMous] = useState<MoU[]>([]);
  const [techTransfers, setTechTransfers] = useState<TechTransfer[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [vacancyAdvertisements, setVacancyAdvertisements] = useState<VacancyAdvertisement[]>([]);
  const [vacancyApplications, setVacancyApplications] = useState<VacancyApplication[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [meetingDocs, setMeetingDocs] = useState<MeetingDocument[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketResponses, setTicketResponses] = useState<TicketResponse[]>([]);
  const [ticketEvents, setTicketEvents] = useState<TicketEvent[]>([]);
  const [helpdeskRouting, setHelpdeskRouting] = useState<HelpdeskRouting[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [importEvents, setImportEvents] = useState<ImportEvent[]>([]);
  const [contributionRequests, setContributionRequests] = useState<ContributionRequest[]>([]);
  const [dataStewards, setDataStewards] = useState<DataSteward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resetAll = useCallback(() => {
    setDivisions([]);
    setStaff([]);
    setProjects([]);
    setProjectStaff([]);
    setPhDStudents([]);
    setPhdMilestones([]);
    setContractStaff([]);
    setEquipment([]);
    setLabs([]);
    setScientificOutputs([]);
    setIPIntelligence([]);
    setMous([]);
    setTechTransfers([]);
    setVacancyAdvertisements([]);
    setVacancyApplications([]);
    setCommittees([]);
    setCommitteeMembers([]);
    setMeetings([]);
    setAgendaItems([]);
    setActionItems([]);
    setMeetingDocs([]);
    setTickets([]);
    setTicketResponses([]);
    setTicketEvents([]);
    setHelpdeskRouting([]);
    setCalendarEvents([]);
    setHolidays([]);
    setImportEvents([]);
    setContributionRequests([]);
    setDataStewards([]);
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!provisioned || !supabase) {
        setError('Backend not configured. Go to Setup.');
        resetAll();
        return;
      }
      // Before auth resolves every table answers empty under RLS: a wasted
      // round of requests and an empty-data flash.
      if (!isAuthenticated) {
        resetAll();
        return;
      }

      const skipped = Promise.resolve({ data: [], error: null });
      const [
        divRes, staffRes, projRes, psRes, phdRes, equipRes, labsRes, soRes, ipRes, csRes,
        vaRes, vpRes, vappRes,
        cmtRes, cmmRes, mtgRes, agiRes, actRes, mdcRes, tktRes, trsRes, tevRes, hrtRes,
        ceRes, holRes, mouRes, ttRes, phmRes, ieRes, crRes, dsRes,
      ] = await Promise.all([
        // Every read is paged (fetchAll) — an unbounded select is capped at
        // db-max-rows silently, with no error and no flag, so the aggregates
        // downstream would quietly under-report once a table outgrew the cap.
        // Each query carries a stable .order(): without one, Postgres may
        // return a different row order per page and paging can both duplicate
        // and drop rows.
        fetchAll(supabase.from('divisions').select('*').order('divCode')),
        fetchAll(supabase.from('staff').select('*').order('ID')),
        fetchAll(supabase.from('projects').select('*').order('ProjectNo')),
        fetchAll(supabase.from('project_staff').select('*').order('ProjectNo').order('StaffName')),
        fetchAll(supabase.from('phd_students').select('*').order('EnrollmentNo')),
        // equipment's PK is "UInsID", not id — ordering by a column that does
        // not exist is a 400, not a silent no-op.
        fetchAll(supabase.from('equipment').select('*').order('UInsID')),
        fetchAll(supabase.from('labs').select('*').order('id')),
        fetchAll(supabase.from('scientific_outputs').select('*').order('id')),
        fetchAll(supabase.from('ip_intelligence').select('*').order('id')),
        loadContracts ? fetchAll(supabase.from('contract_staff').select('*').order('Name')) : skipped,
        loadRecruitment ? fetchAll(supabase.from('vacancy_advertisements').select('*').order('created_at', { ascending: false }).order('id')) : skipped,
        loadRecruitment ? fetchAll(supabase.from('vacancy_posts').select('*').order('id')) : skipped,
        loadRecruitment ? fetchAll(supabase.from('vacancy_applications').select('*').order('applied_on', { ascending: false }).order('id')) : skipped,
        fetchAll(supabase.from('committees').select('*').order('id')),
        fetchAll(supabase.from('committee_members').select('*').order('id')),
        fetchAll(supabase.from('meetings').select('*').order('id')),
        fetchAll(supabase.from('agenda_items').select('*').order('id')),
        fetchAll(supabase.from('action_items').select('*').order('id')),
        fetchAll(supabase.from('meeting_documents').select('*').order('id')),
        fetchAll(supabase.from('tickets').select('*').order('created_at', { ascending: false }).order('id')),
        fetchAll(supabase.from('ticket_responses').select('*').order('id')),
        fetchAll(supabase.from('ticket_events').select('*').order('id')),
        fetchAll(supabase.from('helpdesk_routing').select('*').order('id')),
        fetchAll(supabase.from('calendar_events').select('*').order('event_date', { ascending: true }).order('id')),
        fetchAll(supabase.from('holidays').select('*').order('holiday_date', { ascending: true }).order('id')),
        fetchAll(supabase.from('mous').select('*').order('id')),
        fetchAll(supabase.from('tech_transfers').select('*').order('id')),
        fetchAll(supabase.from('phd_milestones').select('*').order('id')),
        loadDataOps ? fetchAll(supabase.from('import_events').select('*').order('uploaded_at', { ascending: false }).order('id')) : skipped,
        fetchAll(supabase.from('contribution_requests').select('*').order('created_at', { ascending: false }).order('id')),
        fetchAll(supabase.from('data_stewards').select('*').order('id')),
      ]);

      // Surface per-table errors — Promise.all hides them as empty data
      const tableErrors: { table: string; message: string }[] = [];
      const checkTable = (name: string, res: { error: { message: string } | null }) => {
        if (res.error) tableErrors.push({ table: name, message: res.error.message });
      };
      checkTable('divisions', divRes);
      checkTable('staff', staffRes);
      checkTable('projects', projRes);
      checkTable('project_staff', psRes);
      checkTable('phd_students', phdRes);
      checkTable('equipment', equipRes);
      checkTable('labs', labsRes);
      checkTable('scientific_outputs', soRes);
      checkTable('ip_intelligence', ipRes);
      checkTable('contract_staff', csRes);
      checkTable('vacancy_advertisements', vaRes);
      checkTable('vacancy_posts', vpRes);
      checkTable('vacancy_applications', vappRes);
      checkTable('committees', cmtRes);
      checkTable('committee_members', cmmRes);
      checkTable('meetings', mtgRes);
      checkTable('agenda_items', agiRes);
      checkTable('action_items', actRes);
      checkTable('meeting_documents', mdcRes);
      checkTable('tickets', tktRes);
      checkTable('ticket_responses', trsRes);
      checkTable('ticket_events', tevRes);
      checkTable('helpdesk_routing', hrtRes);
      checkTable('calendar_events', ceRes);
      checkTable('holidays', holRes);
      checkTable('mous', mouRes);
      checkTable('tech_transfers', ttRes);
      checkTable('phd_milestones', phmRes);
      checkTable('import_events', ieRes);
      // Missing table = Phase 1 migration not applied yet; stay quiet and leave the arrays empty.
      if (!isMissingTable(crRes.error)) checkTable('contribution_requests', crRes);
      if (!isMissingTable(dsRes.error)) checkTable('data_stewards', dsRes);
      if (tableErrors.length > 0) {
        // Table names go to the log only (SEC-06).
        const summary = `${tableErrors.length} table(s) failed to load.`;
        logger.error('partial_data_load_failed', new Error(summary), { tableErrors });
        pushToast(`${summary} Some figures may be incomplete.`, 'warning');
      }

      const rawStaff = staffRes.data ? staffRes.data.map(mapStaffRow) : [];
      const rawProjects = projRes.data ? projRes.data.map(mapProjectRow) : [];
      const rawEquipment = equipRes.data ? equipRes.data.map(mapEquipmentRow) : [];

      setDivisions(divRes.data ? divRes.data.map(mapDivisionRow) : []);
      setStaff(scopeData(rawStaff, role, divisionCode));
      setProjects(scopeProjects(rawProjects, role, divisionCode));
      setProjectStaff(psRes.data ? psRes.data.map(mapProjectStaffRow) : []);
      setPhDStudents(phdRes.data ? phdRes.data.map(mapPhDStudentRow) : []);
      setContractStaff(csRes.data ? csRes.data.map(mapContractStaffRow) : []);
      setEquipment(scopeData(rawEquipment, role, divisionCode));
      setLabs(labsRes.data ? labsRes.data.map(mapLabRow) : []);
      setScientificOutputs(soRes.data ? soRes.data.map(mapScientificOutputRow) : []);
      setIPIntelligence(ipRes.data ? ipRes.data.map(mapIPIntelligenceRow) : []);
      setMous(mouRes.data ? mouRes.data.map(mapMoURow) : []);
      setTechTransfers(ttRes.data ? ttRes.data.map(mapTechTransferRow) : []);
      setPhdMilestones(phmRes.data ? phmRes.data.map(mapPhDMilestoneRow) : []);
      setVacancyAdvertisements(withPostTotals(vaRes.data ? vaRes.data.map(mapVacancyAdvertisementRow) : [], vpRes.data ?? []));
      setVacancyApplications(vappRes.data ? vappRes.data.map(mapVacancyApplicationRow) : []);
      setCommittees(cmtRes.data ? cmtRes.data.map(mapCommitteeRow) : []);
      setCommitteeMembers(cmmRes.data ? cmmRes.data.map(mapCommitteeMemberRow) : []);
      setMeetings(mtgRes.data ? mtgRes.data.map(mapMeetingRow) : []);
      setAgendaItems(agiRes.data ? agiRes.data.map(mapAgendaItemRow) : []);
      setActionItems(actRes.data ? actRes.data.map(mapActionItemRow) : []);
      setMeetingDocs(mdcRes.data ? mdcRes.data.map(mapMeetingDocumentRow) : []);
      setTickets(tktRes.data ? tktRes.data.map(mapTicketRow) : []);
      setTicketResponses(trsRes.data ? trsRes.data.map(mapTicketResponseRow) : []);
      setTicketEvents(tevRes.data ? tevRes.data.map(mapTicketEventRow) : []);
      setHelpdeskRouting(hrtRes.data ? hrtRes.data.map(mapHelpdeskRoutingRow) : []);
      setCalendarEvents(ceRes.data ? ceRes.data.map(mapCalendarEventRow) : []);
      setHolidays(holRes.data ? holRes.data.map(mapHolidayRow) : []);
      setImportEvents(ieRes.data ? ieRes.data.map(mapImportEventRow) : []);
      setContributionRequests(crRes.data ? crRes.data.map(mapContributionRow) : []);
      setDataStewards(dsRes.data ? dsRes.data.map(mapStewardRow) : []);
    } catch (err) {
      const message = friendlyError(err, 'Failed to load data');
      setError(message);
      logger.error('data_load_failed', err, { role, divisionCode });
      pushToast(`Data load failed: ${message}`, 'error');
      resetAll();
    } finally {
      setIsLoading(false);
    }
  }, [provisioned, isAuthenticated, role, divisionCode, loadRecruitment, loadDataOps, loadContracts, pushToast, resetAll]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshContributions = useCallback(async () => {
    if (!supabase) return;
    const [crRes, dsRes] = await Promise.all([
      fetchAll(supabase.from('contribution_requests').select('*').order('created_at', { ascending: false }).order('id')),
      fetchAll(supabase.from('data_stewards').select('*').order('id')),
    ]);
    const err = [crRes.error, dsRes.error].find(e => e && !isMissingTable(e));
    if (err) {
      logger.error('refresh_contributions_failed', err);
      pushToast(`Requests refresh failed: ${friendlyError(err)}`, 'error');
      return;
    }
    setContributionRequests(crRes.data ? crRes.data.map(mapContributionRow) : []);
    setDataStewards(dsRes.data ? dsRes.data.map(mapStewardRow) : []);
  }, [pushToast]);

  const refreshCalendar = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await fetchAll(supabase
      .from('calendar_events')
      .select('*')
      .order('event_date', { ascending: true })
      .order('id'));
    if (err) {
      logger.error('refresh_calendar_failed', err);
      pushToast(`Calendar refresh failed: ${friendlyError(err)}`, 'error');
      return;
    }
    setCalendarEvents(data ? data.map(mapCalendarEventRow) : []);
  }, [pushToast]);

  const refreshHolidays = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await fetchAll(supabase
      .from('holidays')
      .select('*')
      .order('holiday_date', { ascending: true })
      .order('id'));
    if (err) {
      logger.error('refresh_holidays_failed', err);
      pushToast(`Holidays refresh failed: ${friendlyError(err)}`, 'error');
      return;
    }
    setHolidays(data ? data.map(mapHolidayRow) : []);
  }, [pushToast]);

  const saveEquipment = useCallback(async (payload: Record<string, unknown>) => {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error: sbErr } = await supabase.from('equipment').upsert(payload).select().single();
    if (sbErr) throw sbErr;
    const saved = mapEquipmentRow(data);
    setEquipment(prev => [saved, ...prev.filter(e => e.UInsID !== saved.UInsID)]);
  }, []);

  const value = useMemo(() => ({
    divisions, staff, projects, projectStaff, phDStudents, phdMilestones, contractStaff,
    scientificOutputs, ipIntelligence, mous, techTransfers, equipment, labs, vacancyAdvertisements,
    vacancyApplications, committees, committeeMembers, meetings, agendaItems, actionItems,
    meetingDocs, tickets, ticketResponses, ticketEvents, helpdeskRouting, calendarEvents, holidays,
    importEvents, contributionRequests, dataStewards, refreshContributions, refreshCalendar,
    refreshHolidays, isLoading,
    isBackendProvisioned: provisioned,
    refreshData: loadData,
    saveEquipment,
    error,
  }), [
    divisions, staff, projects, projectStaff, phDStudents, phdMilestones, contractStaff,
    scientificOutputs, ipIntelligence, mous, techTransfers, equipment, labs, vacancyAdvertisements,
    vacancyApplications, committees, committeeMembers, meetings, agendaItems, actionItems,
    meetingDocs, tickets, ticketResponses, ticketEvents, helpdeskRouting, calendarEvents, holidays,
    importEvents, contributionRequests, dataStewards, refreshContributions, refreshCalendar,
    refreshHolidays, isLoading, provisioned, loadData, saveEquipment, error,
  ]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}

/** Non-throwing loading flag for UI primitives that may render outside a DataProvider. */
export function useDataLoading() {
  return useContext(DataContext)?.isLoading ?? false;
}
