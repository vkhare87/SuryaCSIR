// @vitest-environment node
// SEC-17: no third-party font CDN (IP/referrer leak, breaks on the air-gapped
// LAN, and CSP font-src is 'self'). Fonts are bundled from @fontsource.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf-8');
const css = readFileSync(join(__dirname, 'index.css'), 'utf-8');

describe('index.html (SEC-17)', () => {
  it('loads nothing from Google Fonts', () => {
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it('has the product title', () => {
    expect(html).toContain('<title>SURYA — CSIR-AMPRI</title>');
  });

  it('the serif token names the self-hosted variable Fraunces first', () => {
    expect(css).toMatch(/--font-serif:\s*'Fraunces Variable'/);
  });
});
