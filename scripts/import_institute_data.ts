/**
 * Headless run of the app's own import pipeline over real institute Excel files.
 *
 * Same code path as the Data Management console (parseFileRaw ->
 * detectColumnMappings -> applyColumnMapping -> validateRows), so a mapping gap
 * here is a real gap in the UI import too. Reports unmapped headers and
 * validation failures per file; --push writes the rows via PostgREST.
 *
 *   npx tsx scripts/import_institute_data.ts            # dry run
 *   npx tsx scripts/import_institute_data.ts --push
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

// dataMigration reads files through the browser FileReader; node has none.
class NodeFileReader {
  onload: ((e: { target: { result: unknown } }) => void) | null = null;
  onerror: (() => void) | null = null;
  private emit(result: unknown) {
    queueMicrotask(() => this.onload?.({ target: { result } }));
  }
  readAsText(file: File) { file.text().then((t) => this.emit(t)); }
  readAsArrayBuffer(file: File) { file.arrayBuffer().then((b) => this.emit(b)); }
}
(globalThis as Record<string, unknown>).FileReader = NodeFileReader;

import {
  parseFileRaw, detectColumnMappings, applyColumnMapping, validateRows,
  TABLE_NAMES, type FileType,
} from '../src/utils/dataMigration';
import { staffNameMatchesAuthor } from '../src/utils/dateUtils';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const FILES: Array<{ path: string; type: FileType }> = [
  { path: 'C:/Users/HP/Desktop/Office/SURYA/Data/TEMPLATE_DIVISIONS.xlsx', type: 'divisions' },
  { path: 'C:/Users/HP/Desktop/Office/SURYA/Data/AMPRI Master staff data.xls', type: 'staff' },
  { path: 'C:/Users/HP/Desktop/Office/SURYA/Data/Projects_AMPRI.xlsx', type: 'projects' },
  { path: 'C:/Users/HP/Desktop/Office/SURYA/Data/Project staff.xlsx', type: 'projectStaff' },
  { path: 'C:/Users/HP/Desktop/Office/SURYA/Data/AcSIR Students Data_Updated-_Dec_2025.xlsx', type: 'phd' },
  { path: 'C:/Users/HP/Desktop/Office/SURYA/Data/Equipment details.xlsx', type: 'equipment' },
];

function toFile(path: string): File {
  const buf = readFileSync(path);
  return new File([new Uint8Array(buf)], basename(path));
}

async function push(table: string, rows: Record<string, string>[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === '' ? null : v])))),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
}

/**
 * The projects sheet leaves DivisionCode blank on every row, which makes every
 * division-level analytic read "unknown: 82". Every row does name a PI, and staff
 * carry a division, so resolve it the way resolveImportDivisions already does for
 * project staff and PhD scholars: PI name -> staff -> division. Only an unambiguous
 * single match is written; anything else is left blank rather than guessed.
 */
async function backfillProjectDivisions() {
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const staff = await (await fetch(
    `${SUPABASE_URL}/rest/v1/staff?select=Name,Division`, { headers })).json();
  const projects = await (await fetch(
    `${SUPABASE_URL}/rest/v1/projects?select=ProjectID,PrincipalInvestigator,DivisionCode`,
    { headers })).json();

  let filled = 0, ambiguous = 0, unmatched = 0;
  for (const p of projects as Array<Record<string, string>>) {
    if (p.DivisionCode || !p.PrincipalInvestigator) continue;
    const hits = new Set((staff as Array<Record<string, string>>)
      .filter((s) => s.Name && s.Division && staffNameMatchesAuthor(s.Name, p.PrincipalInvestigator))
      .map((s) => s.Division));
    if (hits.size !== 1) {
      if (hits.size) ambiguous++; else unmatched++;
      continue;
    }
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?ProjectID=eq.${encodeURIComponent(p.ProjectID)}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ DivisionCode: [...hits][0] }),
      });
    if (res.ok) filled++;
  }
  console.log(`\n## project divisions: filled ${filled}, ambiguous ${ambiguous}, no match ${unmatched}`);
}

async function main() {
  const doPush = process.argv.includes('--push');
  if (process.argv.includes('--backfill-divisions')) return backfillProjectDivisions();
  for (const { path, type } of FILES) {
    const parsed = await parseFileRaw(toFile(path));
    if (!parsed.success || !parsed.data?.length) {
      console.log(`\n## ${type} <- ${basename(path)}\n   PARSE FAILED: ${parsed.error ?? 'no rows'}`);
      continue;
    }
    const headers = Object.keys(parsed.data[0]);
    const detected = detectColumnMappings(headers, type);
    const mapping = Object.fromEntries(detected.map((d) => [d.raw, d.mapped]));
    const mapped = applyColumnMapping(parsed.data, mapping, type);
    const validation = validateRows(mapped, type);
    const invalid = validation.filter((v) => !v.isValid);

    console.log(`\n## ${type} <- ${basename(path)}`);
    console.log(`   rows parsed: ${parsed.data.length} | mapped: ${mapped.length} | invalid: ${invalid.length}`);
    const unmapped = detected.filter((d) => !d.mapped).map((d) => d.raw);
    if (unmapped.length) console.log(`   UNMAPPED HEADERS: ${unmapped.join(' | ')}`);
    if (invalid.length) {
      console.log(`   first errors: ${JSON.stringify(invalid.slice(0, 3).map((v) => v.errors))}`);
    }

    // Invalid rows are the source file's own bad rows (blank lines, a stray
    // non-UUID); the console shows them in its cleaning step. Push the rest.
    const badRows = new Set(invalid.map((v) => v.rowIndex));
    const clean = mapped.filter((_, i) => !badRows.has(i));
    if (doPush && clean.length) {
      await push(TABLE_NAMES[type], clean);
      console.log(`   PUSHED ${clean.length} row(s) -> ${TABLE_NAMES[type]}`);
    }
  }
}

main();
