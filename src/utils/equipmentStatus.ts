export type EquipmentStatusClass = 'Working' | 'Under Maintenance' | 'Not Working' | 'Unknown';

/**
 * Buckets free-text `WorkingStatus` into the four classes the UI counts and
 * filters by. The source Excel column is typed by hand ("Working, No AMC",
 * "not working; no AMC", "Warrenty till March 2026"…), so exact matching on
 * 'Working' marked most live instruments as down.
 */
export function equipmentStatusClass(raw: string | null | undefined): EquipmentStatusClass {
  const s = (raw ?? '').trim().toLowerCase();
  if (/^not\b|returned to stores/.test(s)) return 'Not Working';
  if (/^working\b/.test(s)) return 'Working';
  if (s.includes('maintenance')) return 'Under Maintenance';
  // ponytail: warranty/AMC-only notes stay Unknown rather than guessed as Working.
  return 'Unknown';
}

/** Out of service: not working or under maintenance. Unknown is not counted as down. */
export function isEquipmentDown(raw: string | null | undefined): boolean {
  const c = equipmentStatusClass(raw);
  return c === 'Not Working' || c === 'Under Maintenance';
}
