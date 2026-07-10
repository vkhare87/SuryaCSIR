import { parseDate } from '../../utils/dateUtils';
import type {
  DivisionInfo, StaffMember, ProjectInfo, ScientificOutput, IPIntelligence,
  MoU, TechTransfer, PhDStudent,
} from '../../types';

export interface DossierData {
  staff: StaffMember[];
  projects: ProjectInfo[];
  scientificOutputs: ScientificOutput[];
  ipIntelligence: IPIntelligence[];
  mous: MoU[];
  techTransfers: TechTransfer[];
  phDStudents: PhDStudent[];
}

function section<T>(title: string, items: T[], line: (t: T) => string): string[] {
  const out = [`## ${title} (${items.length})`, ''];
  if (items.length === 0) out.push('None recorded.', '');
  else out.push(...items.map(i => `- ${line(i)}`), '');
  return out;
}

/** Per-year record counts across the division's active span. Zero years are
 * listed explicitly: a silent gap reads as "division did nothing", when the
 * likelier cause is a record that never made it into the system. */
function coverage(projects: ProjectInfo[], pubs: ScientificOutput[]): string[] {
  const byYear = new Map<number, number>();
  for (const p of projects) {
    const y = parseDate(p.StartDate)?.getFullYear();
    if (y) byYear.set(y, (byYear.get(y) ?? 0) + 1);
  }
  for (const s of pubs) {
    if (s.year) byYear.set(s.year, (byYear.get(s.year) ?? 0) + 1);
  }
  if (byYear.size === 0) return ['## Record coverage', '', 'None recorded.', ''];
  const years = [...byYear.keys()];
  const out = ['## Record coverage', '',
    '_Projects started + publications per year. Zero-record gaps may reflect missing/un-ingested records, not inactivity — verify against physical archives before concluding._', ''];
  for (let y = Math.min(...years); y <= Math.max(...years); y++) {
    const n = byYear.get(y) ?? 0;
    out.push(`- ${y}: ${n > 0 ? `${n} record(s)` : 'no records'}`);
  }
  out.push('');
  return out;
}

/** Markdown handover dossier: everything the system knows about one division. */
export function buildDossier(division: DivisionInfo, data: DossierData): string {
  const code = division.divCode;
  const staff = data.staff.filter(s => s.Division === code);
  const projects = data.projects.filter(p => p.DivisionCode === code);
  const pubs = data.scientificOutputs.filter(s => s.divisionCode === code);
  const ip = data.ipIntelligence.filter(i => i.divisionCode === code);
  const mous = data.mous.filter(m => m.divisionCode === code);
  const transfers = data.techTransfers.filter(t => t.divisionCode === code);
  const phd = data.phDStudents.filter(p => p.DivisionCode === code);

  return [
    `# Handover dossier — ${division.divName} (${code})`,
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} · HoD: ${division.divHoD || '—'} · ` +
    `strength ${division.divCurrentStrength}/${division.divSanctionedstrength}`,
    '',
    ...section('Staff', staff,
      s => `${s.Name} — ${s.Designation}${s.CoreArea ? ` (${s.CoreArea})` : ''}`),
    ...section('Projects', projects,
      p => `${p.ProjectNo} ${p.ProjectName} — ${p.ProjectStatus}; PI ${p.PrincipalInvestigator || '—'}; ` +
        `₹${p.SanctionedCost || '—'}; ${p.StartDate || '?'} → ${p.CompletioDate || '?'}`),
    ...section('Publications', [...pubs].sort((a, b) => b.year - a.year),
      s => `(${s.year}) ${s.title} — ${s.journal}${s.doi ? ` [doi:${s.doi}]` : ''}`),
    ...section('Intellectual property', ip,
      i => `${i.type} ${i.status}: ${i.title} (filed ${i.filingDate})`),
    ...section('MOUs', mous,
      m => `${m.partnerName} (${m.partnerType}) — ${m.status}, ${m.signedDate} → ${m.validUntil}`),
    ...section('Technology transfers', transfers,
      t => `${t.technologyTitle} → ${t.licensee} (${t.agreementType}, ${t.status})` +
        (t.valueLakhs ? `, ₹${t.valueLakhs}L` : '')),
    ...section('PhD students', phd,
      p => `${p.StudentName} — ${p.CurrentStatus}; supervisor ${p.SupervisorName}`),
    ...coverage(projects, pubs),
  ].join('\n');
}
