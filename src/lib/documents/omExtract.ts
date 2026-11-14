import type { BudgetHead } from '../projects/heads';

/**
 * Fields read from the text of a fund release order / sanction OM (EI7). Pure:
 * the PDF text comes from extractPdfText (text layer, else OCR). Only what the
 * text states is returned; a person checks and saves.
 */
export interface OmFields {
  orderNo?: string;
  orderDate?: string;   // yyyy-mm-dd
  ifdFileNo?: string;
  ifdDate?: string;     // yyyy-mm-dd
  total?: number;       // rupees
  byHead: Partial<Record<BudgetHead, number>>;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE_RE = String.raw`(\d{1,2})(?:st|nd|rd|th)?[\s./-]+(\d{1,2}|[A-Za-z]{3,9})[\s.,/-]+(\d{4}|\d{2})`;

const HEAD_WORDS: [BudgetHead, RegExp][] = [
  ['EQUIPMENT', /equipment/i],
  ['WORKS', /works/i],
  ['MANPOWER', /manpower|salar|fellowship|emolument/i],
  ['CONSUMABLES', /consumable/i],
  ['TA_ABROAD', /(travel|\bta\b).*(abroad|foreign)/i],
  ['TA_INDIA', /travel|\bt\.?a\.?\b/i],
  ['CONTINGENCY', /contingenc/i],
  ['OUTSOURCING', /outsourc/i],
];

/** "12.03.2026", "12th March, 2026", "12-Mar-26" → "2026-03-12"; undefined if not a date. */
export function parseOmDate(text: string): string | undefined {
  const m = new RegExp(DATE_RE).exec(text);
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = /^\d+$/.test(m[2]) ? Number(m[2]) : MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (year < 1990 || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "Rs. 12,34,567", "₹ 25.50 lakh", "INR 1.2 crore" → rupees. */
export function parseOmAmount(text: string): number | undefined {
  const m = /(?:rs\.?|₹|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr\.?)?/i.exec(text)
    ?? /([\d,]{4,}(?:\.\d+)?)\s*(lakhs?|lacs?|crores?)?/i.exec(text);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const unit = (m[2] ?? '').toLowerCase();
  return Math.round(unit.startsWith('l') ? n * 1e5 : unit.startsWith('c') ? n * 1e7 : n);
}

export function extractOmFields(text: string): OmFields {
  const out: OmFields = { byHead: {} };
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  for (const line of lines) {
    if (/\bifd\b|finance.*concurrence/i.test(line)) {
      const no = /(?:file\s*no|f\.?\s*no|no)\.?\s*[:-]?\s*([A-Za-z0-9][\w\-/().]{3,})/i.exec(line);
      if (no && !out.ifdFileNo) out.ifdFileNo = no[1];
      const dated = /(?:dated|dt\.?)\s*[:-]?\s*(.+)$/i.exec(line);
      if (dated && !out.ifdDate) out.ifdDate = parseOmDate(dated[1]);
      continue;
    }
    if (!out.orderNo) {
      const no = /^(?:f\.?\s*)?no\.?\s*[:-]?\s*([A-Za-z0-9][\w\-/().]{3,})/i.exec(line);
      if (no) {
        out.orderNo = no[1];
        const dated = /(?:dated|date)\s*[:-]?\s*(.+)$/i.exec(line);
        if (dated) out.orderDate = parseOmDate(dated[1]);
        continue;
      }
    }
    if (!out.orderDate) {
      const dated = /^(?:dated|date)\s*[:-]?\s*(.+)$/i.exec(line);
      if (dated) { out.orderDate = parseOmDate(dated[1]); continue; }
    }
    if (/\btotal\b/i.test(line)) {
      const amt = parseOmAmount(line);
      if (amt && !out.total) out.total = amt;
      continue;
    }
    const head = HEAD_WORDS.find(([, re]) => re.test(line));
    if (head && out.byHead[head[0]] === undefined) {
      const amt = parseOmAmount(line);
      if (amt) out.byHead[head[0]] = amt;
    }
  }
  if (out.total === undefined) {
    const heads = Object.values(out.byHead);
    if (heads.length) out.total = heads.reduce((a, b) => a + b, 0);
    else {
      const any = lines.map(l => /released|sanction|amount/i.test(l) ? parseOmAmount(l) : undefined).find(Boolean);
      if (any) out.total = any;
    }
  }
  return out;
}

/** Plain list of what was found, for "Filled: …". */
export function describeOm(f: OmFields): string[] {
  return [
    f.orderNo && 'order number', f.orderDate && 'order date', f.ifdFileNo && 'IFD file number',
    f.ifdDate && 'IFD date', f.total && 'amount', Object.keys(f.byHead).length && 'amounts by head',
  ].filter((x): x is string => Boolean(x));
}
