import type { DivisionInfo, StaffMember, ProjectInfo, ProjectStaff, PhDStudent, Equipment } from '../types';

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
