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

const EXTERNAL_FUND_TYPES = /consultan|sponsor|industr|contract/i;

/**
 * Income side of the R&D balance sheet: granted IP = licensable assets;
 * consultancy/sponsored projects = external revenue engagements.
 */
export function commercialisationSummary(
  ip: IPIntelligence[],
  projects: ProjectInfo[],
  transfers: TechTransfer[] = [],
): CommercialisationSummary {
  const granted = ip.filter(i => i.status === 'Granted');
  const external = projects.filter(
    p => EXTERNAL_FUND_TYPES.test(p.FundType) || EXTERNAL_FUND_TYPES.test(p.SponsorerType),
  );
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
