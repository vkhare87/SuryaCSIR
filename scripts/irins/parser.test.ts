import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCitations } from './parser';

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
