import type { IPIntelligence, ProjectInfo, TechTransfer } from '../../types';

export interface CommercialisationSummary {
  grantedPatents: number;
  filedPatents: number;
  externalProjects: number;
  externalValue: number;
  transferCount: number;
  transferValueLakhs: number;
  licensableAssets: { title: string; type: string; divisionCode: string }[];
}

const EXTERNAL_FUND_TYPES = /consultan|sponsor|industr|contract|extramural|\bECF\b/i;

/** CSIR-AMPRI's own project records name the funder, not the arrangement: fund type
 * 'ECF' (External Cash Flow) against sponsor types 'Central Govt/Agencies',
 * 'State Govt/Agencies', 'Private' and 'PSU', with in-house work sponsored by 'CSIR'
 * itself. Matching only 'consultancy/sponsored/industry' read every externally funded
 * project as in-house and showed the commercialisation strip as zero. */
const IN_HOUSE_SPONSOR = /^\s*(csir|in[- ]?house|lab)\b/i;

function isExternallyFunded(p: ProjectInfo): boolean {
  if (EXTERNAL_FUND_TYPES.test(p.FundType ?? '')) return true;
  const sponsor = (p.SponsorerType ?? '').trim();
  return sponsor !== '' && !IN_HOUSE_SPONSOR.test(sponsor);
}

/**
 * Income side of the R&D balance sheet: granted IP = licensable assets;
 * externally funded projects = external revenue engagements.
 */
export function commercialisationSummary(
  ip: IPIntelligence[],
  projects: ProjectInfo[],
  transfers: TechTransfer[] = [],
): CommercialisationSummary {
  const granted = ip.filter(i => i.status === 'Granted');
  const external = projects.filter(isExternallyFunded);
  const live = transfers.filter(t => t.status !== 'Terminated');
  return {
    grantedPatents: granted.length,
    filedPatents: ip.filter(i => i.status === 'Filed').length,
    externalProjects: external.length,
    externalValue: external.reduce((sum, p) => sum + (parseFloat(p.SanctionedCost) || 0), 0),
    transferCount: live.length,
    transferValueLakhs: live.reduce((s, t) => s + (t.valueLakhs ?? 0), 0),
    licensableAssets: granted.map(i => ({ title: i.title, type: i.type, divisionCode: i.divisionCode })),
  };
}
