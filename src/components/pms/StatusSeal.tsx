import clsx from 'clsx';
import type { ReportStatus } from '../../types/pms';
import { STATUS_COLORS } from '../../lib/pms/constants';

/**
 * DESIGN.md R3 — the stamped seal for PMS report states.
 *
 * Adopted 2026-07-18, never built; PMS kept rendering the generic filled
 * pill badge. The distinction the design calls for is colour-by-ink rather
 * than colour-by-fill: a seal reads as something applied to a document, a
 * filled pill reads as UI chrome. Mono type, hairline border, a fraction of
 * a degree of rotation.
 *
 * Accessibility notes, both load-bearing:
 *  - The rotation is decorative, so it is suppressed under
 *    prefers-reduced-motion-safe styling by living in a transform that the
 *    existing reduced-motion block in index.css does not animate — it never
 *    moves, so there is nothing to disable, but it also must not be the only
 *    signal. Status is carried by the text itself, not the angle.
 *  - `role="status"` with an explicit label keeps the mono/rotated styling
 *    from degrading what a screen reader announces.
 */

/** Ink colour per state. Terracotta is reserved for CTAs (R2), so it is
 *  deliberately absent — a seal is a statement of fact, not an action. */
const SEAL_INK: Record<ReportStatus, string> = {
  DRAFT:                             'text-text-muted border-border',
  SUBMITTED:                         'text-iron-gall border-iron-gall/40',
  UNDER_EVALUATION_COMMITTEE_REVIEW: 'text-turmeric border-turmeric/50',
  EMPOWERED_COMMITTEE_REVIEW:        'text-iron-gall border-iron-gall/60',
  FINALIZED:                         'text-archive-green border-archive-green/50',
  NOT_ASSESSED:                      'text-text-muted border-border',
  UNDER_GRIEVANCE_REVIEW:            'text-turmeric border-turmeric/70',
};

/** A settled state sits straight; one still in motion sits very slightly off.
 *  Sub-degree on purpose — enough to read as stamped, not as broken layout. */
const SEAL_TILT: Partial<Record<ReportStatus, string>> = {
  UNDER_EVALUATION_COMMITTEE_REVIEW: '-rotate-1',
  EMPOWERED_COMMITTEE_REVIEW:        '-rotate-1',
  UNDER_GRIEVANCE_REVIEW:            'rotate-1',
};

interface StatusSealProps {
  status: ReportStatus;
  className?: string;
}

export function StatusSeal({ status, className }: StatusSealProps) {
  const label = STATUS_COLORS[status].label;

  return (
    <span
      role="status"
      aria-label={`Report status: ${label}`}
      className={clsx(
        'inline-flex items-center rounded-md border px-2.5 py-1',
        'font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
        'bg-transparent whitespace-nowrap',
        SEAL_INK[status],
        SEAL_TILT[status],
        className,
      )}
    >
      {label}
    </span>
  );
}
