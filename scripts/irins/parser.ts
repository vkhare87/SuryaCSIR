import { JSDOM } from 'jsdom';
import type { IrinsCitations, IrinsPublication } from './types';

const toInt = (v: unknown): number | undefined => {
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
};

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export function parseCitations(json: string): IrinsCitations {
  try {
    const g = JSON.parse(json)?.google_data;
    if (!g) return {};
    return {
      total: toInt(g.all),
      total_2013: toInt(g.all_2013),
      h_index: toInt(g.h_all),
      h_index_2013: toInt(g.h_2013),
      i10: toInt(g.hi10_all),
      i10_2013: toInt(g.hi10_2013),
    };
  } catch {
    return {};
  }
}

export function parsePublications(fragmentHtml: string): IrinsPublication[] {
  const doc = new JSDOM(fragmentHtml).window.document;
  const out: IrinsPublication[] = [];
  doc.querySelectorAll('h2').forEach((h2) => {
    const title = clean(h2.textContent);
    if (!title) return;
    const block = h2.closest('#other-view, .funny-boxes, .row') ?? h2.parentElement;
    const blockText = clean(block?.textContent);
    const authorsRaw = clean(block?.querySelector('.author')?.textContent);
    const authors = authorsRaw ? authorsRaw.split(/[;,]/).map(clean).filter(Boolean) : [];
    const year = blockText.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? '';
    const doi = blockText.match(/10\.\d{4,}\/[^\s"'<>]+/)?.[0] ?? '';
    const type = blockText.match(/Journal Article|Book Chapter|Conference|Review|Letter|Editorial/i)?.[0] ?? '';
    const journal = clean(block?.querySelector('.journal, em, i')?.textContent);
    out.push({ title, authors, journal, year, doi, type });
  });
  return out;
}
