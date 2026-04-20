import type { DivisionInfo, StaffMember, ProjectInfo, ProjectStaff, PhDStudent, Equipment, ScientificOutput, IPIntelligence, ContractStaff, VacancyAdvertisement, VacancyPost, Notification } from '../types';

/**
 * These mappers will eventually transform raw Supabase rows 
 * (which might have snake_case or different types) into our 
 * strongly-typed frontend models.
 * 
 * For now, they act as passthrough functions for the mock data,
 * but this creates the necessary boundary for when we connect the DB.
 */

export const mapDivisionRow = (row: any): DivisionInfo => {
  return {
    divCode: row.divCode || row.div_code || '',
    divName: row.divName || row.div_name || '',
    divDescription: row.divDescription || row.div_description || '',
    divResearchAreas: row.divResearchAreas || row.div_research_areas || '',
    divHoD: row.divHoD || row.div_hod || '',
    divHoDID: row.divHoDID || row.div_hod_id || '',
    divSanctionedstrength: parseInt(row.divSanctionedstrength || row.div_sanctionedstrength || '0', 10),
    divCurrentStrength: parseInt(row.divCurrentStrength || row.div_current_strength || '0', 10),
    divStatus: row.divStatus || row.div_status || 'Active',
  };
};

export const mapStaffRow = (row: any): StaffMember => {
  return {
    ID: String(row.ID || row.id || ''),
    LabCode: row.LabCode || row.lab_code || '',
    EmployeeType: row.EmployeeType || row.employee_type || '',
    Name: row.Name || row.name || '',
    Designation: row.Designation || row.designation || '',
    Group: row.Group || row.group_name || '',
    Division: row.Division || row.division || '',
    DoAPP: row.DoAPP || row.doapp || '',
    DOJ: row.DOJ || row.doj || '',
    DOB: row.DOB || row.dob || '',
    Cat: row.Cat || row.cat || '',
    AppointmentType: row.AppointmentType || row.appointment_type || '',
    Level: String(row.Level || row.level || ''),
    CoreArea: row.CoreArea || row.core_area || '',
    Expertise: row.Expertise || row.expertise || '',
    Email: row.Email || row.email || '',
    Ext: String(row.Ext || row.ext || ''),
    VidwanID: row.VidwanID || row.vidwan_id || '',
    ReportingID: String(row.ReportingID || row.reporting_id || ''),
    HighestQualification: row.HighestQualification || row.highest_qualification || '',
    Gender: row.Gender || row.gender || '',
  };
};

export const mapProjectRow = (row: any): ProjectInfo => {
  return {
    ProjectID: row.ProjectID || row.project_id || '',
    ProjectNo: row.ProjectNo || row.project_no || '',
    ProjectName: row.ProjectName || row.project_name || '',
    FundType: row.FundType || row.fund_type || '',
    SponsorerType: row.SponsorerType || row.sponsorer_type || '',
    SponsorerName: row.SponsorerName || row.sponsorer_name || '',
    ProjectCategory: row.ProjectCategory || row.project_category || '',
    ProjectStatus: row.ProjectStatus || row.project_status || '',
    StartDate: row.StartDate || row.start_date || '',
    CompletioDate: row.CompletioDate || row.completio_date || row.completion_date || '',
    SanctionedCost: String(row.SanctionedCost || row.sanctioned_cost || ''),
    UtilizedAmount: String(row.UtilizedAmount || row.utilized_amount || ''),
    PrincipalInvestigator: row.PrincipalInvestigator || row.principal_investigator || '',
    DivisionCode: row.DivisionCode || row.division_code || '',
    Extension: row.Extension || row.extension || '',
    ApprovalAuthority: row.ApprovalAuthority || row.approval_authority || '',
  };
};

export const mapProjectStaffRow = (row: any): ProjectStaff => ({
  id: String(row.id || row.ID || ''),
  ProjectNo: row.ProjectNo || row.project_no || '',
  StaffName: row.StaffName || row.staff_name || '',
  Designation: row.Designation || row.designation || '',
  RecruitmentCycle: row.RecruitmentCycle || row.recruitment_cycle || '',
  DateOfJoining: row.DateOfJoining || row.date_of_joining || '',
  DateOfProjectDuration: row.DateOfProjectDuration || row.date_of_project_duration || '',
  PIName: row.PIName || row.pi_name || '',
  DivisionCode: row.DivisionCode || row.division_code || '',
});

export const mapPhDStudentRow = (row: any): PhDStudent => ({
  EnrollmentNo: row.EnrollmentNo || row.enrollment_no || '',
  StudentName: row.StudentName || row.student_name || '',
  Specialization: row.Specialization || row.specialization || '',
  SupervisorName: row.SupervisorName || row.supervisor_name || '',
  CoSupervisorName: row.CoSupervisorName || row.co_supervisor_name || 'None',
  FellowshipDetails: row.FellowshipDetails || row.fellowship_details || '',
  CurrentStatus: row.CurrentStatus || row.current_status || '',
  ThesisTitle: row.ThesisTitle || row.thesis_title || '',
  ProjectNo: row.ProjectNo || row.project_no || '',
  DivisionCode: row.DivisionCode || row.division_code || '',
});

export const mapEquipmentRow = (row: any): Equipment => ({
  UInsID: row.UInsID || row.u_ins_id || row.id || '',
  Name: row.Name || row.name || '',
  EndUse: row.EndUse || row.end_use || '',
  Division: row.Division || row.division || '',
  IndenterName: row.IndenterName || row.indenter_name || '',
  OperatorName: row.OperatorName || row.operator_name || '',
  Location: row.Location || row.location || '',
  WorkingStatus: row.WorkingStatus || row.working_status || '',
  Movable: row.Movable || row.movable || '',
  RequirementInstallation: row.RequirementInstallation || row.requirement_installation || '',
  Justification: row.Justification || row.justification || '',
  Remark: row.Remark || row.remark || '',
});

export const mapScientificOutputRow = (row: any): ScientificOutput => ({
  id: String(row.id || ''),
  title: row.title || '',
  authors: Array.isArray(row.authors) ? row.authors : [],
  journal: row.journal || '',
  year: parseInt(row.year || '0', 10),
  doi: row.doi || undefined,
  impactFactor: row.impact_factor != null ? parseFloat(row.impact_factor) : undefined,
  citationCount: row.citation_count != null ? parseInt(row.citation_count, 10) : undefined,
  divisionCode: row.division_code || '',
});

export const mapIPIntelligenceRow = (row: any): IPIntelligence => ({
  id: String(row.id || ''),
  title: row.title || '',
  type: row.type || 'Patent',
  status: row.status || 'Filed',
  filingDate: row.filing_date || '',
  grantDate: row.grant_date || undefined,
  inventors: Array.isArray(row.inventors) ? row.inventors : [],
  divisionCode: row.division_code || '',
});

export const mapContractStaffRow = (row: any): ContractStaff => ({
  id: String(row.id || row.ID || ''),
  Name: row.Name || row.name || '',
  Designation: row.Designation || row.designation || '',
  Division: row.Division || row.division || '',
  DateOfJoining: row.DateOfJoining || row.date_of_joining || '',
  ContractEndDate: row.ContractEndDate || row.contract_end_date || '',
  LabCode: row.LabCode || row.lab_code || '',
  DateOfBirth: row.DateOfBirth || row.date_of_birth || '',
  AttachedToStaffID: row.AttachedToStaffID || row.attached_to_staff_id || '',
});

export const mapVacancyAdvertisementRow = (row: any): VacancyAdvertisement => ({
  id: String(row.id || ''),
  title: row.title || '',
  description: row.description || '',
  designation: row.designation || '',
  division: row.division || '',
  numberOfPositions: parseInt(row.numberOfPositions || row.number_of_positions || '1', 10),
  qualifications: row.qualifications || '',
  salary: row.salary || undefined,
  applicationDeadline: row.applicationDeadline || row.application_deadline || '',
  createdAt: row.createdAt || row.created_at || '',
  status: row.status || 'Open',
});

export const mapVacancyPostRow = (row: any): VacancyPost => ({
  id: String(row.id || ''),
  vacancyId: String(row.vacancyId || row.vacancy_id || ''),
  candidateName: row.candidateName || row.candidate_name || '',
  email: row.email || '',
  phoneNumber: row.phoneNumber || row.phone_number || '',
  qualifications: row.qualifications || '',
  experience: row.experience || '',
  applicationDate: row.applicationDate || row.application_date || '',
  status: row.status || 'Received',
  notes: row.notes || undefined,
});

export const mapNotificationRow = (row: any): Notification => ({
  id: String(row.id || ''),
  user_id: String(row.user_id || ''),
  title: row.title || '',
  body: row.body || '',
  type: row.type || 'announcement',
  read: Boolean(row.read),
  entity_type: row.entity_type || null,
  entity_id: row.entity_id || null,
  created_at: row.created_at || '',
});
