import type { CsirRule } from '../../types';

/** Rule keys the browser reads. The server reads the same rows through csir_rule(). */
export const RULE = {
  majorEquipmentInr: 'project.major_equipment_threshold_inr',
  costOverrunDgLimitPct: 'project.cost_overrun_dg_limit_pct',
} as const;

const today = () => new Date().toISOString().slice(0, 10);

/** Maps a csir_rules row to a CsirRule. */
export function mapRuleRow(row: Record<string, unknown>): CsirRule {
  return {
    id: String(row.id),
    ruleKey: String(row.rule_key),
    value: row.value,
    unit: (row.unit as string | null) ?? null,
    effectiveFrom: String(row.effective_from),
    effectiveTo: (row.effective_to as string | null) ?? null,
    sourceRef: String(row.source_ref),
    verified: Boolean(row.verified),
    note: (row.note as string | null) ?? null,
  };
}

/** The row in force for a key on an ISO date, or undefined (mirrors csir_rule()). */
export function ruleOn(rules: CsirRule[], key: string, on: string = today()): CsirRule | undefined {
  return rules
    .filter(r => r.ruleKey === key && r.effectiveFrom <= on && (r.effectiveTo === null || r.effectiveTo >= on))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

/** A numeric rule value, or null when there is no row (never a default). */
export function ruleNumber(rules: CsirRule[], key: string, on?: string): number | null {
  const v = ruleOn(rules, key, on)?.value;
  return typeof v === 'number' ? v : null;
}
