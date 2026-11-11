/** Which six-month block of the project a date falls in (guidelines §4.2: 6-month sub-stages). */
export function subStage(startIso: string | null | undefined, dateIso: string): number | null {
  if (!startIso) return null;
  const s = new Date(`${startIso}T00:00:00`);
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(d.getTime()) || d < s) return null;
  const months = (d.getFullYear() - s.getFullYear()) * 12 + (d.getMonth() - s.getMonth());
  return Math.floor(months / 6) + 1;
}
