export interface BasicInfoPayload {
  previousPmsSubmittedOnTime: boolean | null;
  previousPmsSubmissionDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  selfScore: number | null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function asScore(value: unknown): number | null {
  if (typeof value === 'boolean' || value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lifts the report-level columns out of whichever section carries them for
 * this track — `summary` on the standard proforma, `sr_identification` /
 * `dir_identification` on the annexures. `pms_submit_report` rejects a report
 * whose period dates are NULL, so these must reach `pms_reports`, not just the
 * section jsonb.
 */
export function basicInfoFromSection(
  data: Record<string, unknown>,
  previous: Pick<BasicInfoPayload, 'previousPmsSubmittedOnTime' | 'previousPmsSubmissionDate'>,
): BasicInfoPayload {
  return {
    previousPmsSubmittedOnTime: previous.previousPmsSubmittedOnTime,
    previousPmsSubmissionDate:  previous.previousPmsSubmissionDate,
    periodFrom: nonEmpty(data.periodFrom),
    periodTo:   nonEmpty(data.periodTo),
    selfScore:  asScore(data.selfScore),
  };
}
