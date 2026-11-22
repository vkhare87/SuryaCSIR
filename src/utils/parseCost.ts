/** Parse a loose cost string (e.g. "₹ 1,250.50 L") to a number. Returns 0 if unparseable. */
export function parseCost(s: string | number | null | undefined): number {
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  if (!s) return 0;
  const plain = Number(String(s).trim());
  if (Number.isFinite(plain)) return plain;
  const v = parseFloat(String(s).replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(v) ? v : 0;
}
