/**
 * Chart color palette. Recharts wants hex/rgb at render time, so we
 * resolve from CSS vars at module init and expose a stable array.
 * For dark-mode parity, components that need it can call resolvePalette()
 * inside a useEffect tied to theme changes.
 */

export const CHART_PALETTE = [
  '#c96442', // terracotta
  '#d97757', // coral
  '#3898ec', // focus-blue
  '#5e5d59', // olive-gray
  '#7a4a1e', // warning brown
  '#4d4c48', // charcoal-warm
  '#b53333', // error-crimson
  '#87867f', // stone-gray
  '#b0aea5', // warm-silver
];

export const SEMANTIC = {
  positive: '#4f9d6d',
  negative: '#b53333',
  warning: '#d4923d',
  neutral: '#87867f',
  brand: '#c96442',
  accent: '#3898ec',
};

export function colorAt(i: number): string {
  return CHART_PALETTE[i % CHART_PALETTE.length];
}
