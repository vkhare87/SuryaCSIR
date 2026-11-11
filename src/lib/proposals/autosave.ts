import type { Proposal } from '../../types/proposal';

/** Fields changed in the browser and not yet confirmed saved. */
export type DraftPatch = Partial<Proposal>;

const key = (proposalId: string) => `surya_proposal_draft_${proposalId}`;

/**
 * Unsaved edits kept in this browser, so a crash, a closed tab or a dropped
 * connection mid-typing loses nothing. Written on every change, cleared when
 * the server confirms. Storage can be unavailable (private window, quota):
 * then autosave still works and only this safety net is absent.
 */
export function readPending(proposalId: string): DraftPatch | null {
  try {
    const raw = localStorage.getItem(key(proposalId));
    if (!raw) return null;
    const patch = JSON.parse(raw) as DraftPatch;
    return patch && typeof patch === 'object' && Object.keys(patch).length > 0 ? patch : null;
  } catch {
    return null;
  }
}

export function writePending(proposalId: string, patch: DraftPatch): void {
  try {
    if (Object.keys(patch).length === 0) localStorage.removeItem(key(proposalId));
    else localStorage.setItem(key(proposalId), JSON.stringify(patch));
  } catch {
    // Storage unavailable — see readPending.
  }
}
