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

export type DataSlice =
  | 'hr'
  | 'projects'
  | 'phd'
  | 'outputs'
  | 'partnerships'
  | 'facilities'
  | 'committees'
  | 'tickets'
  | 'recruitment';

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
  refreshSlice: (slice: DataSlice) => Promise<void>;
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
  // for the "your engagement ends" action. Checked across all assigned roles so
  // switching activeRole in the header does not re-fetch 31 tables over the network.
  const { roles } = useAuth();
  const loadRecruitment = canAccess('/recruitment') || (roles ?? []).some(r => ['Director', 'HRAdmin', 'SystemAdmin', 'MasterAdmin'].includes(r));
  const loadDataOps = canAccess('/data') || (roles ?? []).some(r => ['HRAdmin', 'SystemAdmin', 'MasterAdmin', 'PME'].includes(r));
  const loadContracts = loadDataOps || role === 'ProjectStaff' || (roles ?? []).includes('ProjectStaff');

  const [divisions, setDivisions] = useState<DivisionInfo[]>([]);
  const [rawStaff, setRawStaff] = useState<StaffMember[]>([]);
  const [rawProjects, setRawProjects] = useState<ProjectInfo[]>([]);
  const [projectStaff, setProjectStaff] = useState<ProjectStaff[]>([]);
  const [phDStudents, setPhDStudents] = useState<PhDStudent[]>([]);
  const [phdMilestones, setPhdMilestones] = useState<PhDMilestone[]>([]);
  const [contractStaff, setContractStaff] = useState<ContractStaff[]>([]);
  const [scientificOutputs, setScientificOutputs] = useState<ScientificOutput[]>([]);
  const [ipIntelligence, setIPIntelligence] = useState<IPIntelligence[]>([]);
  const [mous, setMous] = useState<MoU[]>([]);
  const [techTransfers, setTechTransfers] = useState<TechTransfer[]>([]);
  const [rawEquipment, setRawEquipment] = useState<Equipment[]>([]);
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
    setRawStaff([]);
    setRawProjects([]);
    setProjectStaff([]);
    setPhDStudents([]);
    setPhdMilestones([]);
    setContractStaff([]);
    setRawEquipment([]);
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

      setDivisions(divRes.data ? divRes.data.map(mapDivisionRow) : []);
      setRawStaff(staffRes.data ? staffRes.data.map(mapStaffRow) : []);
      setRawProjects(projRes.data ? projRes.data.map(mapProjectRow) : []);
      setProjectStaff(psRes.data ? psRes.data.map(mapProjectStaffRow) : []);
      setPhDStudents(phdRes.data ? phdRes.data.map(mapPhDStudentRow) : []);
      setContractStaff(csRes.data ? csRes.data.map(mapContractStaffRow) : []);
      setRawEquipment(equipRes.data ? equipRes.data.map(mapEquipmentRow) : []);
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
      logger.error('data_load_failed', err);
      pushToast(`Data load failed: ${message}`, 'error');
      resetAll();
    } finally {
      setIsLoading(false);
    }
  }, [provisioned, isAuthenticated, loadRecruitment, loadDataOps, loadContracts, pushToast, resetAll]);

  const staff = useMemo(() => scopeData(rawStaff, role, divisionCode), [rawStaff, role, divisionCode]);
  const projects = useMemo(() => scopeProjects(rawProjects, role, divisionCode), [rawProjects, role, divisionCode]);
  const equipment = useMemo(() => scopeData(rawEquipment, role, divisionCode), [rawEquipment, role, divisionCode]);

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

  const refreshSlice = useCallback(async (slice: DataSlice) => {
    if (!supabase || !provisioned || !isAuthenticated) return;
    try {
      if (slice === 'hr') {
        const [divRes, staffRes, csRes] = await Promise.all([
          fetchAll(supabase.from('divisions').select('*').order('divCode')),
          fetchAll(supabase.from('staff').select('*').order('ID')),
          loadContracts ? fetchAll(supabase.from('contract_staff').select('*').order('Name')) : Promise.resolve({ data: null, error: null }),
        ]);
        if (divRes.error) throw divRes.error;
        if (staffRes.error) throw staffRes.error;
        if (csRes.error) throw csRes.error;
        if (divRes.data) setDivisions(divRes.data.map(mapDivisionRow));
        if (staffRes.data) setRawStaff(staffRes.data.map(mapStaffRow));
        if (csRes.data) setContractStaff(csRes.data.map(mapContractStaffRow));
        return;
      }
      if (slice === 'projects') {
        const [projRes, psRes] = await Promise.all([
          fetchAll(supabase.from('projects').select('*').order('ProjectNo')),
          fetchAll(supabase.from('project_staff').select('*').order('ProjectNo').order('StaffName')),
        ]);
        if (projRes.error) throw projRes.error;
        if (psRes.error) throw psRes.error;
        if (projRes.data) setRawProjects(projRes.data.map(mapProjectRow));
        if (psRes.data) setProjectStaff(psRes.data.map(mapProjectStaffRow));
        return;
      }
      if (slice === 'phd') {
        const [phdRes, phmRes] = await Promise.all([
          fetchAll(supabase.from('phd_students').select('*').order('EnrollmentNo')),
          fetchAll(supabase.from('phd_milestones').select('*').order('id')),
        ]);
        if (phdRes.error) throw phdRes.error;
        if (phmRes.error) throw phmRes.error;
        if (phdRes.data) setPhDStudents(phdRes.data.map(mapPhDStudentRow));
        if (phmRes.data) setPhdMilestones(phmRes.data.map(mapPhDMilestoneRow));
        return;
      }
      if (slice === 'outputs') {
        const [soRes, ipRes] = await Promise.all([
          fetchAll(supabase.from('scientific_outputs').select('*').order('id')),
          fetchAll(supabase.from('ip_intelligence').select('*').order('id')),
        ]);
        if (soRes.error) throw soRes.error;
        if (ipRes.error) throw ipRes.error;
        if (soRes.data) setScientificOutputs(soRes.data.map(mapScientificOutputRow));
        if (ipRes.data) setIPIntelligence(ipRes.data.map(mapIPIntelligenceRow));
        return;
      }
      if (slice === 'partnerships') {
        const [mouRes, ttRes] = await Promise.all([
          fetchAll(supabase.from('mous').select('*').order('id')),
          fetchAll(supabase.from('tech_transfers').select('*').order('id')),
        ]);
        if (mouRes.error) throw mouRes.error;
        if (ttRes.error) throw ttRes.error;
        if (mouRes.data) setMous(mouRes.data.map(mapMoURow));
        if (ttRes.data) setTechTransfers(ttRes.data.map(mapTechTransferRow));
        return;
      }
      if (slice === 'facilities') {
        const [equipRes, labsRes] = await Promise.all([
          fetchAll(supabase.from('equipment').select('*').order('UInsID')),
          fetchAll(supabase.from('labs').select('*').order('id')),
        ]);
        if (equipRes.error) throw equipRes.error;
        if (labsRes.error) throw labsRes.error;
        if (equipRes.data) setRawEquipment(equipRes.data.map(mapEquipmentRow));
        if (labsRes.data) setLabs(labsRes.data.map(mapLabRow));
        return;
      }
      if (slice === 'committees') {
        const [cmtRes, cmmRes, mtgRes, agiRes, actRes, mdcRes] = await Promise.all([
          fetchAll(supabase.from('committees').select('*').order('id')),
          fetchAll(supabase.from('committee_members').select('*').order('id')),
          fetchAll(supabase.from('meetings').select('*').order('id')),
          fetchAll(supabase.from('agenda_items').select('*').order('id')),
          fetchAll(supabase.from('action_items').select('*').order('id')),
          fetchAll(supabase.from('meeting_documents').select('*').order('id')),
        ]);
        if (cmtRes.error || cmmRes.error || mtgRes.error || agiRes.error || actRes.error || mdcRes.error) {
          throw cmtRes.error || cmmRes.error || mtgRes.error || agiRes.error || actRes.error || mdcRes.error;
        }
        if (cmtRes.data) setCommittees(cmtRes.data.map(mapCommitteeRow));
        if (cmmRes.data) setCommitteeMembers(cmmRes.data.map(mapCommitteeMemberRow));
        if (mtgRes.data) setMeetings(mtgRes.data.map(mapMeetingRow));
        if (agiRes.data) setAgendaItems(agiRes.data.map(mapAgendaItemRow));
        if (actRes.data) setActionItems(actRes.data.map(mapActionItemRow));
        if (mdcRes.data) setMeetingDocs(mdcRes.data.map(mapMeetingDocumentRow));
        return;
      }
      if (slice === 'tickets') {
        const [tktRes, trsRes, tevRes, hrtRes] = await Promise.all([
          fetchAll(supabase.from('tickets').select('*').order('created_at', { ascending: false }).order('id')),
          fetchAll(supabase.from('ticket_responses').select('*').order('id')),
          fetchAll(supabase.from('ticket_events').select('*').order('id')),
          fetchAll(supabase.from('helpdesk_routing').select('*').order('id')),
        ]);
        if (tktRes.error || trsRes.error || tevRes.error || hrtRes.error) {
          throw tktRes.error || trsRes.error || tevRes.error || hrtRes.error;
        }
        if (tktRes.data) setTickets(tktRes.data.map(mapTicketRow));
        if (trsRes.data) setTicketResponses(trsRes.data.map(mapTicketResponseRow));
        if (tevRes.data) setTicketEvents(tevRes.data.map(mapTicketEventRow));
        if (hrtRes.data) setHelpdeskRouting(hrtRes.data.map(mapHelpdeskRoutingRow));
        return;
      }
      if (slice === 'recruitment' && loadRecruitment) {
        const [vaRes, vpRes, vappRes] = await Promise.all([
          fetchAll(supabase.from('vacancy_advertisements').select('*').order('created_at', { ascending: false }).order('id')),
          fetchAll(supabase.from('vacancy_posts').select('*').order('id')),
          fetchAll(supabase.from('vacancy_applications').select('*').order('applied_on', { ascending: false }).order('id')),
        ]);
        if (vaRes.error || vpRes.error || vappRes.error) {
          throw vaRes.error || vpRes.error || vappRes.error;
        }
        setVacancyAdvertisements(withPostTotals(vaRes.data ? vaRes.data.map(mapVacancyAdvertisementRow) : [], vpRes.data ?? []));
        if (vappRes.data) setVacancyApplications(vappRes.data.map(mapVacancyApplicationRow));
      }
    } catch (err) {
      logger.error('refresh_slice_failed', err, { slice });
      pushToast(`Refresh failed: ${friendlyError(err)}`, 'error');
    }
  }, [provisioned, isAuthenticated, loadContracts, loadRecruitment, pushToast]);

  const saveEquipment = useCallback(async (payload: Record<string, unknown>) => {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error: sbErr } = await supabase.from('equipment').upsert(payload).select().single();
    if (sbErr) throw sbErr;
    const saved = mapEquipmentRow(data);
    setRawEquipment(prev => [saved, ...prev.filter(e => e.UInsID !== saved.UInsID)]);
  }, []);

  const value = useMemo(() => ({
    divisions, staff, projects, projectStaff, phDStudents, phdMilestones, contractStaff,
    scientificOutputs, ipIntelligence, mous, techTransfers, equipment, labs, vacancyAdvertisements,
    vacancyApplications, committees, committeeMembers, meetings, agendaItems, actionItems,
    meetingDocs, tickets, ticketResponses, ticketEvents, helpdeskRouting, calendarEvents, holidays,
    importEvents, contributionRequests, dataStewards, refreshContributions, refreshCalendar,
    refreshHolidays, refreshSlice, isLoading,
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
    refreshHolidays, refreshSlice, isLoading, provisioned, loadData, saveEquipment, error,
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
