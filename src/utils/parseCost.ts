/** Parse a loose cost string (e.g. "₹ 1,250.50 L") to a number. Returns 0 if unparseable. */
export function parseCost(s: string | undefined): number {
  if (!s) return 0;
  const v = parseFloat(s.replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(v) ? v : 0;
}
