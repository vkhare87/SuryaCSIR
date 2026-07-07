import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  FIELD_META,
  ALLOWED_COLUMNS,
  EXAMPLE_SENTINEL,
  generateTemplate,
  formatData,
  validateRows,
  detectColumnMappings,
  resolveImportDivisions,
  type FileType,
} from './dataMigration';

const TYPES = Object.keys(FIELD_META) as FileType[];

describe('FIELD_META consistency', () => {
  it.each(TYPES)('every %s field column is an allowed column', (type) => {
    const allowed = new Set(ALLOWED_COLUMNS[type]);
    for (const field of FIELD_META[type]) {
      expect(allowed.has(field.column)).toBe(true);
    }
  });

  it.each(TYPES)('%s has at least one required field', (type) => {
    expect(FIELD_META[type].some((f) => f.required)).toBe(true);
  });
});

describe('generateTemplate (xlsx)', () => {
  it.each(TYPES)('%s Data sheet has friendly headers + sentinel example row', async (type) => {
    const blob = generateTemplate(type, 'xlsx');
    const buf = await blob.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });

    expect(wb.SheetNames).toContain('Data');
    expect(wb.SheetNames).toContain('Instructions');

    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Data'], { header: 1 });
    const headers = rows[0];
    const exampleRow = rows[1];

    expect(headers).toEqual(FIELD_META[type].map((f) => f.label));
    expect(exampleRow).toContain(EXAMPLE_SENTINEL);
  });
});

describe('generateTemplate (csv)', () => {
  it('emits a single-sheet CSV with the friendly headers', () => {
    const blob = generateTemplate('divisions', 'csv');
    expect(blob.type).toContain('text/csv');
  });
});

describe('formatData sentinel handling', () => {
  it('drops untouched example rows containing the sentinel', () => {
    const rows = [
      { 'Division Code': EXAMPLE_SENTINEL, 'Division Name': 'Materials' },
      { 'Division Code': 'MSE', 'Division Name': 'Materials Science' },
    ];
    const out = formatData(rows, 'divisions');
    expect(out).toHaveLength(1);
    expect(out[0].divCode).toBe('MSE');
  });

  it('keeps a row once the sentinel cell is overwritten with real data', () => {
    const rows = [{ 'Division Code': 'MSE', 'Division Name': 'Materials Science' }];
    const out = formatData(rows, 'divisions');
    expect(out).toHaveLength(1);
    expect(out[0].divCode).toBe('MSE');
  });
});

describe('validateRows', () => {
  it('passes a valid staff row', () => {
    const res = validateRows(
      [{ ID: 'E1', Name: 'A Sharma', Division: 'MSE' }],
      'staff',
    );
    expect(res[0].isValid).toBe(true);
    expect(res[0].errors).toEqual([]);
  });

  it('returns indexed field errors for an invalid phd row', () => {
    const res = validateRows(
      [
        { EnrollmentNo: 'P1', StudentName: 'S One', SupervisorName: 'Dr X' },
        { EnrollmentNo: '', StudentName: 'S Two', SupervisorName: 'Dr Y' },
      ],
      'phd',
    );
    expect(res[0].isValid).toBe(true);
    expect(res[1].isValid).toBe(false);
    expect(res[1].rowIndex).toBe(1);
    expect(res[1].errors[0].field).toBe('EnrollmentNo');
    expect(res[1].errors[0].message).toMatch(/required/i);
  });
});

describe('detectColumnMappings', () => {
  it('maps friendly labels, canonical names, and flags unknowns', () => {
    const out = detectColumnMappings(['Employee ID', 'DOJ', 'Shoe Size'], 'staff');
    expect(out[0]).toEqual({ raw: 'Employee ID', mapped: 'ID' });
    expect(out[1]).toEqual({ raw: 'DOJ', mapped: 'DOJ' });
    expect(out[2]).toEqual({ raw: 'Shoe Size', mapped: null });
  });
});

describe('resolveImportDivisions', () => {
  const staff = [{ ID: 'E1', Name: 'Dr X', Division: 'MSE' }];

  it('projectStaff: fills DivisionCode from the project lookup', () => {
    const out = resolveImportDivisions(
      [{ ProjectNo: 'PR1', StaffName: 'S' }],
      'projectStaff',
      [{ ProjectNo: 'PR1', DivisionCode: 'CSE' }],
      staff,
    );
    expect(out[0].DivisionCode).toBe('CSE');
  });

  it('phd: matches supervisor name case-insensitively', () => {
    const out = resolveImportDivisions(
      [{ EnrollmentNo: 'P1', SupervisorName: '  dr x ' }],
      'phd',
      [],
      staff,
    );
    expect(out[0].DivisionCode).toBe('MSE');
  });

  it('contractStaff: name match first, staff ID fallback, no-match untouched', () => {
    const rows = [
      { Name: 'C1', AttachedToStaffID: 'Dr X' },
      { Name: 'C2', AttachedToStaffID: 'E1' },
      { Name: 'C3', AttachedToStaffID: 'nobody' },
    ];
    const out = resolveImportDivisions(rows, 'contractStaff', [], staff);
    expect(out[0].Division).toBe('MSE');
    expect(out[1].Division).toBe('MSE');
    expect(out[2].Division).toBeUndefined();
  });

  it('leaves rows with an existing DivisionCode unchanged', () => {
    const out = resolveImportDivisions(
      [{ ProjectNo: 'PR1', DivisionCode: 'KEEP' }],
      'projectStaff',
      [{ ProjectNo: 'PR1', DivisionCode: 'CSE' }],
      staff,
    );
    expect(out[0].DivisionCode).toBe('KEEP');
  });
});

describe('formatData header remapping', () => {
  it('renames a friendly staff header to its canonical column', () => {
    const out = formatData(
      [{ 'Employee ID': 'E9', 'Name': 'B Rao', 'Division': 'CSE' }],
      'staff',
    );
    expect(out[0].ID).toBe('E9');
    expect(out[0].Division).toBe('CSE');
  });
});
