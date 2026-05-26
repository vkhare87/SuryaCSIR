# IRINS Sync Rework — Implementation Plan (Phase 1: Node runner)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync real IRINS scientist data into Supabase today via a browserless Node runner with a tested, reusable parser — and stop the existing destructive placeholder writer.

**Architecture:** A runtime-agnostic parser (jsdom) + fetcher (global `fetch`) turn three verified IRINS endpoints into a structured profile. A Node CLI runner loads scientific staff from Supabase, fetches+parses each, and upserts `irins_profiles` using the service-role key. The same `parser.ts`/`fetcher.ts` modules will later be imported by a Supabase Edge Function for in-app on-demand sync (Phase 2, deferred — see end).

**Tech Stack:** TypeScript, `jsdom` (already a dep), `@supabase/supabase-js` (already a dep), `tsx` (added), `vitest` (already a dep).

**Spec:** `docs/superpowers/specs/2026-05-26-irins-sync-rework-design.md`

**Verified endpoints (no auth, no cookies):**
- `GET  https://ampri.irins.org/profile/<expert_id>` — static sections.
- `POST https://ampri.irins.org/profile/get_publication` body `expert_id=<id>&current_page=<n>&sort_by=year&direction=desc` — HTML fragment, ~10 pubs/page, 0-indexed, stop when no `<h2>`.
- `POST https://ampri.irins.org/profile/getgooglecitation` body `expert_id=<id>` — JSON `{google_data:{all,all_2013,h_all,h_2013,hi10_all,hi10_2013}}`.

**Profile shape (MUST match `src/components/ScientistProfile.tsx` `IrinsData`):** top-level `name, designation, division, photo_url, academic_ids{orcid,scopus,researcher_id,google_scholar}, expertise[], citations{total,h_index,i10,total_2013,h_index_2013,i10_2013}, experience[], qualifications[], awards[], theses[], professional_bodies[], projects[], patents[], publications[], _meta`.

---

## File Structure

```
scripts/irins/
  types.ts            # IrinsProfile + sub-types (mirror ScientistProfile IrinsData)
  parser.ts           # PURE: parseCitations, parsePublications, parseProfilePage, assembleProfile
  fetcher.ts          # fetchProfileHtml, fetchAllPublications (paginated), fetchCitationsJson
  sync.ts             # CLI runner: staff -> fetch -> parse -> upsert irins_profiles + log
  parser.test.ts      # vitest unit tests against fixtures
  fetcher.test.ts     # vitest: pagination loop + URL/body building (injected fetch)
  __fixtures__/
    profile-625115.html
    profile-625235.html
    publications-625115-page0.html
    publications-empty.html
    citations-625115.json
```

Deleted: `scripts/irins-sync.ts`, `.github/workflows/irins-sync.yml`.
Modified: `package.json` (add `tsx` devDep + `sync:irins` script), `src/pages/IrinsSync.tsx` (remove destructive placeholder writer).

---

## Task 1: Save HTML/JSON fixtures

**Files:**
- Create: `scripts/irins/__fixtures__/profile-625115.html`, `profile-625235.html`, `publications-625115-page0.html`, `publications-empty.html`, `citations-625115.json`

- [ ] **Step 1: Create fixtures dir + fetch real responses**

Run:
```bash
mkdir -p scripts/irins/__fixtures__
cd scripts/irins/__fixtures__
curl -s -A "Mozilla/5.0" https://ampri.irins.org/profile/625115 -o profile-625115.html
curl -s -A "Mozilla/5.0" https://ampri.irins.org/profile/625235 -o profile-625235.html
curl -s -A "Mozilla/5.0" -X POST https://ampri.irins.org/profile/get_publication \
  --data "expert_id=625115&current_page=0&sort_by=year&direction=desc" -o publications-625115-page0.html
curl -s -A "Mozilla/5.0" -X POST https://ampri.irins.org/profile/get_publication \
  --data "expert_id=625115&current_page=500&sort_by=year&direction=desc" -o publications-empty.html
curl -s -A "Mozilla/5.0" -X POST https://ampri.irins.org/profile/getgooglecitation \
  --data "expert_id=625115" -o citations-625115.json
cd -
```

- [ ] **Step 2: Verify fixtures are non-trivial**

Run:
```bash
wc -c scripts/irins/__fixtures__/*
grep -c '<h2>' scripts/irins/__fixtures__/publications-625115-page0.html   # expect 10
grep -o 'h_all' scripts/irins/__fixtures__/citations-625115.json           # expect h_all
```
Expected: `profile-*.html` ~100-180 KB, `publications-625115-page0.html` ~40 KB with 10 `<h2>`, `publications-empty.html` has 0 `<h2>`, citations JSON contains `h_all`.

- [ ] **Step 3: Commit**

```bash
git add scripts/irins/__fixtures__
git commit -m "test: add IRINS response fixtures for parser tests"
```

---

## Task 2: Types

**Files:**
- Create: `scripts/irins/types.ts`

- [ ] **Step 1: Write the types (mirror ScientistProfile IrinsData)**

```typescript
// scripts/irins/types.ts
export interface IrinsCitations {
  total?: number;
  h_index?: number;
  i10?: number;
  total_2013?: number;
  h_index_2013?: number;
  i10_2013?: number;
}

export interface IrinsExperience { period: string; role: string; division: string }
export interface IrinsQualification { year: string; degree: string; institution: string }
export interface IrinsAward { year: string; title: string; awarding_body: string }
export interface IrinsThesis { title: string; scholar: string; year: string; status: string }
export interface IrinsPatent { title: string; inventors: string[]; number: string; status: string; filing_date: string }
export interface IrinsPublication { title: string; authors: string[]; journal: string; year: string; doi: string; type: string }
export interface IrinsProject { title: string; funding_agency: string; status: string; role: string; budget: string; duration: string }

export interface IrinsProfile {
  name: string;
  designation: string;
  division: string;
  photo_url: string;
  academic_ids: { orcid: string; scopus: string; researcher_id: string; google_scholar: string };
  expertise: string[];
  citations: IrinsCitations;
  experience: IrinsExperience[];
  qualifications: IrinsQualification[];
  awards: IrinsAward[];
  theses: IrinsThesis[];
  professional_bodies: string[];
  projects: IrinsProject[];
  patents: IrinsPatent[];
  publications: IrinsPublication[];
  _meta: { parse_version: number; status: 'ok' | 'fetch_failed' | 'parse_empty'; synced_at: string };
}

export const PARSE_VERSION = 1;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors from `scripts/irins/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add scripts/irins/types.ts
git commit -m "feat: add IRINS profile types"
```

---

## Task 3: Citation parser (easiest, clearest assertion)

**Files:**
- Create: `scripts/irins/parser.ts` (start), `scripts/irins/parser.test.ts` (start)

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/irins/parser.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCitations } from './parser';

const fx = (f: string) => readFileSync(join(__dirname, '__fixtures__', f), 'utf8');

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/irins/parser.test.ts`
Expected: FAIL — `parseCitations` not exported.

- [ ] **Step 3: Implement parseCitations**

```typescript
// scripts/irins/parser.ts
import { JSDOM } from 'jsdom';
import type { IrinsCitations, IrinsProfile } from './types';
import { PARSE_VERSION } from './types';

const toInt = (v: unknown): number | undefined => {
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
};

export function parseCitations(json: string): IrinsCitations {
  try {
    const g = JSON.parse(json)?.google_data;
    if (!g) return {};
    return {
      total: toInt(g.all),
      total_2013: toInt(g.all_2013),
      h_index: toInt(g.h_all),
      h_index_2013: toInt(g.h_2013),
      i10: toInt(g.hi10_all),
      i10_2013: toInt(g.hi10_2013),
    };
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/irins/parser.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add scripts/irins/parser.ts scripts/irins/parser.test.ts
git commit -m "feat: parse IRINS citation metrics"
```

---

## Task 4: Publications fragment parser

**Files:**
- Modify: `scripts/irins/parser.ts`, `scripts/irins/parser.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// add to scripts/irins/parser.test.ts
import { parsePublications } from './parser';

describe('parsePublications', () => {
  it('parses 10 publications from a page fragment', () => {
    const pubs = parsePublications(fx('publications-625115-page0.html'));
    expect(pubs.length).toBe(10);
    expect(pubs[0].title.length).toBeGreaterThan(10);
    // at least one publication has a 4-digit year
    expect(pubs.some(p => /^\d{4}$/.test(p.year))).toBe(true);
  });

  it('returns [] for an empty page', () => {
    expect(parsePublications(fx('publications-empty.html'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/irins/parser.test.ts`
Expected: FAIL — `parsePublications` not exported.

- [ ] **Step 3: Implement parsePublications**

Each publication block is an `#other-view` div containing an `<h2>` title, a `.author` paragraph, and free text with journal/year/DOI. Anchor on `<h2>`.

```typescript
// add to scripts/irins/parser.ts
import type { IrinsPublication } from './types';

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export function parsePublications(fragmentHtml: string): IrinsPublication[] {
  const doc = new JSDOM(fragmentHtml).window.document;
  const out: IrinsPublication[] = [];
  doc.querySelectorAll('h2').forEach((h2) => {
    const title = clean(h2.textContent);
    if (!title) return;
    const block = h2.closest('#other-view, .funny-boxes, .row') ?? h2.parentElement;
    const blockText = clean(block?.textContent);
    const authorsRaw = clean(block?.querySelector('.author')?.textContent);
    const authors = authorsRaw ? authorsRaw.split(/[;,]/).map(clean).filter(Boolean) : [];
    const year = blockText.match(/\b(19|20)\d{2}\b/)?.[0] ?? '';
    const doi = blockText.match(/10\.\d{4,}\/[^\s"'<>]+/)?.[0] ?? '';
    const type = blockText.match(/Journal Article|Book Chapter|Conference|Review|Letter|Editorial/i)?.[0] ?? '';
    const journal = clean(block?.querySelector('.journal, em, i')?.textContent);
    out.push({ title, authors, journal, year, doi, type });
  });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/irins/parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/irins/parser.ts scripts/irins/parser.test.ts
git commit -m "feat: parse IRINS publication fragments"
```

---

## Task 5: Profile page parser (static sections)

**Files:**
- Modify: `scripts/irins/parser.ts`, `scripts/irins/parser.test.ts`

Container anchors verified live: academic IDs `#i_orcid_id #i_scopus_id #i_isi_id #i_google_sid`; awards `#list-awards` (one child per award); projects `#list-rp`; patents `#list-pt`; experience `#list_panel_experience`; qualifications `#list_panel_qualification`; expertise `#e_expertise`/`#list_expert`. Item classes vary between profiles, so read **children generically** and best-effort-split fields.

- [ ] **Step 1: Write the failing test**

```typescript
// add to scripts/irins/parser.test.ts
import { parseProfilePage } from './parser';

describe('parseProfilePage', () => {
  it('parses identity + IDs + sections from 625115', () => {
    const p = parseProfilePage(fx('profile-625115.html'));
    expect(p.name?.toLowerCase()).toContain('karthikeyan');
    expect(p.academic_ids?.orcid).toMatch(/\d{4}-\d{4}/);
    expect((p.awards ?? []).length).toBeGreaterThanOrEqual(5);
    expect((p.projects ?? []).length).toBeGreaterThanOrEqual(5);
    expect((p.patents ?? []).length).toBeGreaterThanOrEqual(3);
    expect((p.qualifications ?? []).length).toBeGreaterThanOrEqual(3);
    // leading-year split on awards
    expect((p.awards ?? []).some(a => /^\d{4}$/.test(a.year))).toBe(true);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/irins/parser.test.ts`
Expected: FAIL — `parseProfilePage` not exported.

- [ ] **Step 3: Implement parseProfilePage**

```typescript
// add to scripts/irins/parser.ts
import type {
  IrinsExperience, IrinsQualification, IrinsAward, IrinsPatent, IrinsProject,
} from './types';

type ProfilePagePart = Pick<IrinsProfile,
  'name' | 'designation' | 'division' | 'photo_url' | 'academic_ids' |
  'expertise' | 'experience' | 'qualifications' | 'awards' | 'patents' |
  'projects' | 'professional_bodies'>;

const idVal = (doc: Document, id: string) => clean(doc.getElementById(id)?.textContent);
const childTexts = (doc: Document, id: string): string[] => {
  const el = doc.getElementById(id);
  if (!el) return [];
  return Array.from(el.children).map((c) => clean(c.textContent)).filter(Boolean);
};
const leadingYear = (s: string) => s.match(/^\s*((?:19|20)\d{2})/)?.[1] ?? '';

export function parseProfilePage(html: string): ProfilePagePart {
  const doc = new JSDOM(html).window.document;

  // Identity: name is the profile heading near the photo; fall back to first h3/h1.
  const name =
    clean(doc.querySelector('.profile-name, .faculty-name, #identity-view h3, #identity-view h1')?.textContent) ||
    clean(doc.querySelector('h3, h1')?.textContent);
  const designation = clean(doc.querySelector('.designation, .profile-designation, #identity-view p')?.textContent);
  const division = clean(doc.querySelector('.department, .profile-department')?.textContent);
  const photo_url = (doc.querySelector('img[src*="profile_images"]') as HTMLImageElement | null)?.src ?? '';

  const academic_ids = {
    orcid: idVal(doc, 'i_orcid_id'),
    scopus: idVal(doc, 'i_scopus_id'),
    researcher_id: idVal(doc, 'i_isi_id'),
    google_scholar: idVal(doc, 'i_google_sid'),
  };

  const expertise = (idVal(doc, 'e_expertise') || idVal(doc, 'list_expert'))
    .split(/[,;]/).map(clean).filter(Boolean);

  const awards: IrinsAward[] = childTexts(doc, 'list-awards').map((t) => ({
    year: leadingYear(t),
    title: clean(t.replace(/^\s*(?:19|20)\d{2}\s*/, '')),
    awarding_body: '',
  }));

  const projects: IrinsProject[] = childTexts(doc, 'list-rp').map((t) => ({
    title: clean(t.split(/Funding Agency\s*:/i)[0]),
    funding_agency: clean(t.match(/Funding Agency\s*:\s*([^]*?)(?:Ongoing|Completed|Principal Investigator|Co-Principal|\d{4}\s*-\s*\d{4}|$)/i)?.[1]),
    status: t.match(/Ongoing|Completed|Current/i)?.[0] ?? '',
    role: t.match(/Principal Investigator|Co-Principal Investigator|Co-Investigator/i)?.[0] ?? '',
    budget: t.match(/\b(\d{6,})\b/)?.[1] ?? '',
    duration: t.match(/\b(?:19|20)\d{2}\s*-\s*(?:Present|\d{4})\b/)?.[0] ?? '',
  }));

  const patents: IrinsPatent[] = childTexts(doc, 'list-pt').map((t) => ({
    title: clean(t.split(/Patent No\.?/i)[0].split(/\.\s/)[0]),
    inventors: [],
    number: clean(t.match(/Patent No\.?\s*([^]*?)(?:Engineering|Granted|Filed|$)/i)?.[1]).replace(/\s+/g, ' '),
    status: t.match(/Granted|Filed|Pending|Published/i)?.[0] ?? '',
    filing_date: t.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '',
  }));

  // Experience / qualification: timeline rows. Split the container text into year-led entries.
  const splitTimeline = (id: string): string[] => {
    const txt = clean(doc.getElementById(id)?.textContent);
    if (!txt) return [];
    // split before each "YYYY - YYYY" or "YYYY - Present" or leading "YYYY "
    return txt.split(/(?=(?:19|20)\d{2}\s*-\s*(?:Present|\d{4}))/).map(clean).filter(Boolean);
  };

  const experience: IrinsExperience[] = splitTimeline('list_panel_experience').map((t) => {
    const period = t.match(/(?:19|20)\d{2}\s*-\s*(?:Present|\d{4})/)?.[0] ?? '';
    const rest = clean(t.replace(period, ''));
    return { period, role: rest.split(/  +| /)[0] || rest, division: '' };
  });

  const qualifications: IrinsQualification[] = clean(doc.getElementById('list_panel_qualification')?.textContent)
    .split(/(?=(?:19|20)\d{2}\s)/).map(clean).filter(Boolean).map((t) => {
      const year = leadingYear(t);
      const rest = clean(t.replace(/^\s*(?:19|20)\d{2}\s*/, ''));
      const degree = rest.split(/\s/)[0] ?? '';
      return { year, degree, institution: clean(rest.slice(degree.length)) };
    });

  const professional_bodies = childTexts(doc, 'list_org');

  return {
    name, designation, division, photo_url, academic_ids, expertise,
    experience, qualifications, awards, patents, projects, professional_bodies,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/irins/parser.test.ts`
Expected: PASS. If a count assertion is off, adjust the selector/split (not the threshold) until real fixture data parses.

- [ ] **Step 5: Commit**

```bash
git add scripts/irins/parser.ts scripts/irins/parser.test.ts
git commit -m "feat: parse IRINS profile page static sections"
```

---

## Task 6: assembleProfile

**Files:**
- Modify: `scripts/irins/parser.ts`, `scripts/irins/parser.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// add to scripts/irins/parser.test.ts
import { assembleProfile } from './parser';

describe('assembleProfile', () => {
  it('merges page + publications + citations into IrinsProfile', () => {
    const p = assembleProfile(
      fx('profile-625115.html'),
      [fx('publications-625115-page0.html')],
      fx('citations-625115.json'),
    );
    expect(p.name?.toLowerCase()).toContain('karthikeyan');
    expect(p.publications.length).toBe(10);
    expect(p.citations.h_index).toBe(64);
    expect(p._meta.status).toBe('ok');
    expect(p._meta.parse_version).toBe(1);
  });

  it('flags parse_empty when name missing', () => {
    const p = assembleProfile('<html></html>', [], '{}');
    expect(p._meta.status).toBe('parse_empty');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/irins/parser.test.ts`
Expected: FAIL — `assembleProfile` not exported.

- [ ] **Step 3: Implement assembleProfile**

```typescript
// add to scripts/irins/parser.ts
export function assembleProfile(
  pageHtml: string,
  publicationPagesHtml: string[],
  citationsJson: string,
): IrinsProfile {
  const page = parseProfilePage(pageHtml);
  const publications = publicationPagesHtml.flatMap(parsePublications);
  const citations = parseCitations(citationsJson);
  const status: IrinsProfile['_meta']['status'] = page.name ? 'ok' : 'parse_empty';

  return {
    name: page.name ?? '',
    designation: page.designation ?? '',
    division: page.division ?? '',
    photo_url: page.photo_url ?? '',
    academic_ids: page.academic_ids ?? { orcid: '', scopus: '', researcher_id: '', google_scholar: '' },
    expertise: page.expertise ?? [],
    citations,
    experience: page.experience ?? [],
    qualifications: page.qualifications ?? [],
    awards: page.awards ?? [],
    theses: [],
    professional_bodies: page.professional_bodies ?? [],
    projects: page.projects ?? [],
    patents: page.patents ?? [],
    publications,
    _meta: { parse_version: PARSE_VERSION, status, synced_at: new Date().toISOString() },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/irins/parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/irins/parser.ts scripts/irins/parser.test.ts
git commit -m "feat: assemble full IRINS profile from sources"
```

---

## Task 7: Fetcher with pagination

**Files:**
- Create: `scripts/irins/fetcher.ts`, `scripts/irins/fetcher.test.ts`

- [ ] **Step 1: Write the failing test (inject a fake fetch — no network)**

```typescript
// scripts/irins/fetcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fetchAllPublications } from './fetcher';

describe('fetchAllPublications', () => {
  it('loops pages until an empty page, respects cap', async () => {
    const pages = ['<h2>A</h2>', '<h2>B</h2>', '']; // page 2 is empty -> stop
    const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = String(init?.body ?? '');
      const page = Number(new URLSearchParams(body).get('current_page'));
      return { ok: true, text: async () => pages[page] ?? '' } as Response;
    });
    const out = await fetchAllPublications('625115', { fetchImpl: fakeFetch, maxPages: 100 });
    expect(out.length).toBe(2);                 // two non-empty pages collected
    expect(fakeFetch).toHaveBeenCalledTimes(3);  // stopped after the empty page
  });

  it('stops at maxPages cap', async () => {
    const fakeFetch = vi.fn(async () => ({ ok: true, text: async () => '<h2>x</h2>' } as Response));
    const out = await fetchAllPublications('1', { fetchImpl: fakeFetch, maxPages: 5 });
    expect(out.length).toBe(5);
    expect(fakeFetch).toHaveBeenCalledTimes(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/irins/fetcher.test.ts`
Expected: FAIL — `fetchAllPublications` not exported.

- [ ] **Step 3: Implement fetcher**

```typescript
// scripts/irins/fetcher.ts
const BASE = 'https://ampri.irins.org';
const UA = 'Mozilla/5.0 (compatible; SURYA-IRINS-Sync/1.0)';

type FetchImpl = typeof fetch;
interface Opts { fetchImpl?: FetchImpl; maxPages?: number; delayMs?: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchProfileHtml(expertId: string, fetchImpl: FetchImpl = fetch): Promise<string> {
  const res = await fetchImpl(`${BASE}/profile/${expertId}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`profile ${expertId}: HTTP ${res.status}`);
  return res.text();
}

export async function fetchCitationsJson(expertId: string, fetchImpl: FetchImpl = fetch): Promise<string> {
  try {
    const res = await fetchImpl(`${BASE}/profile/getgooglecitation`, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ expert_id: expertId }).toString(),
    });
    return res.ok ? res.text() : '{}';
  } catch {
    return '{}';
  }
}

export async function fetchAllPublications(expertId: string, opts: Opts = {}): Promise<string[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxPages = opts.maxPages ?? 100;
  const delayMs = opts.delayMs ?? 0;
  const pages: string[] = [];
  for (let page = 0; page < maxPages; page++) {
    const res = await fetchImpl(`${BASE}/profile/get_publication`, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        expert_id: expertId, current_page: String(page), sort_by: 'year', direction: 'desc',
      }).toString(),
    });
    const html = res.ok ? await res.text() : '';
    if (!html.includes('<h2>')) break;   // empty page -> done
    pages.push(html);
    if (delayMs) await sleep(delayMs);
  }
  return pages;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/irins/fetcher.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add scripts/irins/fetcher.ts scripts/irins/fetcher.test.ts
git commit -m "feat: add IRINS fetcher with paginated publications"
```

---

## Task 8: CLI sync runner

**Files:**
- Create: `scripts/irins/sync.ts`
- Modify: `package.json` (add `tsx` devDep + `sync:irins` script)

- [ ] **Step 1: Add tsx + npm script**

Run:
```bash
npm install -D tsx
```
Then edit `package.json` `"scripts"` to add:
```json
"sync:irins": "tsx scripts/irins/sync.ts"
```

- [ ] **Step 2: Write the runner**

```typescript
// scripts/irins/sync.ts
import { createClient } from '@supabase/supabase-js';
import { fetchProfileHtml, fetchAllPublications, fetchCitationsJson } from './fetcher';
import { assembleProfile } from './parser';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY'); process.exit(1); }

const supabase = createClient(url, key);
const onlyVidwan = process.argv.find((a) => a.startsWith('--vidwan='))?.split('=')[1];

async function main() {
  const { data: staff, error } = await supabase
    .from('staff')
    .select('"ID","StaffName","VidwanID"')
    .eq('Group', 'Scientific')
    .neq('VidwanID', '')
    .not('VidwanID', 'is', null)
    .order('StaffName');
  if (error) { console.error('staff load failed:', error.message); process.exit(1); }

  let list = staff ?? [];
  if (onlyVidwan) {
    const ids = onlyVidwan.split(',').map((s) => s.trim());
    list = list.filter((s) => ids.includes(s.VidwanID));
  }
  console.log(`Syncing ${list.length} scientist(s)`);

  const { data: log } = await supabase
    .from('irins_sync_log')
    .insert({ triggered_by: 'manual', total_scientists: list.length })
    .select('id').single();

  let succeeded = 0, failed = 0;
  const errors: Array<{ vidwan: string; name: string; error: string }> = [];

  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const id = s.VidwanID;
    process.stdout.write(`[${i + 1}/${list.length}] ${s.StaffName} (${id}) ... `);
    try {
      const pageHtml = await fetchProfileHtml(id);
      const pubPages = await fetchAllPublications(id, { delayMs: 200 });
      const citationsJson = await fetchCitationsJson(id);
      const profile = assembleProfile(pageHtml, pubPages, citationsJson);

      if (profile._meta.status === 'parse_empty') {
        // Never overwrite good data with an empty parse.
        console.log('parse_empty (skipped upsert)');
        failed++; errors.push({ vidwan: id, name: s.StaffName, error: 'parse_empty' });
        continue;
      }

      const { error: upErr } = await supabase.from('irins_profiles').upsert({
        vidwan_id: id,
        profile_data: profile,
        synced_at: profile._meta.synced_at,
      });
      if (upErr) throw new Error(upErr.message);
      console.log(`ok (${profile.publications.length} pubs, h-index ${profile.citations.h_index ?? '-'})`);
      succeeded++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`FAIL ${msg}`);
      failed++; errors.push({ vidwan: id, name: s.StaffName, error: msg });
    }
  }

  if (log?.id) {
    await supabase.from('irins_sync_log').update({
      status: failed === 0 ? 'success' : succeeded > 0 ? 'partial' : 'failed',
      completed_at: new Date().toISOString(),
      succeeded, failed,
      error_details: errors.length ? errors : null,
    }).eq('id', log.id);
  }
  console.log(`\nDone: ${succeeded} ok, ${failed} failed`);
  if (failed > 0 && succeeded === 0) process.exit(1);
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/irins/sync.ts package.json package-lock.json
git commit -m "feat: add IRINS CLI sync runner"
```

---

## Task 9: Remove dead path

**Files:**
- Delete: `scripts/irins-sync.ts`, `.github/workflows/irins-sync.yml`

- [ ] **Step 1: Delete and verify nothing imports them**

Run:
```bash
git rm scripts/irins-sync.ts .github/workflows/irins-sync.yml
grep -rn "scripts/irins-sync" . --include=*.ts --include=*.tsx --include=*.json --include=*.yml || echo "no refs"
grep -n "playwright" package.json || echo "playwright not in deps (nothing to remove)"
```
Expected: no references; playwright absent from package.json.

- [ ] **Step 2: Commit**

```bash
git commit -m "chore: remove broken Playwright/GitHub IRINS sync path"
```

---

## Task 10: Stop the destructive in-app placeholder writer

`IrinsSync.tsx` `triggerSync` currently upserts `{ status: 'pending_full_sync' }`, overwriting real data. Phase 1 has no in-app sync (that is Phase 2's Edge Function). Make the button safe: refresh data + show that sync runs via the CLI. Keep the profiles/log display intact.

**Files:**
- Modify: `src/pages/IrinsSync.tsx`

- [ ] **Step 1: Replace the body of `triggerSync` (remove the upsert loop)**

Replace the entire `triggerSync` function (lines ~70-115) with:

```typescript
  // Phase 1: sync runs server-side via `npm run sync:irins`.
  // This button only refreshes the view. Phase 2 wires an Edge Function here.
  const triggerSync = async () => {
    setSyncing(true);
    try {
      await loadData();
    } finally {
      setSyncing(false);
    }
  };
```

- [ ] **Step 2: Update the helper text near the Sync button**

Change the caption next to the Sync button (currently mentions "GitHub Action" / "creates placeholder records") to:

```tsx
          <span className="text-xs text-text-muted">
            Data is fetched server-side. Run <code className="font-mono">npm run sync:irins</code> to refresh profiles.
          </span>
```

Also relabel the button text from `Sync All` / `Syncing...` to `Refresh` / `Refreshing...`.

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/pages/IrinsSync.tsx`
Expected: no errors. Remove any now-unused imports flagged by `noUnusedLocals` (e.g. an unused icon).

- [ ] **Step 4: Commit**

```bash
git add src/pages/IrinsSync.tsx
git commit -m "fix: stop destructive placeholder writes in IRINS sync page"
```

---

## Task 11: Run a real sync (the "try to sync" step)

**Prereq:** `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (service-role) available; `irins_profiles` + `irins_sync_log` tables exist in the live project.

- [ ] **Step 1: Smoke test against two known profiles**

Run (PowerShell — set env for the command):
```powershell
$env:SUPABASE_URL="https://<ref>.supabase.co"; $env:SUPABASE_SERVICE_KEY="<service-role-key>"; npm run sync:irins -- --vidwan=625115,625235
```
Expected output: two lines ending `ok (... pubs, h-index ...)`, then `Done: 2 ok, 0 failed`.

- [ ] **Step 2: Verify in Supabase**

In Supabase SQL Editor:
```sql
select vidwan_id, profile_data->>'name' as name,
       jsonb_array_length(profile_data->'publications') as pubs,
       profile_data->'citations'->>'h_index' as h_index
from irins_profiles where vidwan_id in ('625115','625235');
```
Expected: two rows with real names, non-zero pubs, h-index.

- [ ] **Step 3: Verify in the app**

`npm run dev`, log in as SystemAdmin, open `/irins-sync`, confirm the two scientists show synced counts; open a scientist whose profile uses `ScientistProfile` and confirm publications/patents/awards render.

- [ ] **Step 4: Full run (all scientists)**

```powershell
$env:SUPABASE_URL="..."; $env:SUPABASE_SERVICE_KEY="..."; npm run sync:irins
```
Expected: per-scientist progress; `Done: N ok, M failed`. Investigate any `parse_empty`/`FAIL` rows (likely a profile with an unusual template — note the vidwan id for parser refinement).

---

## Phase 2 (deferred — separate plan)

Documented in the spec; NOT built in this plan:
- New migration: `irins_profiles` columns (`raw_html`, `raw_pub_html`, `parse_version`, `last_status`, `last_error`) + `irins_sync_queue` table.
- Supabase Edge Function `supabase/functions/irins-sync/` importing the same `parser.ts`/`fetcher.ts`, with JWT role gate + chunked queue processing.
- Rewire `IrinsSync.tsx` `triggerSync` to `supabase.functions.invoke('irins-sync', ...)` + batch progress.
- Requires installing Supabase CLI; deploy with `supabase functions deploy irins-sync` and set `SUPABASE_SERVICE_ROLE_KEY` secret.

---

## Self-Review

- **Spec coverage:** browserless fetch (Task 7), 3 endpoints (Tasks 3/4/7), container-anchored resilient parser + section-optional (Task 5), never-overwrite-on-empty (Tasks 6/8), full rich profile (Tasks 5/6), full pubs + 100-page cap (Task 7), citations included (Task 3), remove GitHub path (Task 9), stop destructive writer (Task 10), real sync (Task 11). Edge Function / queue / migration / in-app on-demand + RLS are explicitly Phase 2.
- **Profile shape** matches `ScientistProfile.tsx` `IrinsData` (top-level name/designation/division, `citations.h_index`, etc.).
- **Type consistency:** `assembleProfile(pageHtml, publicationPagesHtml[], citationsJson)`, `fetchAllPublications(expertId, opts)`, `parseProfilePage/parsePublications/parseCitations` names consistent across tasks.
