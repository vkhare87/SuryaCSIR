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

export interface Equipment {
  UInsID: string;
  Name: string;
  EndUse: string;
  Division: string; // References DivisionInfo.divCode
  IndenterName: string;
  OperatorName: string;
  Location: string;
  WorkingStatus: string;
  Movable: string;
  RequirementInstallation: string;
  Justification: string;
  Remark: string;
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

// UI State Types

export type Role =
  | 'Director'
  | 'DivisionHead'
  | 'Scientist'
  | 'Technician'
  | 'HRAdmin'
  | 'FinanceAdmin'
  | 'SystemAdmin'
  | 'MasterAdmin';

export interface UserAccount {
  id: string;           // Supabase auth.users UUID
  email: string;
  role: Role;
  divisionCode: string | null;  // from user_roles.division_code; null for non-division-scoped roles
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
