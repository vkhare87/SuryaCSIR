import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCitations, parsePublications, parseProfilePage } from './parser';

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

describe('parseProfilePage', () => {
  it('parses identity + IDs + sections from 625115', () => {
    const p = parseProfilePage(fx('profile-625115.html'));
    expect(p.name?.toLowerCase()).toContain('karthikeyan');
    expect(p.academic_ids?.orcid).toMatch(/\d{4}-\d{4}/);
    expect((p.awards ?? []).length).toBeGreaterThanOrEqual(5);
    expect((p.projects ?? []).length).toBeGreaterThanOrEqual(5);
    expect((p.patents ?? []).length).toBeGreaterThanOrEqual(3);
    expect((p.qualifications ?? []).length).toBeGreaterThanOrEqual(3);
    expect((p.awards ?? []).some((a) => /^\d{4}$/.test(a.year))).toBe(true);
  });

  it('parses identity from 625235 (different template)', () => {
    const p = parseProfilePage(fx('profile-625235.html'));
    expect(p.name?.toLowerCase()).toContain('sarika');
    expect((p.awards ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('missing-name page yields empty name (caller treats as parse_empty)', () => {
    const p = parseProfilePage('<html><body><div>nothing</div></body></html>');
    expect(p.name ?? '').toBe('');
  });
});
