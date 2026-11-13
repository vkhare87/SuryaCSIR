import { describe, it, expect } from 'vitest';
import { describeOm, extractOmFields, parseOmAmount, parseOmDate } from './omExtract';

const ORDER = `
COUNCIL OF SCIENTIFIC & INDUSTRIAL RESEARCH
No. 1-2(345)/2025-PPD                     Dated: 12.03.2026
OFFICE MEMORANDUM
Subject: Release of funds for project HCP0054
The Director General is pleased to release Rs. 25,50,000 as detailed below:
Equipment            Rs. 15,00,000
Consumables          Rs. 4,50,000
Travel (India)       Rs. 1,00,000
Contingency          Rs. 5,00,000
Total                Rs. 25,50,000
This issues with the concurrence of IFD vide File No. IFD/2025/118 dated 10th March, 2026.
`;

describe('omExtract', () => {
  it('reads order number, dates, IFD file and amounts by head', () => {
    const f = extractOmFields(ORDER);
    expect(f.orderNo).toBe('1-2(345)/2025-PPD');
    expect(f.orderDate).toBe('2026-03-12');
    expect(f.ifdFileNo).toBe('IFD/2025/118');
    expect(f.ifdDate).toBe('2026-03-10');
    expect(f.total).toBe(2550000);
    expect(f.byHead).toEqual({ EQUIPMENT: 1500000, CONSUMABLES: 450000, TA_INDIA: 100000, CONTINGENCY: 500000 });
  });

  it('a file with no text fills nothing', () => {
    const f = extractOmFields('   \n  ');
    expect(describeOm(f)).toEqual([]);
  });

  it('reads lakh and crore, and month names', () => {
    expect(parseOmAmount('released ₹ 25.5 lakh')).toBe(2550000);
    expect(parseOmAmount('INR 1.2 crore')).toBe(12000000);
    expect(parseOmDate('5-Apr-26')).toBe('2026-04-05');
    expect(parseOmDate('31.02.20xx')).toBeUndefined();
  });
});

describe('ask entity', async () => {
  const { parseAskEntity, askAboutHref } = await import('../ask/client');
  it('reads ?entity= and refuses anything else', () => {
    expect(parseAskEntity('project:P-1')).toEqual({ type: 'project', id: 'P-1' });
    expect(parseAskEntity('salary:1')).toBeNull();
    expect(parseAskEntity('project:')).toBeNull();
    expect(askAboutHref({ type: 'staff', id: 'S 1' })).toBe('/ask?entity=staff%3AS%201');
  });
});
