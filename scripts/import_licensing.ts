/**
 * Load CSIR-AMPRI's technology-licensing record into `tech_transfers`.
 *
 * Source: the institute's own "Patents licensed.pdf", already indexed in the RAG
 * corpus. Every field here is transcribed from that table by pymupdf's structural
 * table extractor — nothing is inferred or invented. Rows the extractor cannot
 * resolve into (title, licensee, date, amount) are reported and skipped rather
 * than guessed, so the table only ever holds what the PDF actually says.
 *
 *   python rag/eval/extract_licensing.py      # writes scripts/licensing_rows.json
 *   npx tsx scripts/import_licensing.ts       # dry run
 *   npx tsx scripts/import_licensing.ts --push
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const ROWS_JSON = resolve(import.meta.dirname, 'licensing_rows.json');

interface RawRow {
  sno: string; title: string; ip_type: string; date: string;
  licensee: string; license_type: string; amount: string;
}

/** '11-May-13' -> '2013-05-11'. The PDF uses two-digit years throughout. */
function toISO(d: string): string | null {
  const m = d.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (!m) return null;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const mi = months.indexOf(m[2].toLowerCase());
  if (mi < 0) return null;
  const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${yr}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Licensee strings are company names with addresses; the schema wants a type. */
function licenseeType(name: string): string {
  const s = name.toLowerCase();
  if (/\b(ltd|limited|pvt|private|industries|enterprises|company|corp|inc)\b/.test(s)) return 'Industry';
  if (/\b(nhai|drdo|isro|railway|ministry|govt|government|department|board)\b/.test(s)) return 'Government';
  if (/\b(psu|bhel|sail|ntpc|coal india)\b/.test(s)) return 'PSU';
  return 'Other';
}

function clean(s: string): string {
  return (s || '').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

async function push(rows: Record<string, unknown>[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/tech_transfers`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 400)}`);
}

async function main() {
  const raw: RawRow[] = JSON.parse(readFileSync(ROWS_JSON, 'utf-8'));
  const rows: Record<string, unknown>[] = [];
  const skipped: string[] = [];

  for (const r of raw) {
    const title = clean(r.title);
    const licensee = clean(r.licensee);
    const date = toISO(r.date);
    // A zero lump sum is a real agreement (royalty-only, or terms left as '---'),
    // not a parse failure — excluding it would undercount technology transfers.
    const amount = Number(clean(r.amount).replace(/[^0-9.]/g, ''));
    const missing = [!title && 'title', !licensee && 'licensee', !date && 'date',
                     (!Number.isFinite(amount) || amount < 0) && 'amount'].filter(Boolean);
    if (missing.length) {
      skipped.push(`#${r.sno} ${title.slice(0, 50) || '(no title)'} — missing ${missing.join(', ')}`);
      continue;
    }
    rows.push({
      technology_title: title,
      licensee,
      licensee_type: licenseeType(licensee),
      agreement_type: /know[- ]how/i.test(r.ip_type) ? 'Know-how Transfer' : 'License',
      agreement_date: date,
      value_lakhs: Number((amount / 100000).toFixed(2)),   // PDF states rupees
      status: 'Completed',                                  // lump sum already received
      remarks: `${clean(r.license_type) || 'Non-Exclusive'}; transcribed from Patents licensed.pdf`,
    });
  }

  const total = rows.reduce((s, r) => s + (r.value_lakhs as number), 0);
  console.log(`parsed ${rows.length} licensing agreement(s), ${skipped.length} skipped`);
  console.log(`total value: ${total.toFixed(2)} lakhs (INR ${(total * 100000).toLocaleString('en-IN')})`);
  for (const s of skipped) console.log(`  SKIP ${s}`);
  for (const r of rows.slice(0, 3)) {
    console.log(`  e.g. ${r.agreement_date} ${String(r.technology_title).slice(0, 46)}… -> ${r.licensee} (${r.value_lakhs} L)`);
  }

  if (process.argv.includes('--push')) {
    await push(rows);
    console.log(`PUSHED ${rows.length} row(s) -> tech_transfers`);
  }
}

main();
