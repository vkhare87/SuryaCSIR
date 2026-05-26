import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCitations, parsePublications } from './parser';

const fx = (f: string) => readFileSync(join(process.cwd(), 'scripts/irins/__fixtures__', f), 'utf8');

describe('parseCitations', () => {
  it('extracts metrics from getgooglecitation JSON', () => {
    const c = parseCitations(fx('citations-625115.json'));
    expect(c.h_index).toBe(64);
    expect(c.i10).toBe(130);
    expect(c.total).toBeGreaterThan(10000);
    expect(c.h_index_2013).toBe(57);
  });

  it('returns empty object for malformed JSON', () => {
    expect(parseCitations('not json')).toEqual({});
  });
});

describe('parsePublications', () => {
  it('parses 10 publications from a page fragment', () => {
    const pubs = parsePublications(fx('publications-625115-page0.html'));
    expect(pubs.length).toBe(10);
    expect(pubs[0].title.length).toBeGreaterThan(10);
    expect(pubs.some((p) => /^\d{4}$/.test(p.year))).toBe(true);
  });

  it('returns [] for an empty page', () => {
    expect(parsePublications(fx('publications-empty.html'))).toEqual([]);
  });
});
