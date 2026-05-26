import { JSDOM } from 'jsdom';
import type {
  IrinsCitations, IrinsPublication, IrinsProfile,
  IrinsExperience, IrinsQualification, IrinsAward, IrinsPatent, IrinsProject,
} from './types';

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

type ProfilePagePart = Pick<IrinsProfile,
  'name' | 'designation' | 'division' | 'photo_url' | 'academic_ids' |
  'expertise' | 'experience' | 'qualifications' | 'awards' | 'patents' |
  'projects' | 'professional_bodies'>;

const idVal = (doc: Document, id: string) => clean(doc.getElementById(id)?.textContent);
const childTexts = (doc: Document, id: string): string[] => {
  const el = doc.getElementById(id);
  if (!el) return [];
  return Array.from(el.children).map((c) => clean(c.textContent)).filter(Boolean);
};
const leadingYear = (s: string) => s.match(/^\s*((?:19|20)\d{2})/)?.[1] ?? '';

export function parseProfilePage(html: string): ProfilePagePart {
  const doc = new JSDOM(html).window.document;

  // Name is the profile heading (h1). designation/division are not in dedicated
  // elements, so derive them from the current ("Present") experience entry below.
  const name = clean(doc.querySelector('h1')?.textContent);
  const photo_url = (doc.querySelector('img[src*="profile_images"]') as HTMLImageElement | null)?.src ?? '';

  const academic_ids = {
    orcid: idVal(doc, 'i_orcid_id'),
    scopus: idVal(doc, 'i_scopus_id'),
    researcher_id: idVal(doc, 'i_isi_id'),
    google_scholar: idVal(doc, 'i_google_sid'),
  };

  const expertise = (idVal(doc, 'e_expertise') || idVal(doc, 'list_expert'))
    .split(/[,;]/).map(clean).filter(Boolean);

  const awards: IrinsAward[] = childTexts(doc, 'list-awards').map((t) => ({
    year: leadingYear(t),
    title: clean(t.replace(/^\s*(?:19|20)\d{2}\s*/, '')),
    awarding_body: '',
  }));

  const projects: IrinsProject[] = childTexts(doc, 'list-rp').map((t) => ({
    title: clean(t.split(/Funding Agency\s*:/i)[0]),
    funding_agency: clean(t.match(/Funding Agency\s*:\s*(.*?)(?:Ongoing|Completed|Principal Investigator|Co-Principal|\d{4}\s*-\s*\d{4}|$)/i)?.[1]),
    status: t.match(/Ongoing|Completed|Current/i)?.[0] ?? '',
    role: t.match(/Principal Investigator|Co-Principal Investigator|Co-Investigator/i)?.[0] ?? '',
    budget: t.match(/\b(\d{6,})\b/)?.[1] ?? '',
    duration: t.match(/\b(?:19|20)\d{2}\s*-\s*(?:Present|\d{4})\b/)?.[0] ?? '',
  }));

  const patents: IrinsPatent[] = childTexts(doc, 'list-pt').map((t) => ({
    title: clean(t.split(/Patent No\.?/i)[0].split(/\.\s/)[0]),
    inventors: [],
    number: clean(t.match(/Patent No\.?\s*(.*?)(?:Engineering|Granted|Filed|$)/i)?.[1]).replace(/\s+/g, ' '),
    status: t.match(/Granted|Filed|Pending|Published/i)?.[0] ?? '',
    filing_date: t.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '',
  }));

  const splitTimeline = (id: string): string[] => {
    const txt = clean(doc.getElementById(id)?.textContent);
    if (!txt) return [];
    return txt.split(/(?=(?:19|20)\d{2}\s*-\s*(?:Present|\d{4}))/).map(clean).filter(Boolean);
  };

  const experience: IrinsExperience[] = splitTimeline('list_panel_experience').map((t) => {
    const period = t.match(/(?:19|20)\d{2}\s*-\s*(?:Present|\d{4})/)?.[0] ?? '';
    const rest = clean(t.replace(period, ''));
    return { period, role: rest, division: '' };
  });

  const qualifications: IrinsQualification[] = clean(doc.getElementById('list_panel_qualification')?.textContent)
    .split(/(?=(?:19|20)\d{2}\s)/).map(clean).filter(Boolean).map((t) => {
      const year = leadingYear(t);
      const rest = clean(t.replace(/^\s*(?:19|20)\d{2}\s*/, ''));
      const degree = rest.split(/\s/)[0] ?? '';
      return { year, degree, institution: clean(rest.slice(degree.length)) };
    });

  const professional_bodies = childTexts(doc, 'list_org');

  // designation/division from the current experience entry (period includes "Present").
  const current = experience.find((e) => /Present/i.test(e.period));
  const designation = current ? current.role.split(/\s{2,}|(?<=\b[A-Z])\s(?=[A-Z])/)[0].split(/\s/).slice(0, 3).join(' ') : '';
  const division = '';

  return {
    name, designation, division, photo_url, academic_ids, expertise,
    experience, qualifications, awards, patents, projects, professional_bodies,
  };
}
