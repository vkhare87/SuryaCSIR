import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// FileType
// ---------------------------------------------------------------------------

export type FileType = 'staff' | 'divisions' | 'projects' | 'projectStaff' | 'phd' | 'equipment' | 'contractStaff';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50;

/**
 * Maps Excel/CSV header names to canonical Supabase column names.
 * Only column names listed here will be renamed; others pass through as-is.
 */
export const SCHEMA_MAPS: Record<FileType, Record<string, string>> = {
  staff: {
    'Employee ID':           'ID',
    'Lab Code':              'LabCode',
    'Employee Type':         'EmployeeType',
    'Name':                  'Name',
    'Designation':           'Designation',
    'Group':                 'Group',
    'Division':              'Division',
    'Date of Appointment':   'DoAPP',
    'Date of Joining':       'DOJ',
    'Date of Birth':         'DOB',
    'Category':              'Cat',
    'Appointment Type':      'AppointmentType',
    'Level':                 'Level',
    'Core Area':             'CoreArea',
    'Expertise':             'Expertise',
    'Email':                 'Email',
    'Extension':             'Ext',
    'Vidwan ID':             'VidwanID',
    'Reporting ID':          'ReportingID',
    'Highest Qualification': 'HighestQualification',
    'Gender':                'Gender',
    'DoAPP':                 'DoAPP',
    'DOJ':                   'DOJ',
    'DOB':                   'DOB',
    'Cat':                   'Cat',
    'Ext':                   'Ext',
    'VidwanID':              'VidwanID',
    'ReportingID':           'ReportingID',
    'HighestQualification':  'HighestQualification',
  },
  divisions: {
    'Division Code':        'divCode',
    'Division Name':        'divName',
    'Description':          'divDescription',
    'Research Areas':       'divResearchAreas',
    'Head of Division':     'divHoD',
    'HoD ID':               'divHoDID',
    'Sanctioned Strength':  'divSanctionedstrength',
    'Current Strength':     'divCurrentStrength',
    'Status':               'divStatus',
    'divCode':              'divCode',
    'divName':              'divName',
    'divDescription':       'divDescription',
    'divResearchAreas':     'divResearchAreas',
    'divHoD':               'divHoD',
    'divHoDID':             'divHoDID',
    'divSanctionedstrength':'divSanctionedstrength',
    'divCurrentStrength':   'divCurrentStrength',
    'divStatus':            'divStatus',
  },
  projects: {
    'Project ID':              'ProjectID',
    'Project No':              'ProjectNo',
    'Project Name':            'ProjectName',
    'Fund Type':               'FundType',
    'Sponsorer Type':          'SponsorerType',
    'Sponsorer Name':          'SponsorerName',
    'Project Category':        'ProjectCategory',
    'Project Status':          'ProjectStatus',
    'Start Date':              'StartDate',
    'Completion Date':         'CompletioDate',
    'Sanctioned Cost':         'SanctionedCost',
    'Utilized Amount':         'UtilizedAmount',
    'Principal Investigator':  'PrincipalInvestigator',
    'Division Code':           'DivisionCode',
    'Extension':               'Extension',
    'Approval Authority':      'ApprovalAuthority',
    'ProjectID':               'ProjectID',
    'ProjectNo':               'ProjectNo',
    'ProjectName':             'ProjectName',
    'FundType':                'FundType',
    'SponsorerType':           'SponsorerType',
    'SponsorerName':           'SponsorerName',
    'ProjectCategory':         'ProjectCategory',
    'ProjectStatus':           'ProjectStatus',
    'StartDate':               'StartDate',
    'CompletioDate':           'CompletioDate',
    'SanctionedCost':          'SanctionedCost',
    'UtilizedAmount':          'UtilizedAmount',
    'PrincipalInvestigator':   'PrincipalInvestigator',
    'DivisionCode':            'DivisionCode',
    'ApprovalAuthority':       'ApprovalAuthority',
  },
  projectStaff: {
    'Staff Name':               'StaffName',
    'Project No':               'ProjectNo',
    'Designation':              'Designation',
    'Recruitment Cycle':        'RecruitmentCycle',
    'Date of Joining':          'DateOfJoining',
    'Date of Project Duration': 'DateOfProjectDuration',
    'PI Name':                  'PIName',
    'Id':                       'id',
    'StaffName':                'StaffName',
    'ProjectStaffName':         'StaffName',
    'ProjectNo':                'ProjectNo',
    'RecruitmentCycle':         'RecruitmentCycle',
    'Recruitment_cycle':        'RecruitmentCycle',
    'DateOfJoining':            'DateOfJoining',
    'DateOfProjectDuration':    'DateOfProjectDuration',
    'PIName':                   'PIName',
  },
  phd: {
    'Enrollment No':     'EnrollmentNo',
    'Student Name':      'StudentName',
    'Name of student':   'StudentName',
    'Specialization':    'Specialization',
    'Specialisation':    'Specialization',
    'Supervisor Name':   'SupervisorName',
    'Co-Supervisor':     'CoSupervisorName',
    'Name of Co-supervisor/specialisation/institute': 'CoSupervisorName',
    'Fellowship':        'FellowshipDetails',
    'Fellowship/financial support Details/Self financed/Industry sponsored/Working Employee': 'FellowshipDetails',
    'Current Status':    'CurrentStatus',
    'Thesis Title':      'ThesisTitle',
    'Project No':        'ProjectNo',
    'EnrollmentNo':      'EnrollmentNo',
    'StudentName':       'StudentName',
    'SupervisorName':    'SupervisorName',
    'CoSupervisorName':  'CoSupervisorName',
    'FellowshipDetails': 'FellowshipDetails',
    'CurrentStatus':     'CurrentStatus',
    'ThesisTitle':       'ThesisTitle',
    'ProjectNo':         'ProjectNo',
  },
  equipment: {
    'Instrument ID':              'UInsID',
    'Instrument Code':            'instrument_code',
    'Name':                       'Name',
    'Name_Equipment':             'Name',
    'Serial Number':              'serial_number',
    'Manufacturer':               'manufacturer',
    'Year of Manufacture':        'year_of_manufacture',
    'End Use':                    'EndUse',
    'Lab ID':                     'lab_id',
    'Division':                   'Division',
    'Indenter Name':              'IndenterName',
    'Owner User ID':              'owner_user_id',
    'Operator Name':              'OperatorName',
    'Location':                   'Location',
    'AMC End Date':               'amc_end_date',
    'Working Status':             'WorkingStatus',
    'Movable':                    'Movable',
    'Requirement/Installation':   'RequirementInstallation',
    'Purchase Cost':              'purchase_cost',
    'Procurement Date':           'procurement_date',
    'Justification':              'Justification',
    'Remark':                     'Remark',
    'UInsID':                     'UInsID',
    'instrument_code':            'instrument_code',
    'serial_number':              'serial_number',
    'manufacturer':               'manufacturer',
    'year_of_manufacture':        'year_of_manufacture',
    'IndenterName':               'IndenterName',
    'OperatorName':               'OperatorName',
    'WorkingStatus':              'WorkingStatus',
    'RequirementInstallation':    'RequirementInstallation',
    'amc_end_date':               'amc_end_date',
    'purchase_cost':              'purchase_cost',
    'procurement_date':           'procurement_date',
  },
  contractStaff: {
    'Name':                 'Name',
    'Designation':          'Designation',
    'Division':             'Division',
    'Date of Joining':      'DateOfJoining',
    'Contract End Date':    'ContractEndDate',
    'Lab Code':             'LabCode',
    'Date of Birth':        'DateOfBirth',
    'Attached To':          'AttachedToStaffID',
    'DateOfJoining':        'DateOfJoining',
    'ContractEndDate':      'ContractEndDate',
    'LabCode':              'LabCode',
    'DateOfBirth':          'DateOfBirth',
    'AttachedToStaffID':    'AttachedToStaffID',
  },
};

/**
 * Per-type column whitelist. Only columns in this list survive formatData.
 * Includes Gender in staff per Concern #9.
 */
export const ALLOWED_COLUMNS: Record<FileType, string[]> = {
  staff: [
    'ID', 'LabCode', 'EmployeeType', 'Name', 'Designation', 'Group', 'Division',
    'DoAPP', 'DOJ', 'DOB', 'Cat', 'AppointmentType', 'Level', 'CoreArea',
    'Expertise', 'Email', 'Ext', 'VidwanID', 'ReportingID', 'HighestQualification', 'Gender',
  ],
  divisions: [
    'divCode', 'divName', 'divDescription', 'divResearchAreas', 'divHoD',
    'divHoDID', 'divSanctionedstrength', 'divCurrentStrength', 'divStatus',
  ],
  projects: [
    'ProjectID', 'ProjectNo', 'ProjectName', 'FundType', 'SponsorerType',
    'SponsorerName', 'ProjectCategory', 'ProjectStatus', 'StartDate', 'CompletioDate',
    'SanctionedCost', 'UtilizedAmount', 'PrincipalInvestigator', 'DivisionCode',
    'Extension', 'ApprovalAuthority',
  ],
  projectStaff: [
    'id', 'ProjectNo', 'StaffName', 'Designation', 'RecruitmentCycle',
    'DateOfJoining', 'DateOfProjectDuration', 'PIName',
  ],
  phd: [
    'EnrollmentNo', 'StudentName', 'Specialization', 'SupervisorName',
    'CoSupervisorName', 'FellowshipDetails', 'CurrentStatus', 'ThesisTitle', 'ProjectNo',
  ],
  equipment: [
    'UInsID', 'instrument_code', 'Name', 'serial_number', 'manufacturer',
    'year_of_manufacture', 'EndUse', 'lab_id', 'Division', 'IndenterName',
    'owner_user_id', 'OperatorName', 'Location', 'amc_end_date', 'WorkingStatus',
    'Movable', 'RequirementInstallation', 'purchase_cost', 'procurement_date',
    'Justification', 'Remark',
  ],
  contractStaff: [
    'id', 'Name', 'Designation', 'Division', 'DateOfJoining',
    'ContractEndDate', 'LabCode', 'DateOfBirth', 'AttachedToStaffID',
  ],
};

/** Maps FileType to the corresponding Supabase table name. */
export const TABLE_NAMES: Record<FileType, string> = {
  staff:        'staff',
  divisions:    'divisions',
  projects:     'projects',
  projectStaff: 'project_staff',
  phd:          'phd_students',
  equipment:    'equipment',
  contractStaff: 'contract_staff',
};

// ---------------------------------------------------------------------------
// Field metadata — single source for templates and the manual-entry grid
// ---------------------------------------------------------------------------

/**
 * Marker placed in the example row of a generated template. formatData drops
 * any row that still contains this value, so an untouched example row never
 * gets imported.
 */
export const EXAMPLE_SENTINEL = '__EXAMPLE__';

/** Human-facing entity names, shared by the import flow and the builder wizard. */
export const FILE_TYPE_LABELS: Record<FileType, string> = {
  staff:         'Human Capital (Staff Directory)',
  divisions:     'Divisions',
  projects:      'Research Projects',
  projectStaff:  'Project Staff',
  phd:           'PhD Scholars',
  equipment:     'Facilities / Equipment',
  contractStaff: 'Contract Staff',
};

export interface FieldMeta {
  /** Canonical Supabase column. Must be a member of ALLOWED_COLUMNS[type]. */
  column: string;
  /** Friendly header used in templates + grid. Must round-trip via SCHEMA_MAPS. */
  label: string;
  required: boolean;
  example: string;
  hint: string;
}

/**
 * Ordered, human-facing field definitions per entity. Drives template
 * generation and the in-app manual grid. Auto-generated PK columns (`id`) and
 * post-import-resolved columns (DivisionCode on project_staff / phd_students)
 * are intentionally omitted — they are never entered by hand.
 */
export const FIELD_META: Record<FileType, FieldMeta[]> = {
  staff: [
    { column: 'ID',                   label: 'Employee ID',           required: true,  example: 'AMP-1024',              hint: 'Unique employee identifier.' },
    { column: 'Name',                 label: 'Name',                  required: true,  example: 'Dr. A. Sharma',         hint: 'Full name with title.' },
    { column: 'Division',             label: 'Division',              required: true,  example: 'MSE',                   hint: 'Division code — must exist in Divisions.' },
    { column: 'Designation',          label: 'Designation',           required: false, example: 'Principal Scientist',   hint: 'Job title.' },
    { column: 'EmployeeType',         label: 'Employee Type',         required: false, example: 'Regular',               hint: 'Regular / Contract / etc.' },
    { column: 'Group',                label: 'Group',                 required: false, example: 'Group IV',              hint: 'Pay/scientific group.' },
    { column: 'LabCode',              label: 'Lab Code',              required: false, example: 'AMP',                   hint: 'Institute lab code.' },
    { column: 'DoAPP',                label: 'Date of Appointment',   required: false, example: '2010-07-15',            hint: 'YYYY-MM-DD.' },
    { column: 'DOJ',                  label: 'Date of Joining',       required: false, example: '2010-08-01',            hint: 'YYYY-MM-DD.' },
    { column: 'DOB',                  label: 'Date of Birth',         required: false, example: '1980-03-22',            hint: 'YYYY-MM-DD.' },
    { column: 'Cat',                  label: 'Category',              required: false, example: 'GEN',                   hint: 'Reservation category.' },
    { column: 'AppointmentType',      label: 'Appointment Type',      required: false, example: 'Permanent',             hint: 'Permanent / Temporary.' },
    { column: 'Level',                label: 'Level',                 required: false, example: '13',                    hint: 'Pay level.' },
    { column: 'CoreArea',             label: 'Core Area',             required: false, example: 'Materials Science',     hint: 'Primary research area.' },
    { column: 'Expertise',            label: 'Expertise',             required: false, example: 'Nanomaterials',         hint: 'Specialisation.' },
    { column: 'Email',                label: 'Email',                 required: false, example: 'a.sharma@ampri.res.in', hint: 'Official email.' },
    { column: 'Ext',                  label: 'Extension',             required: false, example: '2451',                  hint: 'Phone extension.' },
    { column: 'VidwanID',             label: 'Vidwan ID',             required: false, example: '123456',                hint: 'Vidwan profile ID.' },
    { column: 'ReportingID',          label: 'Reporting ID',          required: false, example: 'AMP-1001',              hint: 'Employee ID of reporting officer.' },
    { column: 'HighestQualification', label: 'Highest Qualification', required: false, example: 'Ph.D.',                 hint: 'Highest degree.' },
    { column: 'Gender',               label: 'Gender',                required: false, example: 'Male',                  hint: 'Male / Female.' },
  ],
  divisions: [
    { column: 'divCode',               label: 'Division Code',       required: true,  example: 'MSE',                          hint: 'Unique short code.' },
    { column: 'divName',               label: 'Division Name',       required: true,  example: 'Materials Science & Engg.',    hint: 'Full division name.' },
    { column: 'divDescription',        label: 'Description',         required: false, example: 'Advanced materials research.', hint: 'Brief description.' },
    { column: 'divResearchAreas',      label: 'Research Areas',      required: false, example: 'Nanomaterials; Composites',    hint: 'Semicolon-separated.' },
    { column: 'divHoD',                label: 'Head of Division',    required: false, example: 'Dr. A. Sharma',                hint: 'HoD name.' },
    { column: 'divHoDID',              label: 'HoD ID',              required: false, example: 'AMP-1024',                     hint: 'Employee ID of HoD.' },
    { column: 'divSanctionedstrength', label: 'Sanctioned Strength', required: false, example: '40',                           hint: 'Whole number.' },
    { column: 'divCurrentStrength',    label: 'Current Strength',    required: false, example: '32',                           hint: 'Whole number.' },
    { column: 'divStatus',             label: 'Status',              required: false, example: 'Active',                       hint: 'Active / Inactive.' },
  ],
  projects: [
    { column: 'ProjectID',             label: 'Project ID',             required: true,  example: 'PRJ-001',                  hint: 'Unique project identifier.' },
    { column: 'ProjectNo',             label: 'Project No',             required: true,  example: 'GAP-0125',                 hint: 'Official project number.' },
    { column: 'ProjectName',           label: 'Project Name',           required: true,  example: 'Smart Coatings Study',     hint: 'Full project title.' },
    { column: 'FundType',              label: 'Fund Type',              required: false, example: 'Grant-in-Aid',             hint: 'Funding mechanism.' },
    { column: 'SponsorerType',         label: 'Sponsorer Type',         required: false, example: 'Government',               hint: 'Sponsor category.' },
    { column: 'SponsorerName',         label: 'Sponsorer Name',         required: false, example: 'DST',                      hint: 'Sponsoring agency.' },
    { column: 'ProjectCategory',       label: 'Project Category',       required: false, example: 'R&D',                      hint: 'Project category.' },
    { column: 'ProjectStatus',         label: 'Project Status',         required: false, example: 'Ongoing',                  hint: 'Ongoing / Completed.' },
    { column: 'StartDate',             label: 'Start Date',             required: false, example: '2024-04-01',               hint: 'YYYY-MM-DD.' },
    { column: 'CompletioDate',         label: 'Completion Date',        required: false, example: '2027-03-31',               hint: 'YYYY-MM-DD.' },
    { column: 'SanctionedCost',        label: 'Sanctioned Cost',        required: false, example: '5000000',                  hint: 'Amount in INR.' },
    { column: 'UtilizedAmount',        label: 'Utilized Amount',        required: false, example: '1200000',                  hint: 'Amount in INR.' },
    { column: 'PrincipalInvestigator', label: 'Principal Investigator', required: false, example: 'Dr. A. Sharma',            hint: 'PI name or employee ID.' },
    { column: 'DivisionCode',          label: 'Division Code',          required: false, example: 'MSE',                      hint: 'Owning division code.' },
    { column: 'Extension',             label: 'Extension',              required: false, example: '2451',                     hint: 'Contact extension.' },
    { column: 'ApprovalAuthority',     label: 'Approval Authority',     required: false, example: 'Director',                 hint: 'Sanctioning authority.' },
  ],
  projectStaff: [
    { column: 'StaffName',             label: 'Staff Name',               required: true,  example: 'R. Verma',     hint: 'Project staff member name.' },
    { column: 'ProjectNo',             label: 'Project No',               required: true,  example: 'GAP-0125',     hint: 'Must exist in Projects.' },
    { column: 'Designation',           label: 'Designation',              required: false, example: 'Project JRF',  hint: 'Role on the project.' },
    { column: 'RecruitmentCycle',      label: 'Recruitment Cycle',        required: false, example: '2024-I',       hint: 'Hiring cycle.' },
    { column: 'DateOfJoining',         label: 'Date of Joining',          required: false, example: '2024-05-10',   hint: 'YYYY-MM-DD.' },
    { column: 'DateOfProjectDuration', label: 'Date of Project Duration', required: false, example: '2026-05-09',   hint: 'Engagement end date.' },
    { column: 'PIName',                label: 'PI Name',                  required: false, example: 'Dr. A. Sharma',hint: 'Principal investigator.' },
  ],
  phd: [
    { column: 'EnrollmentNo',    label: 'Enrollment No',  required: true,  example: 'PHD-2024-07',          hint: 'Unique enrollment number.' },
    { column: 'StudentName',     label: 'Student Name',   required: true,  example: 'S. Iyer',              hint: 'Scholar full name.' },
    { column: 'SupervisorName',  label: 'Supervisor Name',required: true,  example: 'Dr. A. Sharma',        hint: 'Must match a staff name.' },
    { column: 'Specialization',  label: 'Specialization', required: false, example: 'Nanomaterials',        hint: 'Research specialisation.' },
    { column: 'CoSupervisorName',label: 'Co-Supervisor',  required: false, example: 'Dr. P. Rao',           hint: 'Co-supervisor name.' },
    { column: 'FellowshipDetails',label: 'Fellowship',    required: false, example: 'CSIR-JRF',             hint: 'Fellowship type.' },
    { column: 'CurrentStatus',   label: 'Current Status', required: false, example: 'Ongoing',              hint: 'Ongoing / Completed.' },
    { column: 'ThesisTitle',     label: 'Thesis Title',   required: false, example: 'Coatings for...',      hint: 'Thesis title.' },
    { column: 'ProjectNo',       label: 'Project No',     required: false, example: 'GAP-0125',             hint: 'Linked project, if any.' },
  ],
  equipment: [
    { column: 'UInsID',                  label: 'Instrument ID',            required: true,  example: 'EQP-0042',          hint: 'Unique instrument identifier.' },
    { column: 'Name',                    label: 'Name',                     required: true,  example: 'XRD Diffractometer',hint: 'Instrument name.' },
    { column: 'instrument_code',         label: 'Instrument Code',          required: false, example: 'XRD-01',            hint: 'Internal code.' },
    { column: 'serial_number',           label: 'Serial Number',            required: false, example: 'SN-99812',          hint: 'Manufacturer serial no.' },
    { column: 'manufacturer',            label: 'Manufacturer',             required: false, example: 'Bruker',            hint: 'Maker.' },
    { column: 'year_of_manufacture',     label: 'Year of Manufacture',      required: false, example: '2019',              hint: 'YYYY.' },
    { column: 'EndUse',                  label: 'End Use',                  required: false, example: 'Phase analysis',    hint: 'Primary use.' },
    { column: 'lab_id',                  label: 'Lab ID',                   required: false, example: 'LAB-3',             hint: 'Hosting lab.' },
    { column: 'Division',                label: 'Division',                 required: false, example: 'MSE',               hint: 'Owning division code.' },
    { column: 'IndenterName',            label: 'Indenter Name',            required: false, example: 'Dr. A. Sharma',     hint: 'Person who indented.' },
    { column: 'OperatorName',            label: 'Operator Name',            required: false, example: 'R. Verma',          hint: 'Designated operator.' },
    { column: 'Location',                label: 'Location',                 required: false, example: 'Block A, Rm 12',    hint: 'Physical location.' },
    { column: 'amc_end_date',            label: 'AMC End Date',             required: false, example: '2026-12-31',        hint: 'YYYY-MM-DD.' },
    { column: 'WorkingStatus',           label: 'Working Status',           required: false, example: 'Operational',       hint: 'Operational / Down.' },
    { column: 'Movable',                 label: 'Movable',                  required: false, example: 'No',                hint: 'Yes / No.' },
    { column: 'RequirementInstallation', label: 'Requirement/Installation', required: false, example: 'Installed',         hint: 'Status note.' },
    { column: 'purchase_cost',           label: 'Purchase Cost',            required: false, example: '8500000',           hint: 'Amount in INR.' },
    { column: 'procurement_date',        label: 'Procurement Date',         required: false, example: '2019-06-20',        hint: 'YYYY-MM-DD.' },
    { column: 'Justification',           label: 'Justification',            required: false, example: 'Core facility',     hint: 'Procurement justification.' },
    { column: 'Remark',                  label: 'Remark',                   required: false, example: '—',                 hint: 'Free notes.' },
  ],
  contractStaff: [
    { column: 'Name',              label: 'Name',            required: true,  example: 'K. Nair',    hint: 'Contract staff name.' },
    { column: 'Designation',       label: 'Designation',     required: true,  example: 'Technician', hint: 'Role.' },
    { column: 'Division',          label: 'Division',        required: false, example: 'MSE',        hint: 'Division code.' },
    { column: 'DateOfJoining',     label: 'Date of Joining', required: false, example: '2024-02-01', hint: 'YYYY-MM-DD.' },
    { column: 'ContractEndDate',   label: 'Contract End Date',required: false,example: '2025-01-31', hint: 'YYYY-MM-DD.' },
    { column: 'LabCode',           label: 'Lab Code',        required: false, example: 'AMP',        hint: 'Lab code.' },
    { column: 'DateOfBirth',       label: 'Date of Birth',   required: false, example: '1990-09-12', hint: 'YYYY-MM-DD.' },
    { column: 'AttachedToStaffID', label: 'Attached To',     required: false, example: 'AMP-1024',   hint: 'Staff name or employee ID.' },
  ],
};

// ---------------------------------------------------------------------------
// formatData
// ---------------------------------------------------------------------------

/**
 * Renames raw headers using SCHEMA_MAPS, then strips any keys that are not in
 * ALLOWED_COLUMNS for the given type. Filters out completely empty rows.
 */
export function formatData(
  rawRows: Record<string, any>[],
  type: FileType,
): Record<string, string>[] {
  const schemaMap = SCHEMA_MAPS[type];

  return rawRows
    // Step 0: drop untouched template example rows (marked with the sentinel)
    .filter((rawRow) => !Object.values(rawRow).some((v) => v === EXAMPLE_SENTINEL))
    .map((rawRow) => {
      // Step 1: rename keys according to SCHEMA_MAPS
      const renamed: Record<string, any> = {};
      for (const [key, value] of Object.entries(rawRow)) {
        const mappedKey = schemaMap[key] ?? key;
        renamed[mappedKey] = value;
      }

      // Step 2: keep only allowed columns
      const filtered: Record<string, string> = {};
      for (const col of ALLOWED_COLUMNS[type]) {
        if (col in renamed) {
          filtered[col] = String(renamed[col] ?? '');
        }
      }

      return filtered;
    })
    // Step 3: discard completely empty rows
    .filter((row) => Object.values(row).some((v) => v !== '' && v != null));
}

// ---------------------------------------------------------------------------
// parseFile
// ---------------------------------------------------------------------------

/** Reads a CSV/Excel File into raw row objects, headers untouched. Throws on
 * read/parse failure or an unsupported extension — callers wrap it. */
function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function readRawRows(file: File): Promise<Record<string, any>[]> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.csv')) {
    // CSV path: read as text, parse with papaparse
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) ?? '');
      reader.onerror = () => reject(new Error('Failed to read CSV file'));
      reader.readAsText(file);
    });

    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });

    return result.data as Record<string, any>[];
  }

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    // Excel path: read as ArrayBuffer, parse with xlsx
    // xlsx builds date cells in local time, so read the local components — using
    // toISOString() here would shift 10-03-2021 back to the 9th east of UTC.
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('Failed to read Excel file'));
      reader.readAsArrayBuffer(file);
    });

    // cellDates: a date cell is a serial number underneath (10-03-2021 is 44265).
    // Stored raw, '44265' later parses as the YEAR 44265 — timelines, overdue
    // detection and burn-rate variance all silently stopped working on real files.
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    return rows.map((row) => {
      const out: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        out[key] = value instanceof Date ? toISODate(value) : value;
      }
      return out;
    });
  }

  throw new Error('Unsupported file type. Please upload a .csv, .xlsx, or .xls file.');
}

/**
 * Parses a File into rows with ORIGINAL headers untouched — no SCHEMA_MAPS
 * rename, no ALLOWED_COLUMNS filter. Needed when the caller wants to see
 * (and possibly correct, e.g. Phase C's AI mapping suggestion) which raw
 * headers exist before committing to a mapping — formatData's rename+filter
 * would have silently dropped anything SCHEMA_MAPS doesn't recognize.
 */
export async function parseFileRaw(
  file: File,
): Promise<{ success: boolean; data?: Record<string, string>[]; rowCount?: number; error?: string }> {
  try {
    const rawRows = await readRawRows(file);
    const data = rawRows
      .filter((row) => !Object.values(row).some((v) => v === EXAMPLE_SENTINEL))
      .map((row) => {
        const out: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) out[key] = String(value ?? '');
        return out;
      });
    return { success: true, data, rowCount: data.length };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error during file parsing' };
  }
}

/**
 * Renames raw rows per an explicit raw-header -> canonical-column mapping
 * (a raw header mapped to null is dropped), then filters to ALLOWED_COLUMNS
 * and drops empty rows — same shape as formatData's output, but driven by a
 * mapping the caller controls (detected / saved fingerprint / AI-suggested /
 * human-corrected) instead of re-deriving it from SCHEMA_MAPS per row.
 */
export function applyColumnMapping(
  rawRows: Record<string, string>[],
  mapping: Record<string, string | null>,
  type: FileType,
): Record<string, string>[] {
  const allowedSet = new Set(ALLOWED_COLUMNS[type]);
  return rawRows
    .map((row) => {
      const filtered: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        const mapped = mapping[key];
        if (mapped && allowedSet.has(mapped)) filtered[mapped] = value;
      }
      return filtered;
    })
    .filter((row) => Object.values(row).some((v) => v !== '' && v != null));
}

// ---------------------------------------------------------------------------
// generateTemplate
// ---------------------------------------------------------------------------

/**
 * Builds a blank import template for the given entity.
 *
 * xlsx: sheet "Data" (friendly headers + one example row, sentinel in the first
 * required cell) plus sheet "Instructions" (Field / Required / Format hints).
 * csv: "Data" sheet only — CSV cannot carry a second sheet.
 */
export function generateTemplate(type: FileType, format: 'xlsx' | 'csv'): Blob {
  const fields = FIELD_META[type];
  const firstRequiredIdx = Math.max(0, fields.findIndex((f) => f.required));

  const headerRow = fields.map((f) => f.label);
  const exampleRow = fields.map((f, i) => (i === firstRequiredIdx ? EXAMPLE_SENTINEL : f.example));
  const dataSheet = XLSX.utils.aoa_to_sheet([headerRow, exampleRow]);

  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(dataSheet);
    return new Blob([csv], { type: 'text/csv;charset=utf-8' });
  }

  const instructionRows = [
    ['Field', 'Required', 'Format / Hint'],
    ...fields.map((f) => [f.label, f.required ? 'Required' : 'Optional', f.hint]),
    [],
    [`Delete the example row before uploading (the "${EXAMPLE_SENTINEL}" row is ignored on import).`],
  ];
  const instructionSheet = XLSX.utils.aoa_to_sheet(instructionRows);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet, 'Data');
  XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions');

  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------------------------------------------------------------------------
// pushToSupabase
// ---------------------------------------------------------------------------

/**
 * Every parsed cell is a string, so a blank optional cell arrives as ''. Postgres
 * rejects that for date/numeric/uuid columns ("invalid input syntax for type
 * date"), failing the whole batch over cells the source simply left empty.
 */
function blanksToNull(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v === '' ? null : v;
  return out;
}

/**
 * Upserts rows to a Supabase table in batches of BATCH_SIZE.
 * Calls onLog() with progress messages. Never rejects.
 */
export async function pushToSupabase(
  client: any,
  tableName: string,
  rows: Record<string, any>[],
  onLog: (msg: string) => void,
): Promise<{ upserted: number; failed: number }> {
  let upserted = 0;
  let failed = 0;

  const chunks: Record<string, any>[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    chunks.push(rows.slice(i, i + BATCH_SIZE).map(blanksToNull));
  }

  const total = chunks.length;

  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    const batchNum = idx + 1;

    try {
      const { error } = await client.from(tableName).upsert(chunk);
      if (error) {
        failed += chunk.length;
        onLog(`Batch ${batchNum}/${total}: failed — ${error.message}`);
      } else {
        upserted += chunk.length;
        onLog(`Batch ${batchNum}/${total}: upserted ${chunk.length} rows`);
      }
    } catch (err: any) {
      failed += chunk.length;
      onLog(`Batch ${batchNum}/${total}: failed — ${err?.message ?? 'Unknown error'}`);
    }
  }

  return { upserted, failed };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface RowValidationResult {
  rowIndex: number;
  errors: Array<{ field: string; message: string }>;
  isValid: boolean;
}

export const VALIDATION_SCHEMAS: Record<FileType, z.ZodObject<any>> = {
  staff: z.object({
    ID: z.string().min(1, 'Employee ID is required'),
    Name: z.string().min(1, 'Name is required'),
    Division: z.string().min(1, 'Division code is required'),
    DOJ: z.string().optional().or(z.literal('')),
    DOB: z.string().optional().or(z.literal('')),
  }).passthrough(),
  divisions: z.object({
    divCode: z.string().min(1, 'Division code is required'),
    divName: z.string().min(1, 'Division name is required'),
  }).passthrough(),
  projects: z.object({
    ProjectID: z.string().min(1, 'Project ID is required'),
    ProjectNo: z.string().min(1, 'Project number is required'),
    ProjectName: z.string().min(1, 'Project name is required'),
  }).passthrough(),
  projectStaff: z.object({
    ProjectNo: z.string().min(1, 'Project number is required'),
    StaffName: z.string().min(1, 'Staff name is required'),
  }).passthrough(),
  phd: z.object({
    EnrollmentNo: z.string().min(1, 'Enrollment number is required'),
    StudentName: z.string().min(1, 'Student name is required'),
    SupervisorName: z.string().min(1, 'Supervisor name is required'),
  }).passthrough(),
  equipment: z.object({
    UInsID: z.string().min(1, 'Equipment ID is required'),
    Name: z.string().min(1, 'Equipment name is required'),
    instrument_code: z.string().optional(),
    serial_number: z.string().optional(),
    manufacturer: z.string().optional(),
    year_of_manufacture: z.union([z.string(), z.number()]).optional(),
    lab_id: z.string().optional(),
    owner_user_id: z.string().uuid().optional().or(z.literal('')),
    amc_end_date: z.string().optional().or(z.literal('')),
    purchase_cost: z.union([z.string(), z.number()]).optional(),
    procurement_date: z.string().optional().or(z.literal('')),
  }).passthrough(),
  contractStaff: z.object({
    Name: z.string().min(1, 'Name is required'),
    Designation: z.string().min(1, 'Designation is required'),
  }).passthrough(),
};

export function validateRows(
  rows: Record<string, string>[],
  type: FileType,
): RowValidationResult[] {
  const schema = VALIDATION_SCHEMAS[type];
  return rows.map((row, rowIndex) => {
    const result = schema.safeParse(row);
    if (result.success) {
      return { rowIndex, errors: [], isValid: true };
    }
    const errors = result.error.issues.map(issue => ({
      field: String(issue.path[0] ?? ''),
      message: issue.message,
    }));
    return { rowIndex, errors, isValid: false };
  });
}

// ---------------------------------------------------------------------------
// detectColumnMappings
// ---------------------------------------------------------------------------

/** Real institute files carry headers like 'Project status', 'SponsorerType ' and
 * 'approvalAuthority' — the right column, off by case or a trailing space. Matching
 * on the exact string dropped those silently, so compare on a normalised key. */
function headerKey(header: string): string {
  return header.trim().toLowerCase();
}

/**
 * For each raw header from the parsed file, returns whether it maps to a
 * known field for the given FileType.
 */
export function detectColumnMappings(
  rawHeaders: string[],
  type: FileType,
): Array<{ raw: string; mapped: string | null }> {
  const schemaMap = SCHEMA_MAPS[type];
  const byKey = new Map(Object.entries(schemaMap).map(([k, v]) => [headerKey(k), v]));
  for (const col of ALLOWED_COLUMNS[type]) {
    if (!byKey.has(headerKey(col))) byKey.set(headerKey(col), col);
  }

  return rawHeaders.map((raw) => ({ raw, mapped: byKey.get(headerKey(raw)) ?? null }));
}

// ---------------------------------------------------------------------------
// resolveImportDivisions
// ---------------------------------------------------------------------------

/**
 * Post-parse auto-detection: pre-fills DivisionCode/Division using existing
 * reference data before rows are pushed to Supabase.
 *
 * project_staff: ProjectNo → projects lookup → copy DivisionCode
 * phd:           SupervisorName exact match → staff.Name → copy Division
 * contractStaff: AttachedToStaffID value matched against staff.Name first,
 *                then staff.ID as fallback → copy Division
 *
 * Rows with no match are returned unchanged (DivisionCode stays empty).
 */
export function resolveImportDivisions(
  rows: Record<string, string>[],
  type: FileType,
  referenceProjects: Array<{ ProjectNo: string; DivisionCode: string }>,
  referenceStaff: Array<{ ID: string; Name: string; Division: string }>,
): Record<string, string>[] {
  if (type === 'projectStaff') {
    const projectMap = new Map(
      referenceProjects.map((p) => [p.ProjectNo, p.DivisionCode])
    );
    return rows.map((row) => {
      if (row.DivisionCode) return row;
      const divCode = projectMap.get(row.ProjectNo);
      return divCode ? { ...row, DivisionCode: divCode } : row;
    });
  }

  if (type === 'phd') {
    const staffByName = new Map(
      referenceStaff.map((s) => [s.Name.trim().toLowerCase(), s.Division])
    );
    return rows.map((row) => {
      if (row.DivisionCode) return row;
      const div = staffByName.get((row.SupervisorName || '').trim().toLowerCase());
      return div ? { ...row, DivisionCode: div } : row;
    });
  }

  if (type === 'contractStaff') {
    const staffByName = new Map(
      referenceStaff.map((s) => [s.Name.trim().toLowerCase(), s.Division])
    );
    const staffById = new Map(
      referenceStaff.map((s) => [s.ID.trim(), s.Division])
    );
    return rows.map((row) => {
      if (row.Division) return row;
      const attached = (row.AttachedToStaffID || '').trim();
      const divByName = staffByName.get(attached.toLowerCase());
      if (divByName) return { ...row, Division: divByName };
      const divById = staffById.get(attached);
      if (divById) return { ...row, Division: divById };
      return row;
    });
  }

  return rows;
}
