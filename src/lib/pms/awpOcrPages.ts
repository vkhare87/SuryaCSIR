// Kept apart from awpOcr.ts so it can be unit-tested without pdf.js / tesseract.

const MIN_TEXT_CHARS = 50;

/**
 * Indexes of pages that need OCR: empty pages always; short pages only when
 * no page has a real text layer (a scan). A typed PDF's short last page is
 * left alone.
 */
export function pagesNeedingOcr(pageTexts: string[]): number[] {
  const chars = pageTexts.map(t => t.replace(/\s/g, '').length);
  const typed = chars.some(n => n >= MIN_TEXT_CHARS);
  return chars.flatMap((n, i) => (n === 0 || (!typed && n < MIN_TEXT_CHARS) ? [i] : []));
}
