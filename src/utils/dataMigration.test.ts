import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  FIELD_META,
  ALLOWED_COLUMNS,
  EXAMPLE_SENTINEL,
  generateTemplate,
  formatData,
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
