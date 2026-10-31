import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ponytail: regex scan of source, not an AST. Catches literal and template
// paths ('/x', `/x/${id}`); links built by string concatenation slip through.
const SRC = join(__dirname);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

const routes = [...readFileSync(join(SRC, 'App.tsx'), 'utf8').matchAll(/<Route path="([^"]+)"/g)]
  .map(m => m[1])
  .filter(p => p !== '*')
  .map(p => new RegExp('^' + p.replace(/:[^/]+/g, '[^/]+') + '$'));

const LINK_RE = /['"`](\/[a-z][a-z0-9/_:?=&${}.-]*)['"`]/g;
// Path fragments used in startsWith/endsWith checks, not link targets.
const NOT_LINKS = new Set(['/admin/', '/meetings', '/actions']);

describe('in-app links', () => {
  it('every hardcoded link targets a registered route', () => {
    const dead: string[] = [];
    for (const file of walk(SRC)) {
      for (const m of readFileSync(file, 'utf8').matchAll(LINK_RE)) {
        if (NOT_LINKS.has(m[1])) continue;
        // `${id}` after a slash is a path segment; glued to a word (`/staff${search}`) it's a query suffix.
        const path = m[1].split(/[?#]/)[0].replace(/([^/])\$\{[^}]+\}/g, '$1').replace(/\$\{[^}]+\}/g, 'x');
        if (!routes.some(r => r.test(path))) dead.push(`${file.slice(SRC.length + 1)}: ${m[1]}`);
      }
    }
    expect(dead).toEqual([]);
  });
});
