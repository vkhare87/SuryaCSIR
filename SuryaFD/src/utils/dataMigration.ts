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
    'StaffName':                'StaffName',
    'ProjectNo':                'ProjectNo',
    'RecruitmentCycle':         'RecruitmentCycle',
    'DateOfJoining':            'DateOfJoining',
    'DateOfProjectDuration':    'DateOfProjectDuration',
    'PIName':                   'PIName',
  },
  phd: {
    'Enrollment No':     'EnrollmentNo',
    'Student Name':      'StudentName',
    'Specialization':    'Specialization',
    'Supervisor Name':   'SupervisorName',
    'Co-Supervisor':     'CoSupervisorName',
    'Fellowship':        'FellowshipDetails',
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
    'Name':                       'Name',
    'End Use':                    'EndUse',
    'Division':                   'Division',
    'Indenter Name':              'IndenterName',
    'Operator Name':              'OperatorName',
    'Location':                   'Location',
    'Working Status':             'WorkingStatus',
    'Movable':                    'Movable',
    'Requirement/Installation':   'RequirementInstallation',
    'Justification':              'Justification',
    'Remark':                     'Remark',
    'UInsID':                     'UInsID',
    'IndenterName':               'IndenterName',
    'OperatorName':               'OperatorName',
    'WorkingStatus':              'WorkingStatus',
    'RequirementInstallation':    'RequirementInstallation',
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
    'UInsID', 'Name', 'EndUse', 'Division', 'IndenterName', 'OperatorName',
    'Location', 'WorkingStatus', 'Movable', 'RequirementInstallation',
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

/**
 * Parses an uploaded File (CSV or Excel) into formatted rows.
 * Never rejects — always resolves with a success/error shape.
 */
export async function parseFile(
  file: File,
  type: FileType,
): Promise<{ success: boolean; data?: Record<string, string>[]; rowCount?: number; error?: string }> {
  try {
    const fileName = file.name.toLowerCase();

    let rawRows: Record<string, any>[];

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

      rawRows = result.data as Record<string, any>[];
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      // Excel path: read as ArrayBuffer, parse with xlsx
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
        reader.onerror = () => reject(new Error('Failed to read Excel file'));
        reader.readAsArrayBuffer(file);
      });

      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    } else {
      return { success: false, error: 'Unsupported file type. Please upload a .csv, .xlsx, or .xls file.' };
    }

    const formatted = formatData(rawRows, type);
    return { success: true, data: formatted, rowCount: formatted.length };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error during file parsing' };
  }
}

// ---------------------------------------------------------------------------
// pushToSupabase
// ---------------------------------------------------------------------------

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
    chunks.push(rows.slice(i, i + BATCH_SIZE));
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

/**
 * For each raw header from the parsed file, returns whether it maps to a
 * known field for the given FileType.
 */
export function detectColumnMappings(
  rawHeaders: string[],
  type: FileType,
): Array<{ raw: string; mapped: string | null }> {
  const schemaMap = SCHEMA_MAPS[type];
  const allowedSet = new Set(ALLOWED_COLUMNS[type]);

  return rawHeaders.map((raw) => {
    // Check if the raw header maps via SCHEMA_MAPS
    if (schemaMap[raw] != null) {
      return { raw, mapped: schemaMap[raw] };
    }
    // Check if it's already a canonical allowed column name
    if (allowedSet.has(raw)) {
      return { raw, mapped: raw };
    }
    return { raw, mapped: null };
  });
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
