import { describe, it, expect, vi, afterEach } from 'vitest';
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
  applyColumnMapping,
  parseFileRaw,
  pushToSupabase,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_ROWS,
  MAX_UPSERT_ROWS,
  MAX_UPSERT_PAYLOAD_BYTES,
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

describe('applyColumnMapping', () => {
  it('renames per an explicit mapping and drops unmapped headers', () => {
    const out = applyColumnMapping(
      [{ 'Emp ID': 'E1', 'Full Name': 'Dr X', 'Shoe Size': '9' }],
      { 'Emp ID': 'ID', 'Full Name': 'Name', 'Shoe Size': null },
      'staff',
    );
    expect(out).toEqual([{ ID: 'E1', Name: 'Dr X' }]);
  });

  it('drops a mapped-but-not-allowed column (mapping bug guard)', () => {
    const out = applyColumnMapping(
      [{ Foo: 'bar' }],
      { Foo: 'NotAnAllowedColumn' },
      'staff',
    );
    expect(out).toEqual([]);
  });

  it('drops rows that end up entirely empty after mapping', () => {
    const out = applyColumnMapping(
      [{ 'Emp ID': '', 'Shoe Size': '9' }],
      { 'Emp ID': 'ID', 'Shoe Size': null },
      'staff',
    );
    expect(out).toEqual([]);
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

describe('upload limits (SEC-03)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const csv = (rows: number) =>
    new File(['Name\n' + 'a\n'.repeat(rows)], 'staff.csv', { type: 'text/csv' });
  const sized = (bytes: number, name = 'big.xlsx') =>
    Object.defineProperty(new File(['Name\na\n'], name), 'size', { value: bytes });

  it('refuses a file one byte over the cap without reading it', async () => {
    const reader = vi.spyOn(globalThis, 'FileReader');
    expect(await parseFileRaw(sized(MAX_UPLOAD_BYTES + 1)))
      .toEqual({ success: false, error: 'File too large (max 25 MB).' });
    expect(reader).not.toHaveBeenCalled();
  });

  it('reads a file exactly at the cap', async () => {
    expect((await parseFileRaw(sized(MAX_UPLOAD_BYTES, 'ok.csv'))).success).toBe(true);
  });

  it('accepts exactly the row cap and refuses one more', async () => {
    expect((await parseFileRaw(csv(MAX_UPLOAD_ROWS))).rowCount).toBe(MAX_UPLOAD_ROWS);
    expect(await parseFileRaw(csv(MAX_UPLOAD_ROWS + 1)))
      .toEqual({ success: false, error: 'Too many rows (max 50,000).' });
  });
});

describe('pushToSupabase atomic upsert', () => {
  it('sends all rows in a single atomic upsert call and converts empty strings to null', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) };
    const rows = Array.from({ length: 120 }, (_, i) => ({ ID: `E${i}`, Name: `Staff ${i}`, DOJ: '' }));

    const res = await pushToSupabase(client, 'staff', rows, () => {});
    expect(res).toEqual({ upserted: 120, failed: 0 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toHaveLength(120);
    expect(upsert.mock.calls[0][0][0]).toEqual({ ID: 'E0', Name: 'Staff 0', DOJ: null });
  });

  it('reports 0 upserted and all failed when the atomic transaction fails', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'duplicate key' } });
    const client = { from: vi.fn(() => ({ upsert })) };
    const rows = Array.from({ length: 75 }, (_, i) => ({ ID: `E${i}` }));
    const logs: string[] = [];

    const res = await pushToSupabase(client, 'staff', rows, (m) => logs.push(m));
    expect(res).toEqual({ upserted: 0, failed: 75 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(logs[0]).toContain('rolled back 75 rows');
  });

  it('rejects batches exceeding MAX_UPSERT_ROWS before sending', async () => {
    const upsert = vi.fn();
    const client = { from: vi.fn(() => ({ upsert })) };
    const rows = Array.from({ length: MAX_UPSERT_ROWS + 1 }, (_, i) => ({ ID: `E${i}` }));
    const logs: string[] = [];

    const res = await pushToSupabase(client, 'staff', rows, (m) => logs.push(m));
    expect(res).toEqual({ upserted: 0, failed: MAX_UPSERT_ROWS + 1 });
    expect(upsert).not.toHaveBeenCalled();
    expect(logs[0]).toContain('single-request limit');
  });

  it('rejects batches exceeding MAX_UPSERT_PAYLOAD_BYTES before sending', async () => {
    const upsert = vi.fn();
    const client = { from: vi.fn(() => ({ upsert })) };
    const big = 'x'.repeat(Math.floor(MAX_UPSERT_PAYLOAD_BYTES / 2) + 1024);
    const rows = [{ ID: 'E1', bio: big }, { ID: 'E2', bio: big }];
    const logs: string[] = [];

    const res = await pushToSupabase(client, 'staff', rows, (m) => logs.push(m));
    expect(res).toEqual({ upserted: 0, failed: 2 });
    expect(upsert).not.toHaveBeenCalled();
    expect(logs[0]).toContain('payload size');
  });

  it('does not claim rollback when an exception leaves server outcome unknown', async () => {
    const upsert = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    const client = { from: vi.fn(() => ({ upsert })) };
    const rows = [{ ID: 'E1' }, { ID: 'E2' }];
    const logs: string[] = [];

    const res = await pushToSupabase(client, 'staff', rows, (m) => logs.push(m));
    expect(res).toEqual({ upserted: 0, failed: 2 });
    expect(logs[0]).toContain('server outcome unknown');
    expect(logs[0]).not.toContain('rolled back');
  });

  it('does not claim rollback for a resolved Supabase transport error with status 0', async () => {
    const upsert = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'TypeError: Failed to fetch' },
      status: 0,
    });
    const client = { from: vi.fn(() => ({ upsert })) };
    const rows = [{ ID: 'E1' }, { ID: 'E2' }];
    const logs: string[] = [];

    const res = await pushToSupabase(client, 'staff', rows, (m) => logs.push(m));
    expect(res).toEqual({ upserted: 0, failed: 2 });
    expect(logs[0]).toContain('server outcome unknown');
    expect(logs[0]).not.toContain('rolled back');
  });

  it('does not claim rollback for a gateway error such as HTTP 504', async () => {
    const upsert = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Gateway Timeout' },
      status: 504,
    });
    const client = { from: vi.fn(() => ({ upsert })) };
    const rows = [{ ID: 'E1' }, { ID: 'E2' }];
    const logs: string[] = [];

    const res = await pushToSupabase(client, 'staff', rows, (m) => logs.push(m));
    expect(res).toEqual({ upserted: 0, failed: 2 });
    expect(logs[0]).toContain('server outcome unknown');
    expect(logs[0]).not.toContain('rolled back');
  });
});
