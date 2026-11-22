import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// FileType
// ---------------------------------------------------------------------------

import {
  FILE_TYPE_LABELS,
  TABLE_NAMES,
  EXAMPLE_SENTINEL,
  FIELD_META,
  type FileType,
  type FieldMeta,
} from './fileTypes';
import { friendlyError } from '../lib/errors';
export { FILE_TYPE_LABELS, TABLE_NAMES, EXAMPLE_SENTINEL, FIELD_META };
export type { FileType, FieldMeta };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

/** A workbook bigger than this, or with more rows, is refused: a decompression
 * bomb must not hang the tab (SEC-03). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_ROWS = 50_000;

async function readRawRows(file: File): Promise<Record<string, any>[]> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('File too large (max 25 MB).');
  const rows = await readRows(file);
  if (rows.length > MAX_UPLOAD_ROWS) throw new Error('Too many rows (max 50,000).');
  return rows;
}

async function readRows(file: File): Promise<Record<string, any>[]> {
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

export const MAX_UPSERT_ROWS = 5_000;
export const MAX_UPSERT_PAYLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Upserts rows to a Supabase table in a single atomic PostgREST request.
 * Calls onLog() with progress messages. Never rejects.
 *
 * Previously chunked into 50-row browser loops, which meant a failure on batch k
 * left batches 1..k-1 permanently committed (partial import). PostgREST executes
 * a multi-row upsert inside a single database transaction, so all rows succeed
 * or the entire import rolls back cleanly.
 */
const GATEWAY_UNKNOWN_STATUSES = new Set([0, 408, 502, 503, 504]);

function isServerOutcomeUnknown(status: number | undefined, error: { code?: string | null }): boolean {
  if (typeof status !== 'number') return false;
  if (GATEWAY_UNKNOWN_STATUSES.has(status)) return true;
  return status >= 500 && !error.code;
}

export async function pushToSupabase(
  client: any,
  tableName: string,
  rows: Record<string, any>[],
  onLog: (msg: string) => void,
): Promise<{ upserted: number; failed: number }> {
  if (rows.length === 0) return { upserted: 0, failed: 0 };

  if (rows.length > MAX_UPSERT_ROWS) {
    onLog(
      `Import aborted — ${rows.length} rows exceed single-request limit (${MAX_UPSERT_ROWS} rows). Split the file and retry.`,
    );
    return { upserted: 0, failed: rows.length };
  }

  const payload = rows.map(blanksToNull);
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (payloadBytes > MAX_UPSERT_PAYLOAD_BYTES) {
    onLog(
      `Import aborted — payload size (${(payloadBytes / (1024 * 1024)).toFixed(2)} MB) exceeds single-request limit (${MAX_UPSERT_PAYLOAD_BYTES / (1024 * 1024)} MB).`,
    );
    return { upserted: 0, failed: rows.length };
  }

  try {
    const { error, status } = await client.from(tableName).upsert(payload);
    if (error) {
      if (isServerOutcomeUnknown(status, error)) {
        onLog(
          `Import request failed (server outcome unknown for ${payload.length} rows — verify existing records before retrying) — ${friendlyError(error)}`,
        );
      } else {
        onLog(`Import failed (rolled back ${payload.length} rows) — ${friendlyError(error)}`);
      }
      return { upserted: 0, failed: payload.length };
    }
    onLog(`Upserted ${payload.length} rows atomically`);
    return { upserted: payload.length, failed: 0 };
  } catch (err: any) {
    onLog(
      `Import request failed (server outcome unknown for ${payload.length} rows — verify existing records before retrying) — ${friendlyError(err)}`,
    );
    return { upserted: 0, failed: payload.length };
  }
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

const DIVISION_FIELD: Partial<Record<FileType, string>> = {
  staff: 'Division',
  projects: 'DivisionCode',
  projectStaff: 'DivisionCode',
  phd: 'DivisionCode',
  equipment: 'Division',
  contractStaff: 'Division',
};

/**
 * Resolves per-row divisions via resolveImportDivisions() and groups row counts
 * by division_code for fan-out inserts into import_events. Domains without
 * division linkage (divisions master list) or rows with blank divisions emit a
 * null division_code bucket.
 */
export function attributeImportDivisions(
  rows: Record<string, string>[],
  type: FileType,
  referenceProjects: Array<{ ProjectNo: string; DivisionCode: string }>,
  referenceStaff: Array<{ ID: string; Name: string; Division: string }>,
): Array<{ division_code: string | null; row_count: number }> {
  if (rows.length === 0) return [];
  const resolved = resolveImportDivisions(rows, type, referenceProjects, referenceStaff);
  const field = DIVISION_FIELD[type];
  if (!field) {
    return [{ division_code: null, row_count: resolved.length }];
  }
  const counts = new Map<string | null, number>();
  for (const row of resolved) {
    const raw = (row[field] ?? '').trim();
    const div = raw.length > 0 ? raw : null;
    counts.set(div, (counts.get(div) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => {
      if (a === b) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return a.localeCompare(b);
    })
    .map(([division_code, row_count]) => ({ division_code, row_count }));
}
