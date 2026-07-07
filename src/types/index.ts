// Core entities based on the Excel/CSV data schema

export interface DivisionInfo {
  divCode: string;
  divName: string;
  divDescription: string;
  divResearchAreas: string;
  divHoD: string;
  divHoDID: string; // References StaffMember.ID
  divSanctionedstrength: number;
  divCurrentStrength: number;
  divStatus: 'Active' | 'Inactive';
}

export interface StaffMember {
  ID: string;
  LabCode: string;
  EmployeeType: string;
  Name: string;
  Designation: string;
  Group: string;
  Division: string; // References DivisionInfo.divCode
  DoAPP: string;
  DOJ: string;
  DOB: string;
  Cat: string;
  AppointmentType: string;
  Level: string;
  CoreArea: string;
  Expertise: string;
  Email: string;
  Ext: string;
  VidwanID: string;
  ReportingID: string; // References StaffMember.ID
  HighestQualification: string;
  Gender: string; // 'Male' | 'Female'
}

export interface ProjectInfo {
  ProjectID: string;
  ProjectNo: string;
  ProjectName: string;
  FundType: string;
  SponsorerType: string;
  SponsorerName: string;
  ProjectCategory: string;
  ProjectStatus: string;
  StartDate: string;
  CompletioDate: string;
  SanctionedCost: string;
  UtilizedAmount: string;
  PrincipalInvestigator: string; // May reference StaffName or StaffID
  DivisionCode: string;
  Extension: string;
  ApprovalAuthority: string;
}

export type Project = ProjectInfo;

export interface ProjectStaff {
  id: string; // Generated UUID
  ProjectNo: string; // References ProjectInfo.ProjectNo
  StaffName: string;
  Designation: string;
  RecruitmentCycle: string;
  DateOfJoining: string;
  DateOfProjectDuration: string;
  PIName: string;
  DivisionCode: string;
}

export interface PhDStudent {
  EnrollmentNo: string;
  StudentName: string;
  Specialization: string;
  SupervisorName: string; // References StaffName
  CoSupervisorName: string;
  FellowshipDetails: string;
  CurrentStatus: string;
  ThesisTitle: string;
  ProjectNo: string; // Optional reference to ProjectInfo
  DivisionCode: string;
}

export type PhDMilestoneName =
  | 'Joining' | 'Coursework' | 'Comprehensive Exam' | 'Registration'
  | 'Synopsis Submission' | 'Thesis Submission' | 'Viva Voce' | 'Degree Awarded';

export interface PhDMilestone {
  id: string;
  enrollmentNo: string;
  milestone: PhDMilestoneName;
  dueDate?: string;
  completedDate?: string;
  remarks?: string;
}

export interface Equipment {
  UInsID: string;
  instrument_code?: string;
  Name: string;
  serial_number?: string;
  manufacturer?: string;
  year_of_manufacture?: number;
  EndUse: string;
  lab_id?: string;
  Division: string;
  IndenterName: string;
  owner_user_id?: string;
  OperatorName: string;
  Location: string;
  amc_end_date?: string;
  WorkingStatus: string;
  Movable: string;
  RequirementInstallation: string;
  purchase_cost?: number;
  procurement_date?: string;
  Justification: string;
  Remark: string;
}

export interface Lab {
  id: string;
  lab_code: string;
  lab_name: string;
  div_code?: string;
}

export interface ScientificOutput {
  id: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  doi?: string;
  impactFactor?: number;
  citationCount?: number;
  divisionCode: string;
}

export interface IPIntelligence {
  id: string;
  title: string;
  type: 'Patent' | 'Copyright' | 'Design' | 'Trademark';
  status: 'Filed' | 'Published' | 'Granted';
  filingDate: string;
  grantDate?: string;
  inventors: string[];
  divisionCode: string;
}

export interface MoU {
  id: string;
  partnerName: string;
  partnerType: 'Academic' | 'Industry' | 'Government' | 'International' | 'Other';
  purpose: string;
  signedDate: string;
  validUntil: string;
  status: 'Active' | 'Expired' | 'Under Renewal' | 'Terminated';
  divisionCode: string;
  linkedProjectNo?: string;
  remarks?: string;
}

export interface TechTransfer {
  id: string;
  technologyTitle: string;
  licensee: string;
  licenseeType: 'Industry' | 'Startup' | 'PSU' | 'Government' | 'Other';
  agreementType: 'License' | 'Know-how Transfer' | 'Joint Development' | 'Consultancy' | 'Sponsored';
  agreementDate: string;
  valueLakhs?: number;
  status: 'Under Negotiation' | 'Signed' | 'Active' | 'Completed' | 'Terminated';
  linkedProjectNo?: string;
  linkedIpId?: string;
  divisionCode: string;
  remarks?: string;
}

// UI State Types

export type Role =
  | 'Director'
  | 'DivisionHead'
  | 'HOD'
  | 'Scientist'
  | 'Technician'
  | 'HRAdmin'
  | 'FinanceAdmin'
  | 'SystemAdmin'
  | 'MasterAdmin'
  | 'Student'
  | 'ProjectStaff'
  | 'Guest'
  | 'DefaultUser'
  | 'EmpoweredCommittee';

export interface UserAccount {
  id: string;
  email: string;
  roles: Role[];         // all assigned roles
  activeRole: Role;      // currently active role (drives dashboard view)
  divisionCode: string | null;
  mustChangePassword: boolean;
}

export interface ContractStaff {
  id: string;
  Name: string;
  Designation: string;
  Division: string;
  DateOfJoining: string;
  ContractEndDate: string;
  LabCode: string;
  DateOfBirth: string;
  AttachedToStaffID: string;
}

export interface VacancyAdvertisement {
  id: string;
  title: string;
  description: string;
  designation: string;
  division: string;
  numberOfPositions: number;
  qualifications: string;
  salary?: string;
  applicationDeadline: string;
  createdAt: string;
  status: 'Open' | 'Closed' | 'Archived';
}

export interface VacancyPost {
  id: string;
  vacancyId: string; // References VacancyAdvertisement.id
  candidateName: string;
  email: string;
  phoneNumber: string;
  qualifications: string;
  experience: string;
  applicationDate: string;
  status: 'Received' | 'Shortlisted' | 'Interviewed' | 'Selected' | 'Rejected';
  notes?: string;
}

export type UIDensity = 'compact' | 'medium' | 'relaxed';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'deadline' | 'announcement';
  read: boolean;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

// --- v1.0 Committees & Helpdesk ---

export interface Committee {
  id: string;
  name: string;
  committee_type: 'Standing' | 'AdHoc' | 'Review' | 'Advisory';
  mandate: string;
  chairperson_id: string;
  secretary_id: string;
  status: 'Active' | 'Inactive';
  formed_date: string;
  created_at: string;
}

export interface CommitteeMember {
  id: string;
  committee_id: string;
  staff_id: string;
  role: 'Member' | 'Invitee' | 'ExternalExpert';
}

export interface Meeting {
  id: string;
  committee_id: string;
  meeting_date: string;
  venue: string;
  title: string;
  summary: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  created_at: string;
  teams_url: string | null;
  pamphlet_url: string | null;
}

export interface AgendaItem {
  id: string;
  meeting_id: string;
  sequence: number;
  description: string;
  proposed_by: string;
  status: 'Pending' | 'Discussed' | 'Deferred';
}

export interface ActionItem {
  id: string;
  meeting_id: string | null;
  source: 'meeting' | 'manual';
  task: string;
  assigned_to: string;
  deadline: string;
  status: 'Pending' | 'InProgress' | 'Completed';
  completed_at: string | null;
  notes: string;
}

export interface MeetingDocument {
  id: string;
  meeting_id: string;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
}

// --- Helpdesk Types ---

export type TicketCategory =
  | 'Infrastructure'
  | 'EquipmentIT'
  | 'Administrative'
  | 'HRGrievance'
  | 'Finance'
  | 'LabResearch'
  | 'Library'
  | 'Transport';

export type TicketUrgency = 'Low' | 'Medium' | 'High' | 'Critical';

export type TicketStatus = 'Open' | 'InProgress' | 'Resolved' | 'Closed';

export type TicketEventType =
  | 'Created'
  | 'Assigned'
  | 'StatusChanged'
  | 'Resolved'
  | 'Closed'
  | 'Reopened';

export interface Ticket {
  id: string;
  token: string;
  subject: string;
  category: TicketCategory;
  urgency: TicketUrgency;
  description: string;
  submitted_by: string;
  assigned_to: string | null;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface TicketResponse {
  id: string;
  ticket_id: string;
  author_id: string;
  message: string;
  created_at: string;
}

export interface TicketEvent {
  id: string;
  ticket_id: string;
  event_type: TicketEventType;
  actor_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface HelpdeskRouting {
  id: string;
  category: TicketCategory;
  target_type: 'role' | 'division';
  target_id: string;
}

// --- Calendar Event Types ---

export interface CalendarEvent {
  id: string;
  title: string;
  event_date: string;
  event_kind: 'Custom' | 'Pamphlet' | 'Announcement';
  location: string;
  teams_url: string | null;
  pamphlet_url: string | null;
  description: string;
  visibility: 'OrgWide' | 'Division' | 'Personal';
  division_code: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  holiday_type: 'Gazetted' | 'Restricted' | 'Institute';
  year: number;
}

export interface AccessRequest {
  id: string;
  user_id: string;
  email: string | null;
  requested_roles: Role[];
  requested_division: string | null;
  justification: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}
