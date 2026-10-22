import { describe, it, expect } from 'vitest';
import { pagesNeedingOcr } from './awpOcrPages';

const typed = 'x'.repeat(400);

describe('pagesNeedingOcr', () => {
  it('needs no OCR when every page has a text layer', () => {
    expect(pagesNeedingOcr([typed, typed])).toEqual([]);
  });

  it('OCRs every page of a scan', () => {
    expect(pagesNeedingOcr(['', ' ', '\n'])).toEqual([0, 1, 2]);
  });

  it('does not OCR a typed PDF just because its last page is nearly blank (reviewer finding)', () => {
    expect(pagesNeedingOcr([typed, typed, 'Page 3'])).toEqual([]);
  });

  it('OCRs only the scanned signature page of a mixed PDF', () => {
    expect(pagesNeedingOcr([typed, typed, typed, ''])).toEqual([3]);
  });
});
