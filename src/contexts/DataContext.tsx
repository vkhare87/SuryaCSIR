/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type {
  DivisionInfo,
  StaffMember,
  ProjectInfo,
  ProjectStaff,
  PhDStudent,
  Equipment,
  Lab,
  ScientificOutput,
  IPIntelligence,
  ContractStaff,
  VacancyAdvertisement,
  VacancyPost,
  Role,
  Committee,
  Meeting,
  ActionItem,
  MeetingDocument,
  Ticket,
  TicketResponse,
  TicketEvent,
  CommitteeMember,
  AgendaItem,
} from '../types';
import { supabase, isProvisioned } from '../utils/supabaseClient';
import {
  mapDivisionRow,
  mapStaffRow,
  mapProjectRow,
  mapProjectStaffRow,
  mapPhDStudentRow,
  mapEquipmentRow,
  mapLabRow,
  mapScientificOutputRow,
  mapIPIntelligenceRow,
  mapContractStaffRow,
  mapVacancyAdvertisementRow,
  mapVacancyPostRow,
  mapCommitteeRow,
  mapMeetingRow,
  mapActionItemRow,
  mapMeetingDocumentRow,
  mapTicketRow,
  mapTicketResponseRow,
  mapTicketEventRow,
  mapCommitteeMemberRow,
  mapAgendaItemRow,
} from '../utils/dataMapper';
import {
  mockDivisions,
  mockStaff,
  mockProjects,
  mockProjectStaff,
  mockPhDStudents,
  mockEquipment,
  mockLabs,
  mockScientificOutputs,
  mockIPIntelligence,
  mockCommittees,
  mockMeetings,
  mockActionItems,
  mockMeetingDocuments,
  mockTickets,
  mockTicketResponses,
  mockTicketEvents,
  mockCommitteeMembers,
  mockAgendaItems,
} from '../utils/mockData';
import { useAuth } from './AuthContext';

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
  contractStaff: ContractStaff[];
  scientificOutputs: ScientificOutput[];
  ipIntelligence: IPIntelligence[];
  equipment: Equipment[];
  labs: Lab[];
  vacancyAdvertisements: VacancyAdvertisement[];
  vacancyPosts: VacancyPost[];
  committees: Committee[];
  meetings: Meeting[];
  actionItems: ActionItem[];
  meetingDocs: MeetingDocument[];
  committeeMembers: CommitteeMember[];
  agendaItems: AgendaItem[];
  tickets: Ticket[];
  ticketResponses: TicketResponse[];
  ticketEvents: TicketEvent[];
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
  const { role, divisionCode, user } = useAuth();
  const provisioned = isProvisioned();

  const [divisions, setDivisions] = useState<DivisionInfo[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [projectStaff, setProjectStaff] = useState<ProjectStaff[]>([]);
  const [phDStudents, setPhDStudents] = useState<PhDStudent[]>([]);
  const [contractStaff, setContractStaff] = useState<ContractStaff[]>([]);
  const [scientificOutputs, setScientificOutputs] = useState<ScientificOutput[]>([]);
  const [ipIntelligence, setIPIntelligence] = useState<IPIntelligence[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [vacancyAdvertisements, setVacancyAdvertisements] = useState<VacancyAdvertisement[]>([]);
  const [vacancyPosts, setVacancyPosts] = useState<VacancyPost[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [meetingDocs, setMeetingDocs] = useState<MeetingDocument[]>([]);
  const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketResponses, setTicketResponses] = useState<TicketResponse[]>([]);
  const [ticketEvents, setTicketEvents] = useState<TicketEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (provisioned && supabase && user?.id !== 'dev-admin') {
        // ----- Supabase branch -----
        const [
          divRes, staffRes, projRes, psRes, phdRes, equipRes, labsRes, soRes, ipRes, csRes,
          vaRes, vpRes,
          cmtRes, cmmRes, mtgRes, agiRes, actRes, mdcRes, tktRes, trsRes, tevRes,
        ] = await Promise.all([
          supabase.from('divisions').select('*'),
          supabase.from('staff').select('*'),
          supabase.from('projects').select('*'),
          supabase.from('project_staff').select('*'),
          supabase.from('phd_students').select('*'),
          supabase.from('equipment').select('*'),
          supabase.from('labs').select('*'),
          supabase.from('scientific_outputs').select('*'),
          supabase.from('ip_intelligence').select('*'),
          supabase.from('contract_staff').select('*'),
          supabase.from('vacancy_advertisements').select('*').order('created_at', { ascending: false }),
          supabase.from('vacancy_posts').select('*'),
          supabase.from('committees').select('*'),
          supabase.from('committee_members').select('*'),
          supabase.from('meetings').select('*'),
          supabase.from('agenda_items').select('*'),
          supabase.from('action_items').select('*'),
          supabase.from('meeting_documents').select('*'),
          supabase.from('tickets').select('*').order('created_at', { ascending: false }),
          supabase.from('ticket_responses').select('*'),
          supabase.from('ticket_events').select('*'),
        ]);

        setCommitteeMembers(cmmRes.data ? cmmRes.data.map(mapCommitteeMemberRow) : []);
        setAgendaItems(agiRes.data ? agiRes.data.map(mapAgendaItemRow) : []);

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
        setVacancyAdvertisements(vaRes.data ? vaRes.data.map(mapVacancyAdvertisementRow) : []);
        setVacancyPosts(vpRes.data ? vpRes.data.map(mapVacancyPostRow) : []);
        setCommittees(cmtRes.data ? cmtRes.data.map(mapCommitteeRow) : []);
        setMeetings(mtgRes.data ? mtgRes.data.map(mapMeetingRow) : []);
        setActionItems(actRes.data ? actRes.data.map(mapActionItemRow) : []);
        setMeetingDocs(mdcRes.data ? mdcRes.data.map(mapMeetingDocumentRow) : []);
        setTickets(tktRes.data ? tktRes.data.map(mapTicketRow) : []);
        setTicketResponses(trsRes.data ? trsRes.data.map(mapTicketResponseRow) : []);
        setTicketEvents(tevRes.data ? tevRes.data.map(mapTicketEventRow) : []);
      } else {
        // ----- Mock fallback branch -----
        setDivisions(mockDivisions);
        setStaff(scopeData(mockStaff, role, divisionCode));
        setProjects(scopeProjects(mockProjects, role, divisionCode));
        setProjectStaff(mockProjectStaff);
        setPhDStudents(mockPhDStudents);
        setContractStaff([]);
        setEquipment(scopeData(mockEquipment, role, divisionCode));
        setLabs(mockLabs);
        setScientificOutputs(mockScientificOutputs);
        setIPIntelligence(mockIPIntelligence);
        setVacancyAdvertisements([]);
        setVacancyPosts([]);
        setCommittees(mockCommittees);
        setMeetings(mockMeetings);
        setActionItems(mockActionItems);
        setMeetingDocs(mockMeetingDocuments);
        setCommitteeMembers(mockCommitteeMembers);
        setAgendaItems(mockAgendaItems);
        setTickets(mockTickets);
        setTicketResponses(mockTicketResponses);
        setTicketEvents(mockTicketEvents);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      setError(message);
      console.error('DataContext: failed to load data', err);
      // Fallback to mock on error
      setDivisions(mockDivisions);
      setStaff(mockStaff);
      setProjects(mockProjects);
      setProjectStaff(mockProjectStaff);
      setPhDStudents(mockPhDStudents);
      setContractStaff([]);
      setEquipment(mockEquipment);
      setLabs(mockLabs);
      setScientificOutputs(mockScientificOutputs);
      setIPIntelligence(mockIPIntelligence);
      setVacancyAdvertisements([]);
      setVacancyPosts([]);
      setCommittees(mockCommittees);
      setMeetings(mockMeetings);
      setActionItems(mockActionItems);
      setMeetingDocs(mockMeetingDocuments);
      setCommitteeMembers(mockCommitteeMembers);
      setAgendaItems(mockAgendaItems);
      setTickets(mockTickets);
      setTicketResponses(mockTicketResponses);
      setTicketEvents(mockTicketEvents);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [provisioned, role, divisionCode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DataContext.Provider value={{
      divisions,
      staff,
      projects,
      projectStaff,
      phDStudents,
      contractStaff,
      scientificOutputs,
      ipIntelligence,
      equipment,
      labs,
      vacancyAdvertisements,
      vacancyPosts,
      committees,
      meetings,
      actionItems,
      meetingDocs,
      committeeMembers,
      agendaItems,
      tickets,
      ticketResponses,
      ticketEvents,
      isLoading,
      isBackendProvisioned: provisioned,
      refreshData: loadData,
      saveEquipment: async (payload) => {
        if (!supabase) throw new Error('Supabase not configured');
        const { error: sbErr } = await supabase.from('equipment').upsert(payload);
        if (sbErr) throw sbErr;
        await loadData();
      },
      error,
    }}>
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
