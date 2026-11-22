// Kept apart from dataMigration.ts so dashboard code can name upload domains
// without pulling xlsx/papaparse/zod into the startup bundle.

export type FileType = 'staff' | 'divisions' | 'projects' | 'projectStaff' | 'phd' | 'equipment' | 'contractStaff';

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

/**
 * Marker placed in the example row of a generated template. formatData drops
 * any row that still contains this value, so an untouched example row never
 * gets imported.
 */
export const EXAMPLE_SENTINEL = '__EXAMPLE__';

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
    { column: 'ProjectStatus',         label: 'Project Status',         required: false, example: 'Active',                   hint: 'Active / On Hold / Completed / Foreclosed. "Ongoing" is read as Active.' },
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
    { column: 'fellowship_end',  label: 'Fellowship End', required: false, example: '2027-07-31',           hint: 'YYYY-MM-DD. Supervisors are told 6 months before.' },
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
