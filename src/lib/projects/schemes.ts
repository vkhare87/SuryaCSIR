// project_schemes rows (20261110000002, EFP / OLP added by 20261113000009).
export const SCHEMES = [
  { code: 'ULIP', label: 'In-house (ULIP)' },
  { code: 'HQ', label: 'CSIR HQ scheme' },
  { code: 'EFP', label: 'Externally funded project' },
  { code: 'OLP', label: 'Lab seed / own project' },
] as const;

export type SchemeCode = typeof SCHEMES[number]['code'];

export const schemeLabel = (code: string | null | undefined) =>
  SCHEMES.find(s => s.code === code)?.label ?? code ?? '';
