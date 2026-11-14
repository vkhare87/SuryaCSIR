import type { PackKind } from '../../types/projectFile';

export const PACK_LABELS: Record<PackKind, string> = {
  FIRST_RELEASE: 'Request for first release of funds',
  NEXT_YEAR_RELEASE: 'Request for release of funds for the next year',
  REPHASING: 'Request for rephasing of the budget',
  REAPPROPRIATION: 'Request for re-appropriation between heads',
};

/** HQ categories whose stages I–VI need deliverables on file (§4.2). */
export const STAGE_GATE_CATEGORIES = ['FTT', 'FTC', 'MMP'];
