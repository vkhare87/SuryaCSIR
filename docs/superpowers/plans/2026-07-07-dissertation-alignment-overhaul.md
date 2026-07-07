# Dissertation Alignment Overhaul (T7–T12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap between SURYA and the dissertation commitments (Outline + Mid-sem reports): clickable source citations, duplication detection, proposal comparables, measurable eval harness, latency instrumentation, classification visibility, and the commercialisation / convergence / collaboration analytics use cases. **Part B (Tasks 13–20)** extends the institutional data model per supervisor-requested domains: MOUs, technology transfers, patent pipeline, PhD scholar milestone tracking, recruitment drive progress (permanent + project staff), and end-to-end R&D lifecycle monitoring (proposal conceptualisation → project execution → reporting).

**Architecture:** All RAG work rides the existing `rag/` PageIndex stack (Citation dataclass → `/query` shape → SPA `client.ts`). New use-case analytics are pure client-side `useMemo` helpers in `src/lib/intelligence/` consumed by existing pages — no new services. One new HTTP endpoint (`/similar`) reuses the traversal pick. Part B entities follow the established DataContext dance: migration (RLS mirroring `vacancy_tables`) → type → mapper → DataContext load; writes go through small `src/lib/<domain>/` helpers (never from pages directly), mirroring `registry.ts`.

**Tech Stack:** React 19 + TS 5.9 strict, Tailwind 4 semantic tokens, Supabase (RLS mandatory), FastAPI-free `query_service.py` + thin `api.py` shell, pytest (`rag/tests/`), vitest (`*.test.ts`).

## Global Constraints

- `import type { ... }` for type-only imports (`verbatimModuleSyntax`).
- No `any` outside `dataMapper.ts` / `dataMigration.ts`.
- Pages consume data via `useData()` only — never Supabase directly from a page.
- All derived data in pages wrapped in `useMemo`.
- Semantic Tailwind tokens only (`bg-surface`, `text-text-muted`, `border-border`) — never raw colors.
- New migrations: `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`; never edit shipped ones; RLS on every new table (this plan only alters `query_log` — existing RLS carries over for added columns).
- rag Python: logic in fastapi-free modules (`query_service.py`, `retrieval.py`), `api.py` stays a thin shell (WDAC constraint).
- Grounding invariant must survive: non-refusal answers always carry citations.
- Commit style: `feat:` / `test:` / `fix:` prefixes, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Health gate per task: `npx tsc --noEmit && npx eslint src/` for SPA tasks; `python -m pytest rag/tests -q` for rag tasks (native-parse tests may be red on this laptop — pre-existing, see memory `env-python-native-blockers`; scope pytest to touched test files).

**Dissertation traceability:** Task 1–2 → source traceability ≥95%; Task 3–4 → duplication detection ≥70%; Task 5 → proposal-evaluation turnaround; Task 6–7 → retrieval accuracy ≥80% + baselines; Task 8 → data classification (governance layer); Task 9 → commercialisation analytics; Task 10 → convergence detection; Task 11 → expertise/collaboration mapping; Task 12 → validation on real CSIR documents (supervisor remark). **Part B:** Task 13/15 → MOU registry (partnership data category); Task 14/15/16 → technology-transfer records feeding commercialisation analytics (income side of the "public R&D balance sheet", Mid-sem §3.4); Task 17 → patent filed→granted pipeline; Task 18 → PhD scholar progress from joining (human-capital tracking); Task 19 → recruitment drive funnel, permanent + project staff; Task 20 → R&D project monitoring from conceptualisation (proposal → sanction → execution → reports).

---

### Task 1: Citation deep-links — rag side (`storage_path` through Citation)

**Files:**
- Modify: `rag/answer.py`
- Modify: `rag/retrieval.py`
- Modify: `rag/query_service.py` (`read_docs`)
- Test: `rag/tests/test_retrieval.py`, `rag/tests/test_query_service.py`

**Interfaces:**
- Consumes: existing `Citation` dataclass, `read_docs(client)`, `traverse(docs, question, llm)`.
- Produces: `Citation` gains `storage_path: str = ""`; docs dicts from `read_docs` gain key `storage_path`; `retrieval.flatten(docs)` (renamed from `_flatten`, public) returns `[(doc_id, doc_title, storage_path, node)]`. Task 3 consumes `flatten`.

- [ ] **Step 1: Write the failing test**

Append to `rag/tests/test_retrieval.py`:

```python
def test_citation_carries_storage_path():
    from llm import FakeLLM
    docs = [{"id": "d1", "title": "Annual Report", "storage_path": "reports/d1/annual.pdf",
             "tree": {"root": {"nodes": [{"title": "Outcomes", "summary": "Great outcomes.",
                                          "page_start": 3, "page_end": 5}]}}}]
    ans = traverse(docs, "What outcomes?", FakeLLM())
    assert ans.citations[0].storage_path == "reports/d1/annual.pdf"


def test_citation_storage_path_defaults_empty():
    from llm import FakeLLM
    docs = [{"id": "d1", "title": "Annual Report",
             "tree": {"root": {"nodes": [{"title": "Outcomes", "summary": "Great outcomes.",
                                          "page_start": 3, "page_end": 5}]}}}]
    ans = traverse(docs, "What outcomes?", FakeLLM())
    assert ans.citations[0].storage_path == ""
```

(Match the existing import style at the top of that test file; `traverse` is already imported there.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest rag/tests/test_retrieval.py -q`
Expected: FAIL — `TypeError: Citation.__init__() got an unexpected keyword argument 'storage_path'` or `AttributeError: storage_path`.

- [ ] **Step 3: Implement**

`rag/answer.py` — add field with default (keeps every existing constructor call valid):

```python
@dataclass
class Citation:
    document_id: str
    title: str
    node_title: str
    page_start: int
    page_end: int
    storage_path: str = ""
```

`rag/retrieval.py` — rename `_flatten` → `flatten` (public; Task 3 uses it), carry storage_path:

```python
def flatten(docs):
    """docs: [{'id','title','storage_path','tree'}] -> [(doc_id, doc_title, storage_path, node)]."""
    candidates = []
    for d in docs:
        root = (d.get("tree") or {}).get("root") or {}
        for node in root.get("nodes", []):
            candidates.append((d["id"], d["title"], d.get("storage_path", ""), node))
    return candidates
```

In `traverse`, update unpacking sites:

```python
    candidates = flatten(docs)
    ...
    titles = [f"{title} — {node['title']}" for _, title, _, node in candidates]
    ...
    context = "\n".join(candidates[i][3].get("summary", "") for i in picks)
    ...
    for i in picks:
        doc_id, doc_title, storage_path, node = candidates[i]
        citations.append(Citation(
            document_id=doc_id, title=doc_title, node_title=node["title"],
            page_start=node["page_start"], page_end=node["page_end"],
            storage_path=storage_path,
        ))
```

`rag/query_service.py` — `read_docs` selects and forwards storage_path:

```python
def read_docs(client):
    """RLS-scoped doc_indexes rows -> [{'id','title','storage_path','tree'}] for traversal."""
    rows = (client.table("doc_indexes")
            .select("document_id, tree, documents(id, title, storage_path)")
            .limit(50).execute().data) or []
    docs = []
    for r in rows:
        doc = r.get("documents") or {}
        if isinstance(doc, list):  # PostgREST may return the join as a 1-element list
            doc = doc[0] if doc else {}
        docs.append({"id": doc.get("id", r["document_id"]),
                     "title": doc.get("title", "Document"),
                     "storage_path": doc.get("storage_path", ""),
                     "tree": r["tree"]})
    return docs
```

- [ ] **Step 4: Run the rag test suite for touched modules**

Run: `python -m pytest rag/tests/test_retrieval.py rag/tests/test_query_service.py rag/tests/test_answer.py rag/tests/test_eval.py -q`
Expected: PASS (if any existing test asserts exact `read_docs` select string or unpacks 3-tuples from `_flatten`, update it to the new shapes above).

- [ ] **Step 5: Commit**

```bash
git add rag/answer.py rag/retrieval.py rag/query_service.py rag/tests/
git commit -m "feat(rag): thread storage_path through citations for deep-links"
```

---

### Task 2: Citation deep-links — SPA side (clickable sources)

**Files:**
- Modify: `src/lib/ask/client.ts`
- Create: `src/lib/ask/citations.ts`
- Modify: `src/pages/AskSurya.tsx:93-105` (Sources block)
- Test: `src/lib/ask/citations.test.ts`

**Interfaces:**
- Consumes: `AskCitation` from `client.ts`; `getDocumentUrl(storagePath)` from `src/lib/documents/registry.ts` (returns `Promise<string | null>`, 60s signed URL).
- Produces: `AskCitation` gains `storage_path: string`; `openCitation(c: AskCitation): Promise<string | null>` returns the signed URL with `#page=N` anchor (null when no path / no URL). Task 4 reuses `AskCitation`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/ask/citations.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../documents/registry', () => ({
  getDocumentUrl: vi.fn(async (path: string) =>
    path === 'reports/d1/annual.pdf' ? 'https://signed.example/annual.pdf?token=x' : null),
}));

import { citationHref } from './citations';

const base = { document_id: 'd1', title: 'Annual Report', node_title: 'Outcomes', page_start: 3, page_end: 5 };

describe('citationHref', () => {
  it('returns signed url with page anchor', async () => {
    const href = await citationHref({ ...base, storage_path: 'reports/d1/annual.pdf' });
    expect(href).toBe('https://signed.example/annual.pdf?token=x#page=3');
  });

  it('returns null when storage_path empty', async () => {
    expect(await citationHref({ ...base, storage_path: '' })).toBeNull();
  });

  it('returns null when signing fails', async () => {
    expect(await citationHref({ ...base, storage_path: 'missing.pdf' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ask/citations.test.ts`
Expected: FAIL — module `./citations` not found.

- [ ] **Step 3: Implement**

`src/lib/ask/client.ts` — add field to the interface:

```typescript
export interface AskCitation {
  document_id: string;
  title: string;
  node_title: string;
  page_start: number;
  page_end: number;
  storage_path: string;
}
```

Create `src/lib/ask/citations.ts`:

```typescript
import { getDocumentUrl } from '../documents/registry';
import type { AskCitation } from './client';

/** Signed URL for a citation's source PDF with a page anchor, or null when unavailable. */
export async function citationHref(c: AskCitation): Promise<string | null> {
  if (!c.storage_path) return null;
  const url = await getDocumentUrl(c.storage_path);
  if (!url) return null;
  return `${url}#page=${c.page_start}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ask/citations.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into AskSurya**

In `src/pages/AskSurya.tsx`, add imports and an open handler, and make each source a button when it has a path. Replace the Sources `<li>` block:

```tsx
import { Sparkles, Send, ThumbsUp, ThumbsDown, ExternalLink } from 'lucide-react';
import { citationHref } from '../lib/ask/citations';
```

Inside the component:

```tsx
  async function openSource(c: AskAnswer['citations'][number]) {
    const href = await citationHref(c);
    if (href) window.open(href, '_blank', 'noopener');
  }
```

Sources block:

```tsx
              <ul className="space-y-1">
                {answer.citations.map((c, i) => (
                  <li key={`${c.document_id}-${i}`} className="text-sm text-text-muted">
                    {c.storage_path ? (
                      <button
                        onClick={() => void openSource(c)}
                        className="inline-flex items-center gap-1 text-left hover:text-text underline decoration-dotted"
                      >
                        {c.title} — {c.node_title} (p.{c.page_start}
                        {c.page_end !== c.page_start ? `–${c.page_end}` : ''})
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    ) : (
                      <>
                        {c.title} — {c.node_title} (p.{c.page_start}
                        {c.page_end !== c.page_start ? `–${c.page_end}` : ''})
                      </>
                    )}
                  </li>
                ))}
              </ul>
```

- [ ] **Step 6: Health gate**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run`
Expected: clean. (If other code constructs `AskCitation` literals without `storage_path`, add `storage_path: ''`.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/ask/ src/pages/AskSurya.tsx
git commit -m "feat(ask): clickable citation deep-links via signed URLs with page anchors"
```

---

### Task 3: `/similar` endpoint — duplication-detection backend

**Files:**
- Modify: `rag/query_service.py`
- Modify: `rag/api.py`
- Test: `rag/tests/test_query_service.py`

**Interfaces:**
- Consumes: `flatten(docs)` from Task 1, `read_docs(client)`, `llm.pick(question, titles)`.
- Produces: `find_similar(text, client, llm) -> list[dict]` where each dict is `{"document_id","title","node_title","page_start","page_end","storage_path"}` (same shape as a serialized Citation — the SPA reuses `AskCitation`). HTTP: `POST /similar {"text": ...}` → `{"matches": [...]}`, auth identical to `/query`.

- [ ] **Step 1: Write the failing test**

Append to `rag/tests/test_query_service.py` (reuse/extend the file's existing fake-client pattern if one exists; otherwise this stub is self-contained):

```python
from llm import FakeLLM
from query_service import find_similar


class _Result:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, data):
        self._data = data
    def select(self, *_a, **_k):
        return self
    def limit(self, *_a, **_k):
        return self
    def execute(self):
        return _Result(self._data)


class _Client:
    def __init__(self, data):
        self._data = data
    def table(self, _name):
        return _Table(self._data)


def _doc_rows():
    return [{"document_id": "d1", "tree": {"root": {"nodes": [
        {"title": "Nanomaterials synthesis", "summary": "Prior work on nano synthesis.",
         "page_start": 1, "page_end": 4}]}},
        "documents": {"id": "d1", "title": "2024 Project Report",
                      "storage_path": "reports/d1/r.pdf"}}]


def test_find_similar_returns_citation_dicts():
    matches = find_similar("nano synthesis proposal", _Client(_doc_rows()), FakeLLM())
    assert matches == [{"document_id": "d1", "title": "2024 Project Report",
                        "node_title": "Nanomaterials synthesis",
                        "page_start": 1, "page_end": 4,
                        "storage_path": "reports/d1/r.pdf"}]


def test_find_similar_empty_corpus():
    assert find_similar("anything", _Client([]), FakeLLM()) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest rag/tests/test_query_service.py -q`
Expected: FAIL — `ImportError: cannot import name 'find_similar'`.

- [ ] **Step 3: Implement**

`rag/query_service.py` — add import and function:

```python
from retrieval import traverse, flatten
```

```python
def find_similar(text, client, llm):
    """Duplication check: rank corpus sections similar to a proposed topic.
    Returns citation-shaped dicts (no generated prose — matches only, so the
    result is inherently grounded)."""
    candidates = flatten(read_docs(client))
    if not candidates:
        return []
    titles = [f"{title} — {node['title']}" for _, title, _, node in candidates]
    picks = llm.pick(f"Find prior or ongoing work similar to: {text}", titles)
    matches = []
    for i in picks:
        doc_id, title, storage_path, node = candidates[i]
        matches.append({"document_id": doc_id, "title": title,
                        "node_title": node["title"],
                        "page_start": node["page_start"], "page_end": node["page_end"],
                        "storage_path": storage_path})
    return matches
```

`rag/api.py` — add endpoint (same auth dance as `/query`):

```python
from query_service import parse_bearer, handle_query, log_query, find_similar
```

```python
class SimilarIn(BaseModel):
    text: str


@app.post("/similar")
def similar(body: SimilarIn, authorization: str | None = Header(default=None)):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty text")
    try:
        jwt = parse_bearer(authorization)
    except ValueError:
        raise HTTPException(status_code=401, detail="missing bearer token")
    try:
        verify_token(jwt, _ANON_URL, _ANON_KEY)
    except PermissionError:
        raise HTTPException(status_code=401, detail="invalid token")
    client = scoped_client(_ANON_URL, _ANON_KEY, jwt)
    return {"matches": find_similar(text, client, _LLM)}
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest rag/tests/test_query_service.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add rag/query_service.py rag/api.py rag/tests/test_query_service.py
git commit -m "feat(rag): /similar endpoint for duplication detection over indexed corpus"
```

---

### Task 4: Similar-work panel in Proposals UI

**Files:**
- Modify: `src/lib/ask/client.ts`
- Create: `src/components/SimilarWorkPanel.tsx`
- Modify: `src/pages/proposals/ProposalDetail.tsx` (render panel; pass proposal title + abstract)
- Test: covered by tsc/eslint + Task 2's citation helper tests (panel is thin composition; no new logic beyond fetch)

**Interfaces:**
- Consumes: `AskCitation`, `citationHref` (Task 2); `/similar` endpoint (Task 3).
- Produces: `findSimilar(text: string): Promise<AskCitation[]>` in `client.ts`; `<SimilarWorkPanel text={string} />` named-export component.

- [ ] **Step 1: Add client function**

Append to `src/lib/ask/client.ts`:

```typescript
/** Duplication check: prior/ongoing work similar to a topic. Citation-shaped matches. */
export async function findSimilar(text: string): Promise<AskCitation[]> {
  const base = import.meta.env.VITE_RAG_URL;
  if (!base) throw new Error('VITE_RAG_URL is not configured');
  if (!supabase) throw new Error('Not signed in');

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${base}/similar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Similarity check failed (${res.status})`);
  const data = (await res.json()) as { matches: AskCitation[] };
  return data.matches ?? [];
}
```

- [ ] **Step 2: Create the panel component**

Create `src/components/SimilarWorkPanel.tsx`:

```tsx
import { useState } from 'react';
import { SearchCheck, ExternalLink } from 'lucide-react';
import { Card } from './ui/Cards';
import { findSimilar } from '../lib/ask/client';
import { citationHref } from '../lib/ask/citations';
import type { AskCitation } from '../lib/ask/client';

interface SimilarWorkPanelProps {
  /** Topic to check — e.g. proposal title + abstract. */
  text: string;
}

export function SimilarWorkPanel({ text }: SimilarWorkPanelProps) {
  const [matches, setMatches] = useState<AskCitation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function check() {
    setLoading(true);
    setError('');
    try {
      setMatches(await findSimilar(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Similarity check failed');
    } finally {
      setLoading(false);
    }
  }

  async function openMatch(c: AskCitation) {
    const href = await citationHref(c);
    if (href) window.open(href, '_blank', 'noopener');
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
          <SearchCheck className="h-4 w-4 text-text-muted" /> Prior &amp; Ongoing Similar Work
        </h3>
        <button
          onClick={() => void check()}
          disabled={loading || !text.trim()}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-text hover:bg-surface-hover disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Check for similar work'}
        </button>
      </div>
      {error && <div className="text-sm text-danger">{error}</div>}
      {matches !== null && matches.length === 0 && (
        <p className="text-sm text-text-muted">No similar prior work found in indexed documents.</p>
      )}
      {matches !== null && matches.length > 0 && (
        <ul className="space-y-1">
          {matches.map((c, i) => (
            <li key={`${c.document_id}-${i}`} className="text-sm text-text-muted">
              <button
                onClick={() => void openMatch(c)}
                className="inline-flex items-center gap-1 text-left hover:text-text underline decoration-dotted"
              >
                {c.title} — {c.node_title} (p.{c.page_start}
                {c.page_end !== c.page_start ? `–${c.page_end}` : ''})
                <ExternalLink className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Wire into ProposalDetail**

In `src/pages/proposals/ProposalDetail.tsx`: import `{ SimilarWorkPanel } from '../../components/SimilarWorkPanel';` and render below the proposal's abstract/detail card (find the main detail column and append):

```tsx
<SimilarWorkPanel text={`${proposal.title}. ${proposal.abstract}`} />
```

(Use the page's actual proposal object variable name; fields `title` and `abstract` per `proposals` table.)

- [ ] **Step 4: Health gate**

Run: `npx tsc --noEmit && npx eslint src/`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ask/client.ts src/components/SimilarWorkPanel.tsx src/pages/proposals/ProposalDetail.tsx
git commit -m "feat(proposals): duplication check panel backed by /similar"
```

---

### Task 5: Proposal comparables — past-project underwriting view

**Files:**
- Create: `src/lib/proposals/comparables.ts`
- Test: `src/lib/proposals/comparables.test.ts`
- Modify: `src/pages/proposals/ProposalDetail.tsx` (comparables card)

**Interfaces:**
- Consumes: `ProjectInfo` from `src/types` (fields: `ProjectName`, `DivisionCode`, `FundType`, `SanctionedCost`, `UtilizedAmount`, `StartDate`, `CompletioDate`, `ProjectStatus`); proposal fields `domain_theme`, `division_code`, `fund_type`.
- Produces: `findComparables(projects: ProjectInfo[], input: ComparablesInput, limit?: number): ProjectInfo[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/proposals/comparables.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { findComparables } from './comparables';
import type { ProjectInfo } from '../../types';

function proj(over: Partial<ProjectInfo>): ProjectInfo {
  return {
    ProjectID: 'p', ProjectNo: 'p', ProjectName: '', FundType: '', SponsorerType: '',
    SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Completed', StartDate: '',
    CompletioDate: '', SanctionedCost: '', UtilizedAmount: '', PrincipalInvestigator: '',
    DivisionCode: '', Extension: '', ApprovalAuthority: '', ...over,
  };
}

const input = { domainTheme: 'Nanomaterials for water purification', divisionCode: 'CMD', fundType: 'GAP' };

describe('findComparables', () => {
  it('ranks keyword + division + fund-type matches first', () => {
    const projects = [
      proj({ ProjectNo: 'A', ProjectName: 'Nanomaterials synthesis for water treatment', DivisionCode: 'CMD', FundType: 'GAP' }),
      proj({ ProjectNo: 'B', ProjectName: 'Bamboo composites', DivisionCode: 'CMD', FundType: 'GAP' }),
      proj({ ProjectNo: 'C', ProjectName: 'Water purification membranes', DivisionCode: 'LWMD', FundType: 'MLP' }),
    ];
    const result = findComparables(projects, input);
    expect(result.map(p => p.ProjectNo)).toEqual(['A', 'C', 'B']);
  });

  it('excludes projects with zero relevance', () => {
    const projects = [proj({ ProjectNo: 'X', ProjectName: 'Unrelated topic', DivisionCode: 'ZZZ', FundType: 'OTHER' })];
    expect(findComparables(projects, input)).toEqual([]);
  });

  it('respects limit', () => {
    const projects = Array.from({ length: 10 }, (_, i) =>
      proj({ ProjectNo: `P${i}`, ProjectName: 'Nanomaterials study', DivisionCode: 'CMD', FundType: 'GAP' }));
    expect(findComparables(projects, input, 5)).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/proposals/comparables.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/proposals/comparables.ts`:

```typescript
import type { ProjectInfo } from '../../types';

export interface ComparablesInput {
  domainTheme: string;
  divisionCode: string;
  fundType: string;
}

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'in', 'on', 'to', 'with', 'using']);

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Rank past projects comparable to a proposal: keyword overlap on the project
 * name (2 pts/keyword), same division (+2), same fund type (+1). Zero-score
 * projects are excluded.
 */
export function findComparables(
  projects: ProjectInfo[],
  input: ComparablesInput,
  limit = 5,
): ProjectInfo[] {
  const keywords = new Set(tokens(input.domainTheme));
  return projects
    .map(p => {
      const nameTokens = tokens(p.ProjectName);
      const keywordHits = nameTokens.filter(t => keywords.has(t)).length;
      let score = keywordHits * 2;
      if (p.DivisionCode === input.divisionCode) score += 2;
      if (p.FundType === input.fundType) score += 1;
      if (keywordHits === 0 && p.DivisionCode !== input.divisionCode) score = 0;
      return { p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.p);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/proposals/comparables.test.ts`
Expected: PASS (3 tests). Adjust scoring only if the ranking test exposes a tie-order bug — keep the scoring rubric as specified.

- [ ] **Step 5: Render comparables card in ProposalDetail**

In `src/pages/proposals/ProposalDetail.tsx`: pull `projects` from `useData()`, compute in `useMemo`, render a card under the SimilarWorkPanel:

```tsx
import { useMemo } from 'react';
import { findComparables } from '../../lib/proposals/comparables';
// inside component, after proposal is loaded:
const { projects } = useData();
const comparables = useMemo(
  () => proposal
    ? findComparables(projects, {
        domainTheme: `${proposal.title} ${proposal.domain_theme}`,
        divisionCode: proposal.division_code,
        fundType: proposal.fund_type,
      })
    : [],
  [projects, proposal],
);
```

```tsx
<Card className="p-5 space-y-3">
  <h3 className="text-sm font-semibold text-text">Comparable Past Projects</h3>
  {comparables.length === 0 ? (
    <p className="text-sm text-text-muted">No comparable past projects found.</p>
  ) : (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
          <th className="py-1 pr-2">Project</th>
          <th className="py-1 pr-2">Sanctioned</th>
          <th className="py-1 pr-2">Utilized</th>
          <th className="py-1 pr-2">Start</th>
          <th className="py-1 pr-2">Completion</th>
          <th className="py-1">Status</th>
        </tr>
      </thead>
      <tbody>
        {comparables.map(p => (
          <tr key={p.ProjectNo} className="border-t border-border text-text">
            <td className="py-1.5 pr-2">{p.ProjectName}</td>
            <td className="py-1.5 pr-2">{p.SanctionedCost}</td>
            <td className="py-1.5 pr-2">{p.UtilizedAmount}</td>
            <td className="py-1.5 pr-2">{p.StartDate}</td>
            <td className="py-1.5 pr-2">{p.CompletioDate}</td>
            <td className="py-1.5">{p.ProjectStatus}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )}
</Card>
```

(Match the page's existing `useData()` destructuring and `Card` import; add to them rather than duplicating.)

- [ ] **Step 6: Health gate**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run src/lib/proposals/comparables.test.ts`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/proposals/ src/pages/proposals/ProposalDetail.tsx
git commit -m "feat(proposals): comparable past projects card for evidence-based evaluation"
```

---

### Task 6: Query latency instrumentation (baseline metric)

**Files:**
- Create: `supabase/migrations/20260707000000_query_log_latency.sql`
- Modify: `rag/query_service.py` (`log_query`), `rag/api.py`
- Test: `rag/tests/test_query_service.py`

**Interfaces:**
- Consumes: existing `log_query(client, question, answer)`.
- Produces: `log_query(client, question, answer, latency_ms=None)`; `query_log.latency_ms int` column. RagMonitor can chart it later (out of scope here).

- [ ] **Step 1: Migration**

Create `supabase/migrations/20260707000000_query_log_latency.sql`:

```sql
-- 20260707000000_query_log_latency.sql
-- Decision-preparation-time baseline: record end-to-end answer latency per query.
-- Column-only change; query_log RLS policies are row-level and unchanged.

alter table public.query_log add column if not exists latency_ms integer;
```

- [ ] **Step 2: Write the failing test**

Append to `rag/tests/test_query_service.py` (reuse `_Result` from Task 3's stubs):

```python
from answer import Answer
from query_service import log_query


class _InsertTable:
    def __init__(self):
        self.payload = None
    def insert(self, payload):
        self.payload = payload
        return self
    def execute(self):
        return _Result([{"id": "q1"}])


class _InsertClient:
    def __init__(self):
        self.tbl = _InsertTable()
    def table(self, _name):
        return self.tbl


def test_log_query_records_latency():
    client = _InsertClient()
    row_id = log_query(client, "q?", Answer("ans", "document", []), latency_ms=123)
    assert row_id == "q1"
    assert client.tbl.payload["latency_ms"] == 123
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest rag/tests/test_query_service.py -q`
Expected: FAIL — `TypeError: log_query() got an unexpected keyword argument 'latency_ms'`.

- [ ] **Step 4: Implement**

`rag/query_service.py`:

```python
def log_query(client, question, answer, latency_ms=None):
    """Persist the query as a row owned by the caller (RLS: user_id = auth.uid()).
    Best-effort — a logging failure must not break the answer. Returns row id or None."""
    try:
        row = (client.table("query_log").insert({
            "question": question, "mode": answer.mode, "answer": answer.text,
            "citations": [dataclasses.asdict(c) for c in answer.citations],
            "latency_ms": latency_ms,
        }).execute().data)
        return row[0]["id"] if row else None
    except Exception:
        return None
```

`rag/api.py` `/query` handler — time the answer:

```python
import time
```

```python
    started = time.perf_counter()
    answer = handle_query(question, client, _LLM)
    latency_ms = int((time.perf_counter() - started) * 1000)
    payload = dataclasses.asdict(answer)
    payload["query_id"] = log_query(client, question, answer, latency_ms=latency_ms)
    return payload
```

- [ ] **Step 5: Run tests**

Run: `python -m pytest rag/tests/test_query_service.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260707000000_query_log_latency.sql rag/query_service.py rag/api.py rag/tests/test_query_service.py
git commit -m "feat(rag): record per-query latency for decision-time baseline"
```

---

### Task 7: Eval harness — citation hit-rate + real gold-set scaffolding

**Files:**
- Modify: `rag/eval/run_eval.py`
- Create: `rag/eval/corpus.sample.json`, `rag/eval/gold_citations.jsonl`
- Test: `rag/tests/test_eval.py`

**Interfaces:**
- Consumes: `traverse(docs, question, llm)` (Task 1 docs shape), `make_llm`.
- Produces: `run_citation_eval(cases, corpus, llm) -> dict{"total","hits","hit_rate"}`; gold case shape `{"question": str, "expected_citation": str}` where `expected_citation` is a substring matched case-insensitively against `f"{c.title} — {c.node_title}"` of any returned citation. CLI: `python rag/eval/run_eval.py` additionally runs citation eval when `rag/eval/corpus.json` exists.

- [ ] **Step 1: Write the failing test**

Append to `rag/tests/test_eval.py`:

```python
from llm import FakeLLM
from eval.run_eval import run_citation_eval


def _corpus():
    return [{"id": "d1", "title": "2024 Annual Report", "storage_path": "r.pdf",
             "tree": {"root": {"nodes": [{"title": "Water Research Outcomes",
                                          "summary": "Membrane pilot succeeded.",
                                          "page_start": 2, "page_end": 3}]}}}]


def test_citation_eval_scores_hits():
    cases = [{"question": "What did the water pilot achieve?",
              "expected_citation": "water research outcomes"}]
    result = run_citation_eval(cases, _corpus(), FakeLLM())
    assert result == {"total": 1, "hits": 1, "hit_rate": 1.0}


def test_citation_eval_scores_misses():
    cases = [{"question": "What did the water pilot achieve?",
              "expected_citation": "completely different section"}]
    result = run_citation_eval(cases, _corpus(), FakeLLM())
    assert result["hits"] == 0
```

(If `test_eval.py` imports `run_eval` differently — e.g. via `sys.path` manipulation — match that file's existing import style.)

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest rag/tests/test_eval.py -q`
Expected: FAIL — `ImportError: cannot import name 'run_citation_eval'`.

- [ ] **Step 3: Implement**

In `rag/eval/run_eval.py`, add:

```python
def run_citation_eval(cases, corpus, llm) -> dict:
    """Retrieval-accuracy metric (dissertation target: >=80%). A case hits when any
    returned citation's 'title — node_title' contains expected_citation (case-insensitive)."""
    hits = 0
    for c in cases:
        ans = traverse(corpus, c["question"], llm)
        labels = [f"{ct.title} — {ct.node_title}".lower() for ct in ans.citations]
        if any(c["expected_citation"].lower() in label for label in labels):
            hits += 1
    total = len(cases)
    return {"total": total, "hits": hits, "hit_rate": (hits / total) if total else 0.0}
```

Extend `main()` to run it when a corpus dump exists:

```python
def main():
    base = os.path.dirname(os.path.abspath(__file__))
    gold = os.path.join(base, "gold.jsonl")
    llm = make_llm(os.environ.get("LLM_BACKEND", "fake"),
                   os.environ.get("OPENLLM_BASE_URL", ""),
                   os.environ.get("OPENLLM_MODEL", ""))
    result = run_eval(_load(gold), llm)
    print(f"[eval] {result['mode_correct']}/{result['total']} "
          f"router mode correct (accuracy {result['accuracy']:.2f}); "
          f"refusal {result['refusal_correct']}/{result['refusal_total']}")

    corpus_path = os.path.join(base, "corpus.json")
    gold_cit = os.path.join(base, "gold_citations.jsonl")
    if os.path.exists(corpus_path) and os.path.exists(gold_cit):
        with open(corpus_path, encoding="utf-8") as f:
            corpus = json.load(f)
        cit = run_citation_eval(_load(gold_cit), corpus, llm)
        print(f"[eval] citation hit-rate {cit['hits']}/{cit['total']} "
              f"({cit['hit_rate']:.2f}; dissertation target >= 0.80)")
```

Create `rag/eval/corpus.sample.json` (documents the dump format; real `corpus.json` is produced on the host and gitignored alongside it):

```json
[
  {
    "id": "REPLACE-document-uuid",
    "title": "REPLACE with documents.title",
    "storage_path": "REPLACE with documents.storage_path",
    "tree": { "root": { "nodes": [ { "title": "…", "summary": "…", "page_start": 1, "page_end": 2 } ] } }
  }
]
```

Create `rag/eval/gold_citations.jsonl` with real institute questions (author these against actual CSIR-AMPRI documents during Task 12; seed with the format):

```json
{"question": "REPLACE with a real institute question", "expected_citation": "REPLACE with expected 'title — node_title' substring"}
```

Add a comment line to `rag/eval/run_eval.py`'s docstring noting the export query for the host:

```
Corpus dump (run on host, service role):
  select json_agg(json_build_object('id', d.id, 'title', d.title,
         'storage_path', d.storage_path, 'tree', i.tree))
  from doc_indexes i join documents d on d.id = i.document_id;
Save the result as rag/eval/corpus.json.
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest rag/tests/test_eval.py -q`
Expected: PASS. Also run the smoke CLI: `python rag/eval/run_eval.py` → prints router eval; citation eval skipped (no corpus.json). 

- [ ] **Step 5: Gitignore host-generated eval data**

Append to `.gitignore`:

```
rag/eval/corpus.json
```

- [ ] **Step 6: Commit**

```bash
git add rag/eval/ rag/tests/test_eval.py .gitignore
git commit -m "feat(eval): citation hit-rate scoring against dumped corpus (retrieval-accuracy metric)"
```

---

### Task 8: Classification visibility on document lists

The dissertation's public/internal/confidential/restricted classification maps onto the shipped `documents.access_tier` (`institute`/`division`/`owner`/`confidential`) — enforcement already exists in RLS. Gap = visibility: users can't see a document's tier.

**Files:**
- Modify: `src/lib/documents/registry.ts` (`listDocuments` select)
- Modify: `src/components/DocumentPanel.tsx` (tier badge per row)
- Test: covered by tsc/eslint (display-only change; RLS enforcement already tested at DB layer)

**Interfaces:**
- Consumes: `documents.access_tier` column, `DocAccessTier` type (already exported).
- Produces: `listDocuments` rows include `access_tier`.

- [ ] **Step 1: Extend select**

In `src/lib/documents/registry.ts` `listDocuments`, change the select to:

```typescript
    .select('id, doc_type, title, storage_path, file_name, file_size, created_at, ingest_status, access_tier')
```

- [ ] **Step 2: Badge in DocumentPanel**

In `src/components/DocumentPanel.tsx`, locate the per-document row render and add a tier badge next to the title (use the existing `Badge` component from `./ui/Cards` if already imported there; otherwise import it):

```tsx
const TIER_LABELS: Record<string, string> = {
  institute: 'Internal',
  division: 'Division',
  owner: 'Restricted',
  confidential: 'Confidential',
};
```

```tsx
<Badge variant={doc.access_tier === 'confidential' ? 'danger' : 'default'}>
  {TIER_LABELS[doc.access_tier] ?? doc.access_tier}
</Badge>
```

(Match `DocumentPanel`'s actual row markup and its `Badge` variant names — check `src/components/ui/Cards.tsx` for the valid `variant` union and pick the closest; `danger`-style for confidential, neutral for the rest.)

- [ ] **Step 3: Health gate**

Run: `npx tsc --noEmit && npx eslint src/`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/documents/registry.ts src/components/DocumentPanel.tsx
git commit -m "feat(documents): surface access-tier classification badge on document lists"
```

---

### Task 9: Commercialisation analytics (Intelligence page)

**Files:**
- Create: `src/lib/intelligence/commercialisation.ts`
- Test: `src/lib/intelligence/commercialisation.test.ts`
- Modify: `src/pages/Intelligence.tsx` (summary strip above tabs)

**Interfaces:**
- Consumes: `IPIntelligence`, `ProjectInfo` from `src/types`.
- Produces: `commercialisationSummary(ip: IPIntelligence[], projects: ProjectInfo[]): CommercialisationSummary`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/intelligence/commercialisation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { commercialisationSummary } from './commercialisation';
import type { IPIntelligence, ProjectInfo } from '../../types';

function ip(over: Partial<IPIntelligence>): IPIntelligence {
  return { id: 'i', title: 'IP', type: 'Patent', status: 'Filed', filingDate: '2024-01-01',
           inventors: [], divisionCode: 'CMD', ...over };
}
function proj(over: Partial<ProjectInfo>): ProjectInfo {
  return {
    ProjectID: 'p', ProjectNo: 'p', ProjectName: '', FundType: '', SponsorerType: '',
    SponsorerName: '', ProjectCategory: '', ProjectStatus: '', StartDate: '',
    CompletioDate: '', SanctionedCost: '0', UtilizedAmount: '', PrincipalInvestigator: '',
    DivisionCode: '', Extension: '', ApprovalAuthority: '', ...over,
  };
}

describe('commercialisationSummary', () => {
  it('counts granted patents as licensable assets', () => {
    const s = commercialisationSummary(
      [ip({ id: 'a', status: 'Granted', title: 'Nano filter' }), ip({ id: 'b', status: 'Filed' })],
      [],
    );
    expect(s.grantedPatents).toBe(1);
    expect(s.filedPatents).toBe(1);
    expect(s.licensableAssets).toEqual([{ title: 'Nano filter', type: 'Patent', divisionCode: 'CMD' }]);
  });

  it('sums external sponsored income', () => {
    const s = commercialisationSummary([], [
      proj({ FundType: 'Consultancy', SanctionedCost: '1200000' }),
      proj({ FundType: 'Sponsored', SanctionedCost: '800000' }),
      proj({ FundType: 'GAP', SanctionedCost: '999' }),
    ]);
    expect(s.externalProjects).toBe(2);
    expect(s.externalValue).toBe(2000000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/intelligence/commercialisation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/intelligence/commercialisation.ts`:

```typescript
import type { IPIntelligence, ProjectInfo } from '../../types';

export interface CommercialisationSummary {
  grantedPatents: number;
  filedPatents: number;
  externalProjects: number;
  externalValue: number;
  licensableAssets: { title: string; type: string; divisionCode: string }[];
}

const EXTERNAL_FUND_TYPES = /consultan|sponsor|industr|contract/i;

/**
 * Income side of the R&D balance sheet: granted IP = licensable assets;
 * consultancy/sponsored projects = external revenue engagements.
 */
export function commercialisationSummary(
  ip: IPIntelligence[],
  projects: ProjectInfo[],
): CommercialisationSummary {
  const granted = ip.filter(i => i.status === 'Granted');
  const external = projects.filter(
    p => EXTERNAL_FUND_TYPES.test(p.FundType) || EXTERNAL_FUND_TYPES.test(p.SponsorerType),
  );
  return {
    grantedPatents: granted.length,
    filedPatents: ip.filter(i => i.status === 'Filed').length,
    externalProjects: external.length,
    externalValue: external.reduce((sum, p) => sum + (parseFloat(p.SanctionedCost) || 0), 0),
    licensableAssets: granted.map(i => ({ title: i.title, type: i.type, divisionCode: i.divisionCode })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/intelligence/commercialisation.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Render on Intelligence page**

In `src/pages/Intelligence.tsx`: `projects` from `useData()` (add to existing destructure), compute in `useMemo`, render a `StatCard` strip above the publications/IPR tabs (the page already imports `StatCard`):

```tsx
import { useMemo } from 'react';
import { commercialisationSummary } from '../lib/intelligence/commercialisation';
// inside component:
const { scientificOutputs, ipIntelligence, projects, refreshData } = useData();
const commercial = useMemo(
  () => commercialisationSummary(ipIntelligence, projects),
  [ipIntelligence, projects],
);
```

```tsx
<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
  <StatCard title="Granted Patents" value={commercial.grantedPatents} icon={Award} />
  <StatCard title="Filed Patents" value={commercial.filedPatents} icon={FileText} />
  <StatCard title="External Projects" value={commercial.externalProjects} icon={BarChart3} />
  <StatCard title="External Value (₹)" value={commercial.externalValue.toLocaleString('en-IN')} icon={Lightbulb} />
</div>
```

(Match `StatCard`'s actual prop names in `src/components/ui/Cards.tsx` — if it takes `label`/`value` instead of `title`, follow the component.)

- [ ] **Step 6: Health gate + commit**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run src/lib/intelligence/`
Expected: clean.

```bash
git add src/lib/intelligence/ src/pages/Intelligence.tsx
git commit -m "feat(intelligence): commercialisation analytics — licensable IP and external revenue"
```

---

### Task 10: Convergence detection — emerging cross-division themes

**Files:**
- Create: `src/lib/intelligence/themes.ts`
- Test: `src/lib/intelligence/themes.test.ts`
- Modify: `src/pages/Intelligence.tsx` (themes card under the stat strip)

**Interfaces:**
- Consumes: `ProjectInfo` (`ProjectName`, `DivisionCode`, `StartDate` — parseable date string).
- Produces: `emergingThemes(projects: ProjectInfo[], now?: Date): ThemeSignal[]` with `ThemeSignal { keyword: string; divisions: string[]; recentCount: number; priorCount: number }`, sorted by `recentCount` desc.

- [ ] **Step 1: Write the failing test**

Create `src/lib/intelligence/themes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { emergingThemes } from './themes';
import type { ProjectInfo } from '../../types';

function proj(over: Partial<ProjectInfo>): ProjectInfo {
  return {
    ProjectID: 'p', ProjectNo: 'p', ProjectName: '', FundType: '', SponsorerType: '',
    SponsorerName: '', ProjectCategory: '', ProjectStatus: '', StartDate: '',
    CompletioDate: '', SanctionedCost: '', UtilizedAmount: '', PrincipalInvestigator: '',
    DivisionCode: '', Extension: '', ApprovalAuthority: '', ...over,
  };
}

const now = new Date('2026-07-01');

describe('emergingThemes', () => {
  it('flags a keyword rising across >=2 divisions in the recent window', () => {
    const projects = [
      proj({ ProjectNo: 'A', ProjectName: 'Graphene sensors', DivisionCode: 'CMD', StartDate: '2025-03-01' }),
      proj({ ProjectNo: 'B', ProjectName: 'Graphene coatings', DivisionCode: 'LWMD', StartDate: '2024-08-01' }),
      proj({ ProjectNo: 'C', ProjectName: 'Graphene basics', DivisionCode: 'CMD', StartDate: '2018-01-01' }),
    ];
    const themes = emergingThemes(projects, now);
    const g = themes.find(t => t.keyword === 'graphene');
    expect(g).toBeDefined();
    expect(g?.recentCount).toBe(2);
    expect(g?.priorCount).toBe(1);
    expect(g?.divisions.sort()).toEqual(['CMD', 'LWMD']);
  });

  it('ignores single-division or declining keywords', () => {
    const projects = [
      proj({ ProjectNo: 'A', ProjectName: 'Bamboo housing', DivisionCode: 'SCMD', StartDate: '2025-01-01' }),
      proj({ ProjectNo: 'B', ProjectName: 'Bamboo roads', DivisionCode: 'SCMD', StartDate: '2024-01-01' }),
    ];
    expect(emergingThemes(projects, now).find(t => t.keyword === 'bamboo')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/intelligence/themes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/intelligence/themes.ts`:

```typescript
import type { ProjectInfo } from '../../types';

export interface ThemeSignal {
  keyword: string;
  divisions: string[];
  recentCount: number;
  priorCount: number;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'using', 'study', 'studies', 'development',
  'analysis', 'project', 'research', 'novel', 'based', 'from',
]);

const RECENT_WINDOW_YEARS = 3;

function keywords(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 3 && !STOPWORDS.has(t));
}

/**
 * Convergence detection: keywords whose recent-window project count (last 3y)
 * exceeds their prior count AND that appear in >=2 divisions recently —
 * i.e. themes different groups are independently moving toward.
 */
export function emergingThemes(projects: ProjectInfo[], now = new Date()): ThemeSignal[] {
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - RECENT_WINDOW_YEARS);

  const recent = new Map<string, { count: number; divisions: Set<string> }>();
  const prior = new Map<string, number>();

  for (const p of projects) {
    const start = new Date(p.StartDate);
    if (isNaN(start.getTime())) continue;
    const isRecent = start >= cutoff;
    for (const kw of new Set(keywords(p.ProjectName))) {
      if (isRecent) {
        const entry = recent.get(kw) ?? { count: 0, divisions: new Set<string>() };
        entry.count += 1;
        if (p.DivisionCode) entry.divisions.add(p.DivisionCode);
        recent.set(kw, entry);
      } else {
        prior.set(kw, (prior.get(kw) ?? 0) + 1);
      }
    }
  }

  const signals: ThemeSignal[] = [];
  for (const [kw, entry] of recent) {
    const priorCount = prior.get(kw) ?? 0;
    if (entry.divisions.size >= 2 && entry.count > priorCount) {
      signals.push({
        keyword: kw,
        divisions: [...entry.divisions],
        recentCount: entry.count,
        priorCount,
      });
    }
  }
  return signals.sort((a, b) => b.recentCount - a.recentCount);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/intelligence/themes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Render on Intelligence page**

In `src/pages/Intelligence.tsx`, below the commercialisation strip:

```tsx
import { emergingThemes } from '../lib/intelligence/themes';
// inside component:
const themes = useMemo(() => emergingThemes(projects).slice(0, 8), [projects]);
```

```tsx
{themes.length > 0 && (
  <Card className="p-5 space-y-3">
    <h3 className="text-sm font-semibold text-text">Emerging Cross-Division Themes</h3>
    <div className="flex flex-wrap gap-2">
      {themes.map(t => (
        <div key={t.keyword} className="rounded-md border border-border px-3 py-1.5 text-sm">
          <span className="font-medium text-text capitalize">{t.keyword}</span>
          <span className="ml-2 text-xs text-text-muted">
            {t.recentCount} recent (prior {t.priorCount}) · {t.divisions.join(', ')}
          </span>
        </div>
      ))}
    </div>
  </Card>
)}
```

- [ ] **Step 6: Health gate + commit**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run src/lib/intelligence/`
Expected: clean.

```bash
git add src/lib/intelligence/themes.ts src/lib/intelligence/themes.test.ts src/pages/Intelligence.tsx
git commit -m "feat(intelligence): emerging cross-division theme detection (convergence use case)"
```

---

### Task 11: Collaboration analysis — co-author pairs, cross-division links

**Files:**
- Create: `src/lib/intelligence/collaboration.ts`
- Test: `src/lib/intelligence/collaboration.test.ts`
- Modify: `src/pages/StaffAnalytics.tsx` (collaboration card)

**Interfaces:**
- Consumes: `ScientificOutput` (`authors: string[]`, `divisionCode`), `StaffMember` (`Name`, `Division` — from `src/types`).
- Produces: `coAuthorPairs(outputs: ScientificOutput[], staff: StaffMember[]): CoAuthorPair[]` with `CoAuthorPair { a: string; b: string; count: number; crossDivision: boolean }`, sorted by count desc.

- [ ] **Step 1: Write the failing test**

Create `src/lib/intelligence/collaboration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { coAuthorPairs } from './collaboration';
import type { ScientificOutput, StaffMember } from '../../types';

function out(authors: string[]): ScientificOutput {
  return { id: Math.random().toString(), title: 't', authors, journal: 'j', year: 2025, divisionCode: 'CMD' };
}

const staff = [
  { Name: 'A Kumar', Division: 'CMD' },
  { Name: 'B Singh', Division: 'LWMD' },
  { Name: 'C Verma', Division: 'CMD' },
] as StaffMember[];

describe('coAuthorPairs', () => {
  it('counts repeated pairs and flags cross-division', () => {
    const pairs = coAuthorPairs([out(['A Kumar', 'B Singh']), out(['A Kumar', 'B Singh'])], staff);
    expect(pairs).toEqual([{ a: 'A Kumar', b: 'B Singh', count: 2, crossDivision: true }]);
  });

  it('same-division pair is not cross-division', () => {
    const pairs = coAuthorPairs([out(['A Kumar', 'C Verma'])], staff);
    expect(pairs[0].crossDivision).toBe(false);
  });

  it('emits every pair from a 3-author paper', () => {
    const pairs = coAuthorPairs([out(['A Kumar', 'B Singh', 'C Verma'])], staff);
    expect(pairs).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/intelligence/collaboration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/intelligence/collaboration.ts`:

```typescript
import type { ScientificOutput, StaffMember } from '../../types';

export interface CoAuthorPair {
  a: string;
  b: string;
  count: number;
  crossDivision: boolean;
}

/**
 * Collaboration map from co-authorship: every author pair per publication,
 * aggregated. crossDivision when both authors resolve to staff in different
 * divisions (unresolvable names count as same-division = false).
 */
export function coAuthorPairs(outputs: ScientificOutput[], staff: StaffMember[]): CoAuthorPair[] {
  const divisionOf = new Map(staff.map(s => [s.Name.toLowerCase(), s.Division]));
  const pairs = new Map<string, CoAuthorPair>();

  for (const o of outputs) {
    const authors = [...new Set(o.authors.map(a => a.trim()).filter(Boolean))].sort();
    for (let i = 0; i < authors.length; i++) {
      for (let j = i + 1; j < authors.length; j++) {
        const key = `${authors[i]}|${authors[j]}`;
        const existing = pairs.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          const divA = divisionOf.get(authors[i].toLowerCase());
          const divB = divisionOf.get(authors[j].toLowerCase());
          pairs.set(key, {
            a: authors[i], b: authors[j], count: 1,
            crossDivision: Boolean(divA && divB && divA !== divB),
          });
        }
      }
    }
  }
  return [...pairs.values()].sort((x, y) => y.count - x.count);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/intelligence/collaboration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Render on StaffAnalytics**

In `src/pages/StaffAnalytics.tsx`: add `scientificOutputs` to the page's `useData()` destructure if absent, compute top pairs in `useMemo`, render a card in the page's existing card grid:

```tsx
import { coAuthorPairs } from '../lib/intelligence/collaboration';
// inside component:
const collaborations = useMemo(
  () => coAuthorPairs(scientificOutputs, staff).slice(0, 10),
  [scientificOutputs, staff],
);
```

(Use the page's actual staff array variable from `useData()` — `staffMembers` or `staff`, whichever it destructures.)

```tsx
<Card className="p-5 space-y-3">
  <h3 className="text-sm font-semibold text-text">Top Collaborations (Co-authorship)</h3>
  {collaborations.length === 0 ? (
    <p className="text-sm text-text-muted">No co-authored publications recorded.</p>
  ) : (
    <ul className="space-y-1.5">
      {collaborations.map(p => (
        <li key={`${p.a}|${p.b}`} className="flex items-center justify-between text-sm">
          <span className="text-text">{p.a} × {p.b}</span>
          <span className="text-xs text-text-muted">
            {p.count} paper{p.count > 1 ? 's' : ''}{p.crossDivision ? ' · cross-division' : ''}
          </span>
        </li>
      ))}
    </ul>
  )}
</Card>
```

- [ ] **Step 6: Health gate + commit**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run src/lib/intelligence/`
Expected: clean.

```bash
git add src/lib/intelligence/collaboration.ts src/lib/intelligence/collaboration.test.ts src/pages/StaffAnalytics.tsx
git commit -m "feat(analytics): co-authorship collaboration analysis with cross-division flag"
```

---

### Task 12: E2E validation on real CSIR documents (manual gate — Phase 4 prerequisite)

Not a coding task — the checklist that turns the above into dissertation evidence. Runbook: `deploy/README.md`. Blockers documented in CLAUDE.md tech debt (service key, WDAC native DLLs, Ollama on host).

- [ ] Apply migrations on target host (incl. `20260707000000_query_log_latency.sql`).
- [ ] Configure `SUPABASE_SERVICE_KEY`, allow native DLLs (WDAC), start Ollama; start `rag/worker.py` + `rag/api.py` per runbook.
- [ ] Upload a representative real-document set (all five data categories) via the SPA; confirm `documents.ingest_status` progresses and `doc_indexes` rows appear.
- [ ] Ask 10 real questions via `/ask`; verify answers ground in citations and deep-links open the right PDF page (Task 2 evidence — source-traceability metric).
- [ ] Run a duplication check from a real proposal (Task 4 evidence); seed 5 known-overlapping topics, record detection rate (target ≥70%).
- [ ] Dump `corpus.json` (query in `run_eval.py` docstring), author ≥20 real Q&A rows in `gold_citations.jsonl`, run `LLM_BACKEND=openllm python rag/eval/run_eval.py`; record citation hit-rate (target ≥80%).
- [ ] Record manual baselines: time 3 representative decision-prep tasks by hand, compare with `query_log.latency_ms` + task timing with the system (decision-prep-time metric, target ≥50% reduction).
- [ ] Save all measured values into `docs/superpowers/eval-results-<date>.md` for the final dissertation report.

---

## Part B — Institutional Data Expansion (Tasks 13–20)

New data domains requested on top of the dissertation gap work. Conventions identical to Part A. New migrations use the `202607070N0000` timestamp series (Task 6 already owns `20260707000000`). DataContext has **no mock fallback** — new entities load empty until rows exist; that is correct behavior.

---

### Task 13: MOU entity — migration, type, mapper, DataContext

**Files:**
- Create: `supabase/migrations/20260707010000_mous.sql`
- Modify: `src/types/index.ts` (after `IPIntelligence`)
- Modify: `src/utils/dataMapper.ts` (after `mapIPIntelligenceRow`)
- Modify: `src/contexts/DataContext.tsx`
- Test: `src/utils/dataMapper.test.ts` (new file)

**Interfaces:**
- Consumes: existing DataContext load pattern (`Promise.all` block at `DataContext.tsx:200-230`, `checkTable`, setters at `:271-294`).
- Produces: `interface MoU` in `src/types`; `mapMoURow(row: any): MoU`; `mous: MoU[]` on `useData()`. Tasks 15/16 consume `mous`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/dataMapper.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mapMoURow } from './dataMapper';

describe('mapMoURow', () => {
  it('maps snake_case row to MoU', () => {
    const m = mapMoURow({
      id: 'u1', partner_name: 'IIT Indore', partner_type: 'Academic',
      purpose: 'Joint research', signed_date: '2025-04-01', valid_until: '2028-03-31',
      status: 'Active', division_code: 'LWMD', linked_project_no: 'GAP-101', remarks: null,
    });
    expect(m).toEqual({
      id: 'u1', partnerName: 'IIT Indore', partnerType: 'Academic',
      purpose: 'Joint research', signedDate: '2025-04-01', validUntil: '2028-03-31',
      status: 'Active', divisionCode: 'LWMD', linkedProjectNo: 'GAP-101', remarks: undefined,
    });
  });

  it('defaults missing fields', () => {
    const m = mapMoURow({ id: 7 });
    expect(m.id).toBe('7');
    expect(m.partnerType).toBe('Other');
    expect(m.status).toBe('Active');
    expect(m.linkedProjectNo).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/dataMapper.test.ts`
Expected: FAIL — `mapMoURow` is not exported.

- [ ] **Step 3: Implement**

`src/types/index.ts`, after the `IPIntelligence` interface (line ~137):

```typescript
export interface MoU {
  id: string;
  partnerName: string;
  partnerType: 'Academic' | 'Industry' | 'Government' | 'International' | 'Other';
  purpose: string;
  signedDate: string;
  validUntil: string;
  status: 'Active' | 'Expired' | 'Under Renewal' | 'Terminated';
  divisionCode: string;
  linkedProjectNo?: string;
  remarks?: string;
}
```

`src/utils/dataMapper.ts` — add `MoU` to the type-only import on line 1, then after `mapIPIntelligenceRow`:

```typescript
export const mapMoURow = (row: any): MoU => ({
  id: String(row.id || ''),
  partnerName: row.partner_name || '',
  partnerType: row.partner_type || 'Other',
  purpose: row.purpose || '',
  signedDate: row.signed_date || '',
  validUntil: row.valid_until || '',
  status: row.status || 'Active',
  divisionCode: row.division_code || '',
  linkedProjectNo: row.linked_project_no || undefined,
  remarks: row.remarks || undefined,
});
```

Create `supabase/migrations/20260707010000_mous.sql`:

```sql
-- MOUs with external organisations (Part B, Task 13)
CREATE TABLE IF NOT EXISTS public.mous (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_name       text NOT NULL,
    partner_type       text NOT NULL DEFAULT 'Other'
                       CHECK (partner_type IN ('Academic','Industry','Government','International','Other')),
    purpose            text NOT NULL DEFAULT '',
    signed_date        date,
    valid_until        date,
    status             text NOT NULL DEFAULT 'Active'
                       CHECK (status IN ('Active','Expired','Under Renewal','Terminated')),
    division_code      text,
    linked_project_no  text,
    remarks            text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mous_status_idx ON public.mous(status);
CREATE INDEX IF NOT EXISTS mous_valid_until_idx ON public.mous(valid_until);

CREATE TRIGGER trg_mous_updated_at
    BEFORE UPDATE ON public.mous
    FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

ALTER TABLE public.mous ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mous_select" ON public.mous FOR SELECT TO authenticated USING (true);

CREATE POLICY "mous_write" ON public.mous FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
```

`src/contexts/DataContext.tsx` — five surgical additions mirroring `ipIntelligence`:
1. Import `MoU` type and `mapMoURow`.
2. Context interface (near line 99): `mous: MoU[];`
3. State (near line 143): `const [mous, setMous] = useState<MoU[]>([]);` — and add `setMous([])` inside `resetAll()`.
4. `Promise.all` destructure adds `mouRes` and the query list adds `supabase.from('mous').select('*'),` (append after the `holidays` line; keep destructure order aligned).
5. `checkTable('mous', mouRes);` and `setMous(mouRes.data ? mouRes.data.map(mapMoURow) : []);` and `mous,` in the provider value object.

- [ ] **Step 4: Run tests + health gate**

Run: `npx vitest run src/utils/dataMapper.test.ts` → PASS. Then `npx tsc --noEmit && npx eslint src/`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260707010000_mous.sql src/types/index.ts src/utils/dataMapper.ts src/utils/dataMapper.test.ts src/contexts/DataContext.tsx
git commit -m "feat: MOU entity — table, type, mapper, DataContext load"
```

---

### Task 14: Tech-transfer entity — migration, type, mapper, DataContext

**Files:**
- Create: `supabase/migrations/20260707020000_tech_transfers.sql`
- Modify: `src/types/index.ts`, `src/utils/dataMapper.ts`, `src/contexts/DataContext.tsx`
- Test: `src/utils/dataMapper.test.ts` (append)

**Interfaces:**
- Consumes: same DataContext pattern as Task 13.
- Produces: `interface TechTransfer`; `mapTechTransferRow(row: any): TechTransfer`; `techTransfers: TechTransfer[]` on `useData()`. Tasks 15/16 consume.

- [ ] **Step 1: Write the failing test**

Append to `src/utils/dataMapper.test.ts`:

```typescript
import { mapTechTransferRow } from './dataMapper';

describe('mapTechTransferRow', () => {
  it('maps row and parses value', () => {
    const t = mapTechTransferRow({
      id: 't1', technology_title: 'Red-mud bricks', licensee: 'ABC Pvt Ltd',
      licensee_type: 'Industry', agreement_type: 'License', agreement_date: '2025-06-15',
      value_lakhs: '25.5', status: 'Active', linked_project_no: 'GAP-101',
      linked_ip_id: 'i9', division_code: 'SCMD', remarks: '',
    });
    expect(t.technologyTitle).toBe('Red-mud bricks');
    expect(t.valueLakhs).toBe(25.5);
    expect(t.linkedIpId).toBe('i9');
  });

  it('defaults missing value to undefined', () => {
    expect(mapTechTransferRow({ id: 1 }).valueLakhs).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/dataMapper.test.ts`
Expected: FAIL — `mapTechTransferRow` is not exported.

- [ ] **Step 3: Implement**

`src/types/index.ts`, after `MoU`:

```typescript
export interface TechTransfer {
  id: string;
  technologyTitle: string;
  licensee: string;
  licenseeType: 'Industry' | 'Startup' | 'PSU' | 'Government' | 'Other';
  agreementType: 'License' | 'Know-how Transfer' | 'Joint Development' | 'Consultancy' | 'Sponsored';
  agreementDate: string;
  valueLakhs?: number;
  status: 'Under Negotiation' | 'Signed' | 'Active' | 'Completed' | 'Terminated';
  linkedProjectNo?: string;
  linkedIpId?: string;
  divisionCode: string;
  remarks?: string;
}
```

`src/utils/dataMapper.ts` (add `TechTransfer` to imports):

```typescript
export const mapTechTransferRow = (row: any): TechTransfer => ({
  id: String(row.id || ''),
  technologyTitle: row.technology_title || '',
  licensee: row.licensee || '',
  licenseeType: row.licensee_type || 'Other',
  agreementType: row.agreement_type || 'License',
  agreementDate: row.agreement_date || '',
  valueLakhs: row.value_lakhs != null && row.value_lakhs !== '' ? parseFloat(row.value_lakhs) : undefined,
  status: row.status || 'Signed',
  linkedProjectNo: row.linked_project_no || undefined,
  linkedIpId: row.linked_ip_id || undefined,
  divisionCode: row.division_code || '',
  remarks: row.remarks || undefined,
});
```

Create `supabase/migrations/20260707020000_tech_transfers.sql`:

```sql
-- Technology transfer / licensing records (Part B, Task 14)
CREATE TABLE IF NOT EXISTS public.tech_transfers (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    technology_title   text NOT NULL,
    licensee           text NOT NULL,
    licensee_type      text NOT NULL DEFAULT 'Other'
                       CHECK (licensee_type IN ('Industry','Startup','PSU','Government','Other')),
    agreement_type     text NOT NULL DEFAULT 'License'
                       CHECK (agreement_type IN ('License','Know-how Transfer','Joint Development','Consultancy','Sponsored')),
    agreement_date     date,
    value_lakhs        numeric(12,2) CHECK (value_lakhs >= 0),
    status             text NOT NULL DEFAULT 'Signed'
                       CHECK (status IN ('Under Negotiation','Signed','Active','Completed','Terminated')),
    linked_project_no  text,
    linked_ip_id       text,
    division_code      text,
    remarks            text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tech_transfers_status_idx ON public.tech_transfers(status);
CREATE INDEX IF NOT EXISTS tech_transfers_division_idx ON public.tech_transfers(division_code);

CREATE TRIGGER trg_tech_transfers_updated_at
    BEFORE UPDATE ON public.tech_transfers
    FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

ALTER TABLE public.tech_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tech_transfers_select" ON public.tech_transfers FOR SELECT TO authenticated USING (true);

CREATE POLICY "tech_transfers_write" ON public.tech_transfers FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
```

`src/contexts/DataContext.tsx` — same five additions as Task 13 with `techTransfers` / `setTechTransfers` / `mapTechTransferRow` / `supabase.from('tech_transfers').select('*')` / `checkTable('tech_transfers', ttRes)`.

- [ ] **Step 4: Run tests + health gate**

`npx vitest run src/utils/dataMapper.test.ts` → PASS; `npx tsc --noEmit && npx eslint src/`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260707020000_tech_transfers.sql src/types/index.ts src/utils/dataMapper.ts src/utils/dataMapper.test.ts src/contexts/DataContext.tsx
git commit -m "feat: tech-transfer entity — table, type, mapper, DataContext load"
```

---

### Task 15: Partnerships page — MOU + Tech Transfer tabs, expiry alerts, admin entry

**Files:**
- Create: `src/lib/partnerships/write.ts`
- Create: `src/lib/partnerships/expiry.ts`
- Test: `src/lib/partnerships/expiry.test.ts`
- Create: `src/pages/Partnerships.tsx`
- Modify: `src/App.tsx` (lazy route), `src/components/layout/Layout.tsx` (`NAV_ITEMS`), `src/constants/access.ts` (`ACCESS_MAP`)

**Interfaces:**
- Consumes: `mous`, `techTransfers` from `useData()` (Tasks 13–14); `MoU`, `TechTransfer` from `src/types`.
- Produces: route `/partnerships`; `expiringWithin(mous: MoU[], days: number, today?: Date): MoU[]`; `addMoU(input) / addTechTransfer(input)` returning `{ ok: true } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/partnerships/expiry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { expiringWithin } from './expiry';
import type { MoU } from '../../types';

function mou(over: Partial<MoU>): MoU {
  return { id: 'm', partnerName: 'X', partnerType: 'Other', purpose: '',
           signedDate: '2024-01-01', validUntil: '2030-01-01', status: 'Active',
           divisionCode: '', ...over };
}

describe('expiringWithin', () => {
  const today = new Date('2026-07-07');
  it('returns active MOUs expiring inside the window, soonest first', () => {
    const out = expiringWithin([
      mou({ id: 'a', validUntil: '2026-08-01' }),
      mou({ id: 'b', validUntil: '2026-07-20' }),
      mou({ id: 'c', validUntil: '2027-01-01' }),
      mou({ id: 'd', validUntil: '2026-08-01', status: 'Terminated' }),
    ], 90, today);
    expect(out.map(m => m.id)).toEqual(['b', 'a']);
  });
  it('includes already-expired Active MOUs (they need action most)', () => {
    const out = expiringWithin([mou({ id: 'e', validUntil: '2026-06-01' })], 90, today);
    expect(out.map(m => m.id)).toEqual(['e']);
  });
  it('skips MOUs with no validUntil', () => {
    expect(expiringWithin([mou({ validUntil: '' })], 90, today)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/partnerships/expiry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement libs**

Create `src/lib/partnerships/expiry.ts`:

```typescript
import type { MoU } from '../../types';

/** Active MOUs whose validity ends within `days` (or already lapsed), soonest first. */
export function expiringWithin(mous: MoU[], days: number, today: Date = new Date()): MoU[] {
  const cutoff = today.getTime() + days * 86400000;
  return mous
    .filter(m => m.status === 'Active' && m.validUntil)
    .filter(m => new Date(m.validUntil).getTime() <= cutoff)
    .sort((a, b) => a.validUntil.localeCompare(b.validUntil));
}
```

Create `src/lib/partnerships/write.ts` (mirrors `registry.ts` non-fatal style; pages never call Supabase directly — this lib is the write boundary):

```typescript
import { supabase } from '../../utils/supabaseClient';
import type { MoU, TechTransfer } from '../../types';

type WriteResult = { ok: true } | { ok: false; error: string };

export async function addMoU(input: Omit<MoU, 'id'>): Promise<WriteResult> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.from('mous').insert({
    partner_name: input.partnerName, partner_type: input.partnerType,
    purpose: input.purpose, signed_date: input.signedDate || null,
    valid_until: input.validUntil || null, status: input.status,
    division_code: input.divisionCode || null,
    linked_project_no: input.linkedProjectNo || null, remarks: input.remarks || null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function addTechTransfer(input: Omit<TechTransfer, 'id'>): Promise<WriteResult> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.from('tech_transfers').insert({
    technology_title: input.technologyTitle, licensee: input.licensee,
    licensee_type: input.licenseeType, agreement_type: input.agreementType,
    agreement_date: input.agreementDate || null,
    value_lakhs: input.valueLakhs ?? null, status: input.status,
    linked_project_no: input.linkedProjectNo || null, linked_ip_id: input.linkedIpId || null,
    division_code: input.divisionCode || null, remarks: input.remarks || null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/partnerships/expiry.test.ts` → PASS.

- [ ] **Step 5: Build the page**

Create `src/pages/Partnerships.tsx` (default export per pages convention). Structure — follow the visual idiom of `src/pages/Divisions.tsx` (cards, semantic tokens):

```tsx
import { useMemo, useState } from 'react';
import { Handshake, ArrowRightLeft, Plus, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { Card, Badge } from '../components/ui/Cards';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { expiringWithin } from '../lib/partnerships/expiry';
import { addMoU, addTechTransfer } from '../lib/partnerships/write';
import type { MoU, TechTransfer } from '../types';

const WRITE_ROLES = ['HRAdmin', 'SystemAdmin', 'MasterAdmin'];

export default function Partnerships() {
  const { mous, techTransfers, refresh } = useData();
  const { user } = useAuth();
  const canWrite = user ? WRITE_ROLES.includes(user.activeRole) : false;
  const [tab, setTab] = useState<'mous' | 'transfers'>('mous');
  const [showForm, setShowForm] = useState(false);

  const expiring = useMemo(() => expiringWithin(mous, 90), [mous]);
  const activeTransfers = useMemo(
    () => techTransfers.filter(t => t.status === 'Active' || t.status === 'Signed'),
    [techTransfers],
  );
  const totalValue = useMemo(
    () => techTransfers.reduce((s, t) => s + (t.valueLakhs ?? 0), 0),
    [techTransfers],
  );
  // ... tab switcher, expiry alert strip (AlertTriangle + expiring list),
  // MOU table (partner, type, purpose, validity, status Badge),
  // transfers table (technology, licensee, agreement, value ₹L, status Badge),
  // admin-only "Add" modal driving addMoU/addTechTransfer then refresh().
}
```

The full JSX follows the table markup used in `Divisions.tsx` (plain `<table>` with `border-border` / `text-text-muted` classes). The add-modal is a controlled form with `useState` per field and inline error string (form-error convention). If `useData()` exposes no `refresh`, check the context for the exported reload function name (`loadData` is internal; the provider exposes a refetch — reuse whatever `DataManagement.tsx` calls after upload) and call that after a successful insert.

Wire-up:
- `src/App.tsx`: `const Partnerships = lazy(() => import('./pages/Partnerships'));` + `<Route path="/partnerships" element={<Partnerships />} />` alongside the other guarded routes.
- `src/components/layout/Layout.tsx` `NAV_ITEMS`: `{ to: '/partnerships', label: 'Partnerships', icon: Handshake }` in the analytics/institutional group (match neighbouring item shape exactly — copy the `/projects` entry's shape).
- `src/constants/access.ts`: `'/partnerships': ['Director', 'DivisionHead', 'Scientist', 'FinanceAdmin', ...ADMINS, 'HRAdmin'] as Role[],`

- [ ] **Step 6: Health gate**

`npx tsc --noEmit && npx eslint src/` → clean. `npm run dev` → open `#/partnerships`, both tabs render (empty state OK).

- [ ] **Step 7: Commit**

```bash
git add src/lib/partnerships/ src/pages/Partnerships.tsx src/App.tsx src/components/layout/Layout.tsx src/constants/access.ts
git commit -m "feat: Partnerships page — MOU + tech-transfer tabs, expiry alerts, admin entry"
```

---

### Task 16: Commercialisation analytics — real transfer revenue (extends Task 9)

**Files:**
- Modify: `src/lib/intelligence/commercialisation.ts` (from Task 9)
- Test: `src/lib/intelligence/commercialisation.test.ts` (append)
- Modify: `src/pages/Intelligence.tsx` (pass `techTransfers` into the Task 9 summary strip)

**Interfaces:**
- Consumes: `TechTransfer` (Task 14), `commercialisationSummary` (Task 9).
- Produces: `commercialisationSummary(ip, projects, transfers?: TechTransfer[])` — `CommercialisationSummary` gains `transferCount: number` and `transferValueLakhs: number`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/intelligence/commercialisation.test.ts`:

```typescript
import type { TechTransfer } from '../../types';

function tt(over: Partial<TechTransfer>): TechTransfer {
  return { id: 't', technologyTitle: 'T', licensee: 'L', licenseeType: 'Industry',
           agreementType: 'License', agreementDate: '2025-01-01', status: 'Active',
           divisionCode: 'SCMD', ...over };
}

describe('commercialisationSummary — tech transfers', () => {
  it('counts and sums non-terminated transfers', () => {
    const s = commercialisationSummary([], [], [
      tt({ valueLakhs: 25.5 }), tt({ valueLakhs: 10 }),
      tt({ status: 'Terminated', valueLakhs: 99 }),
    ]);
    expect(s.transferCount).toBe(2);
    expect(s.transferValueLakhs).toBe(35.5);
  });
  it('defaults to zero when transfers omitted', () => {
    const s = commercialisationSummary([], []);
    expect(s.transferCount).toBe(0);
    expect(s.transferValueLakhs).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run src/lib/intelligence/commercialisation.test.ts` → FAIL (arity / missing fields).

- [ ] **Step 3: Implement**

In `commercialisationSummary`, add optional third parameter `transfers: TechTransfer[] = []`; compute:

```typescript
const live = transfers.filter(t => t.status !== 'Terminated');
// in the returned object:
transferCount: live.length,
transferValueLakhs: live.reduce((s, t) => s + (t.valueLakhs ?? 0), 0),
```

Extend the `CommercialisationSummary` interface accordingly. In `Intelligence.tsx`, the Task 9 call site becomes `commercialisationSummary(ipIntelligence, projects, techTransfers)` (pull `techTransfers` from the existing `useData()` destructure) and the summary strip gains two stat cells: "Transfers" and "Transfer value (₹L)".

- [ ] **Step 4: Run tests + health gate**

`npx vitest run src/lib/intelligence/commercialisation.test.ts` → PASS; `npx tsc --noEmit && npx eslint src/`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/intelligence/commercialisation.ts src/lib/intelligence/commercialisation.test.ts src/pages/Intelligence.tsx
git commit -m "feat: commercialisation summary includes real tech-transfer revenue"
```

---

### Task 17: Patent pipeline analytics — filed → published → granted funnel

**Files:**
- Create: `src/lib/intelligence/patents.ts`
- Test: `src/lib/intelligence/patents.test.ts`
- Create: `src/components/PatentPipelineCard.tsx`
- Modify: `src/pages/Intelligence.tsx` (render card)

**Interfaces:**
- Consumes: `IPIntelligence` from `src/types` (fields: `type`, `status`, `filingDate`, `grantDate`, `divisionCode`).
- Produces: `patentPipeline(ip: IPIntelligence[]): PatentPipeline` where `PatentPipeline = { filed: number; published: number; granted: number; medianMonthsToGrant: number | null; byDivision: { divisionCode: string; filed: number; granted: number }[] }`. Counts are cumulative-stage (a Granted patent was also filed — funnel counts it in all three).

- [ ] **Step 1: Write the failing test**

Create `src/lib/intelligence/patents.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { patentPipeline } from './patents';
import type { IPIntelligence } from '../../types';

function pat(over: Partial<IPIntelligence>): IPIntelligence {
  return { id: 'p', title: 'P', type: 'Patent', status: 'Filed', filingDate: '2024-01-01',
           inventors: [], divisionCode: 'LWMD', ...over };
}

describe('patentPipeline', () => {
  it('builds cumulative funnel over patents only', () => {
    const p = patentPipeline([
      pat({ id: 'a', status: 'Filed' }),
      pat({ id: 'b', status: 'Published' }),
      pat({ id: 'c', status: 'Granted', grantDate: '2026-01-01' }),
      pat({ id: 'd', type: 'Trademark', status: 'Granted' }), // not a patent
    ]);
    expect(p.filed).toBe(3);
    expect(p.published).toBe(2);
    expect(p.granted).toBe(1);
  });

  it('computes median months filing→grant', () => {
    const p = patentPipeline([
      pat({ status: 'Granted', filingDate: '2023-01-01', grantDate: '2025-01-01' }), // 24
      pat({ status: 'Granted', filingDate: '2024-01-01', grantDate: '2025-01-01' }), // 12
      pat({ status: 'Granted', filingDate: '2020-01-01', grantDate: '2023-01-01' }), // 36
    ]);
    expect(p.medianMonthsToGrant).toBe(24);
  });

  it('null median when nothing granted', () => {
    expect(patentPipeline([pat({})]).medianMonthsToGrant).toBeNull();
  });

  it('rolls up per division', () => {
    const p = patentPipeline([
      pat({ divisionCode: 'LWMD', status: 'Granted', grantDate: '2026-01-01' }),
      pat({ divisionCode: 'SCMD' }),
    ]);
    expect(p.byDivision).toEqual([
      { divisionCode: 'LWMD', filed: 1, granted: 1 },
      { divisionCode: 'SCMD', filed: 1, granted: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run src/lib/intelligence/patents.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/lib/intelligence/patents.ts`:

```typescript
import type { IPIntelligence } from '../../types';

export interface PatentPipeline {
  filed: number;
  published: number;
  granted: number;
  medianMonthsToGrant: number | null;
  byDivision: { divisionCode: string; filed: number; granted: number }[];
}

const RANK: Record<string, number> = { Filed: 1, Published: 2, Granted: 3 };

export function patentPipeline(ip: IPIntelligence[]): PatentPipeline {
  const patents = ip.filter(p => p.type === 'Patent');
  const filed = patents.length;
  const published = patents.filter(p => (RANK[p.status] ?? 0) >= 2).length;
  const grantedList = patents.filter(p => p.status === 'Granted');

  const months = grantedList
    .filter(p => p.filingDate && p.grantDate)
    .map(p => (new Date(p.grantDate!).getTime() - new Date(p.filingDate).getTime()) / (30.44 * 86400000))
    .sort((a, b) => a - b);
  const medianMonthsToGrant = months.length
    ? Math.round(months.length % 2 ? months[(months.length - 1) / 2]
                                   : (months[months.length / 2 - 1] + months[months.length / 2]) / 2)
    : null;

  const div = new Map<string, { filed: number; granted: number }>();
  for (const p of patents) {
    const d = div.get(p.divisionCode) ?? { filed: 0, granted: 0 };
    d.filed += 1;
    if (p.status === 'Granted') d.granted += 1;
    div.set(p.divisionCode, d);
  }
  return {
    filed, published, granted: grantedList.length, medianMonthsToGrant,
    byDivision: [...div.entries()]
      .map(([divisionCode, v]) => ({ divisionCode, ...v }))
      .sort((a, b) => a.divisionCode.localeCompare(b.divisionCode)),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run src/lib/intelligence/patents.test.ts` → PASS.

- [ ] **Step 5: Card component + page wiring**

Create `src/components/PatentPipelineCard.tsx` (named export per UI convention):

```tsx
import { useMemo } from 'react';
import { FileBadge } from 'lucide-react';
import { Card } from './ui/Cards';
import { useData } from '../contexts/DataContext';
import { patentPipeline } from '../lib/intelligence/patents';

export function PatentPipelineCard() {
  const { ipIntelligence } = useData();
  const p = useMemo(() => patentPipeline(ipIntelligence), [ipIntelligence]);
  const stages = [
    { label: 'Filed', value: p.filed },
    { label: 'Published', value: p.published },
    { label: 'Granted', value: p.granted },
  ];
  const max = Math.max(p.filed, 1);
  return (
    <Card className="p-5 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
        <FileBadge className="h-4 w-4 text-text-muted" /> Patent pipeline
      </h3>
      {stages.map(s => (
        <div key={s.label} className="space-y-1">
          <div className="flex justify-between text-xs text-text-muted">
            <span>{s.label}</span><span>{s.value}</span>
          </div>
          <div className="h-2 rounded bg-surface-hover">
            <div className="h-2 rounded bg-brand-blue" style={{ width: `${(s.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
      <p className="text-xs text-text-muted">
        {p.medianMonthsToGrant !== null
          ? `Median filing → grant: ${p.medianMonthsToGrant} months`
          : 'No granted patents yet'}
      </p>
    </Card>
  );
}
```

Render `<PatentPipelineCard />` in `Intelligence.tsx` beside the Task 9 commercialisation strip.

- [ ] **Step 6: Health gate + commit**

`npx tsc --noEmit && npx eslint src/` → clean.

```bash
git add src/lib/intelligence/patents.ts src/lib/intelligence/patents.test.ts src/components/PatentPipelineCard.tsx src/pages/Intelligence.tsx
git commit -m "feat: patent pipeline funnel — filed/published/granted + median time-to-grant"
```

---

### Task 18: PhD scholar milestone tracking — from joining to degree award

**Files:**
- Create: `supabase/migrations/20260707030000_phd_milestones.sql`
- Modify: `src/types/index.ts`, `src/utils/dataMapper.ts`, `src/contexts/DataContext.tsx` (same dance as Task 13)
- Create: `src/lib/phd/progress.ts`
- Test: `src/lib/phd/progress.test.ts`
- Create: `src/lib/phd/write.ts`
- Modify: `src/pages/PhDTracker.tsx` (per-scholar progress bar + milestone timeline expand)

**Interfaces:**
- Consumes: `PhDStudent.EnrollmentNo` (join key), DataContext dance.
- Produces: `interface PhDMilestone { id: string; enrollmentNo: string; milestone: PhDMilestoneName; dueDate?: string; completedDate?: string; remarks?: string }`; `PHD_MILESTONE_ORDER: PhDMilestoneName[]`; `scholarProgress(milestones: PhDMilestone[], today?: Date): ScholarProgress`; `phdMilestones: PhDMilestone[]` on `useData()`; `upsertMilestone(input)` write helper.

- [ ] **Step 1: Migration**

Create `supabase/migrations/20260707030000_phd_milestones.sql`:

```sql
-- PhD scholar lifecycle milestones (Part B, Task 18)
CREATE TABLE IF NOT EXISTS public.phd_milestones (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_no   text NOT NULL,
    milestone       text NOT NULL CHECK (milestone IN (
                        'Joining','Coursework','Comprehensive Exam','Registration',
                        'Synopsis Submission','Thesis Submission','Viva Voce','Degree Awarded')),
    due_date        date,
    completed_date  date,
    remarks         text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (enrollment_no, milestone)
);

CREATE INDEX IF NOT EXISTS phd_milestones_enrollment_idx ON public.phd_milestones(enrollment_no);

ALTER TABLE public.phd_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phd_milestones_select" ON public.phd_milestones FOR SELECT TO authenticated USING (true);

CREATE POLICY "phd_milestones_write" ON public.phd_milestones FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
```

- [ ] **Step 2: Write the failing progress-lib test**

Create `src/lib/phd/progress.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { scholarProgress, PHD_MILESTONE_ORDER } from './progress';
import type { PhDMilestone } from '../../types';

function ms(milestone: PhDMilestone['milestone'], over: Partial<PhDMilestone> = {}): PhDMilestone {
  return { id: milestone, enrollmentNo: 'E1', milestone, ...over };
}

describe('scholarProgress', () => {
  const today = new Date('2026-07-07');

  it('orders 8 canonical milestones', () => {
    expect(PHD_MILESTONE_ORDER).toHaveLength(8);
    expect(PHD_MILESTONE_ORDER[0]).toBe('Joining');
    expect(PHD_MILESTONE_ORDER[7]).toBe('Degree Awarded');
  });

  it('computes percent from completed milestones', () => {
    const p = scholarProgress([
      ms('Joining', { completedDate: '2023-08-01' }),
      ms('Coursework', { completedDate: '2024-06-01' }),
      ms('Comprehensive Exam'),
    ], today);
    expect(p.completed).toBe(2);
    expect(p.percent).toBe(25); // 2 of 8
    expect(p.next).toBe('Comprehensive Exam');
  });

  it('flags overdue milestones (due passed, not completed)', () => {
    const p = scholarProgress([ms('Registration', { dueDate: '2026-01-01' })], today);
    expect(p.overdue).toEqual(['Registration']);
  });

  it('empty input → 0%, next = Joining', () => {
    const p = scholarProgress([], today);
    expect(p.percent).toBe(0);
    expect(p.next).toBe('Joining');
    expect(p.overdue).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

`npx vitest run src/lib/phd/progress.test.ts` → FAIL, module not found.

- [ ] **Step 4: Implement type, mapper, context, lib**

`src/types/index.ts` (after `PhDStudent`):

```typescript
export type PhDMilestoneName =
  | 'Joining' | 'Coursework' | 'Comprehensive Exam' | 'Registration'
  | 'Synopsis Submission' | 'Thesis Submission' | 'Viva Voce' | 'Degree Awarded';

export interface PhDMilestone {
  id: string;
  enrollmentNo: string;
  milestone: PhDMilestoneName;
  dueDate?: string;
  completedDate?: string;
  remarks?: string;
}
```

`src/utils/dataMapper.ts`:

```typescript
export const mapPhDMilestoneRow = (row: any): PhDMilestone => ({
  id: String(row.id || ''),
  enrollmentNo: row.enrollment_no || '',
  milestone: row.milestone || 'Joining',
  dueDate: row.due_date || undefined,
  completedDate: row.completed_date || undefined,
  remarks: row.remarks || undefined,
});
```

`src/contexts/DataContext.tsx`: same five additions (`phdMilestones` / `supabase.from('phd_milestones').select('*')` / `checkTable('phd_milestones', ...)`).

Create `src/lib/phd/progress.ts`:

```typescript
import type { PhDMilestone, PhDMilestoneName } from '../../types';

export const PHD_MILESTONE_ORDER: PhDMilestoneName[] = [
  'Joining', 'Coursework', 'Comprehensive Exam', 'Registration',
  'Synopsis Submission', 'Thesis Submission', 'Viva Voce', 'Degree Awarded',
];

export interface ScholarProgress {
  completed: number;
  percent: number;
  next: PhDMilestoneName | null;
  overdue: PhDMilestoneName[];
}

/** Progress for ONE scholar's milestone rows. */
export function scholarProgress(milestones: PhDMilestone[], today: Date = new Date()): ScholarProgress {
  const byName = new Map(milestones.map(m => [m.milestone, m]));
  const done = PHD_MILESTONE_ORDER.filter(n => byName.get(n)?.completedDate);
  const next = PHD_MILESTONE_ORDER.find(n => !byName.get(n)?.completedDate) ?? null;
  const overdue = PHD_MILESTONE_ORDER.filter(n => {
    const m = byName.get(n);
    return m && !m.completedDate && m.dueDate && new Date(m.dueDate).getTime() < today.getTime();
  });
  return {
    completed: done.length,
    percent: Math.round((done.length / PHD_MILESTONE_ORDER.length) * 100),
    next, overdue,
  };
}
```

Create `src/lib/phd/write.ts`:

```typescript
import { supabase } from '../../utils/supabaseClient';
import type { PhDMilestoneName } from '../../types';

export interface MilestoneInput {
  enrollmentNo: string;
  milestone: PhDMilestoneName;
  dueDate?: string;
  completedDate?: string;
  remarks?: string;
}

/** Insert-or-update on (enrollment_no, milestone). */
export async function upsertMilestone(input: MilestoneInput): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.from('phd_milestones').upsert({
    enrollment_no: input.enrollmentNo, milestone: input.milestone,
    due_date: input.dueDate || null, completed_date: input.completedDate || null,
    remarks: input.remarks || null,
  }, { onConflict: 'enrollment_no,milestone' });
  return error ? { ok: false, error: error.message } : { ok: true };
}
```

- [ ] **Step 5: Run tests + health gate**

`npx vitest run src/lib/phd/progress.test.ts` → PASS; `npx tsc --noEmit && npx eslint src/`.

- [ ] **Step 6: PhDTracker UI**

In `src/pages/PhDTracker.tsx`:
- Destructure `phdMilestones` from the existing `useData()` call.
- `const milestonesByScholar = useMemo(() => { const m = new Map<string, PhDMilestone[]>(); for (const row of phdMilestones) { const list = m.get(row.enrollmentNo) ?? []; list.push(row); m.set(row.enrollmentNo, list); } return m; }, [phdMilestones]);`
- In each scholar row/card render, compute `scholarProgress(milestonesByScholar.get(s.EnrollmentNo) ?? [])` and show: thin progress bar (same bar markup as Task 17 card), `next` milestone label, and an amber `Badge` when `overdue.length > 0`.
- Expandable per-scholar timeline: on row click toggle a panel listing `PHD_MILESTONE_ORDER` with completed date / due date / status dot per milestone; for `WRITE_ROLES` (HRAdmin, SystemAdmin, MasterAdmin) each milestone row gets date inputs bound to `upsertMilestone` then data refresh.

- [ ] **Step 7: Health gate + commit**

`npx tsc --noEmit && npx eslint src/` → clean; manual check `#/phd` renders with progress bars (0% when no milestone rows).

```bash
git add supabase/migrations/20260707030000_phd_milestones.sql src/types/index.ts src/utils/dataMapper.ts src/contexts/DataContext.tsx src/lib/phd/ src/pages/PhDTracker.tsx
git commit -m "feat: PhD scholar milestone tracking — timeline, progress, overdue flags"
```

---

### Task 19: Recruitment drive progress — permanent vs project staff funnel

**Files:**
- Create: `supabase/migrations/20260707040000_recruitment_drive_fields.sql`
- Modify: `src/types/index.ts` (`VacancyAdvertisement`), `src/utils/dataMapper.ts` (`mapVacancyAdvertisementRow`)
- Create: `src/lib/recruitment/drives.ts`
- Test: `src/lib/recruitment/drives.test.ts`
- Modify: `src/pages/RecruitmentAnalytics.tsx` (drive-progress section with admin stage control)

**Interfaces:**
- Consumes: `VacancyAdvertisement` from `useData()`.
- Produces: `VacancyAdvertisement` gains `staffCategory: 'Permanent' | 'Project'` and `driveStage: DriveStage`; `DRIVE_STAGES: DriveStage[]`; `drivesByStage(ads: VacancyAdvertisement[]): { stage: DriveStage; permanent: number; project: number }[]`; `setDriveStage(id: string, stage: DriveStage)` write helper.

- [ ] **Step 1: Migration**

Create `supabase/migrations/20260707040000_recruitment_drive_fields.sql`:

```sql
-- Recruitment drive tracking fields (Part B, Task 19)
ALTER TABLE public.vacancy_advertisements
    ADD COLUMN IF NOT EXISTS staff_category text NOT NULL DEFAULT 'Permanent'
        CHECK (staff_category IN ('Permanent','Project')),
    ADD COLUMN IF NOT EXISTS drive_stage text NOT NULL DEFAULT 'Advertised'
        CHECK (drive_stage IN ('Advertised','Applications Closed','Screening',
                               'Interviews','Selection','Offers Issued','Joined','Closed'));
```

(Existing RLS on `vacancy_advertisements` covers the new columns — no policy change.)

- [ ] **Step 2: Write the failing test**

Create `src/lib/recruitment/drives.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { drivesByStage, DRIVE_STAGES } from './drives';
import type { VacancyAdvertisement } from '../../types';

function ad(over: Partial<VacancyAdvertisement>): VacancyAdvertisement {
  return { id: 'v', title: 'T', description: '', designation: '', division: '',
           numberOfPositions: 1, qualifications: '', applicationDeadline: '',
           createdAt: '', status: 'Open', staffCategory: 'Permanent',
           driveStage: 'Advertised', ...over };
}

describe('drivesByStage', () => {
  it('has 8 ordered stages', () => {
    expect(DRIVE_STAGES[0]).toBe('Advertised');
    expect(DRIVE_STAGES).toHaveLength(8);
  });

  it('splits counts by staff category per stage', () => {
    const rows = drivesByStage([
      ad({ driveStage: 'Interviews' }),
      ad({ driveStage: 'Interviews', staffCategory: 'Project' }),
      ad({ driveStage: 'Joined', staffCategory: 'Project' }),
    ]);
    const interviews = rows.find(r => r.stage === 'Interviews')!;
    expect(interviews.permanent).toBe(1);
    expect(interviews.project).toBe(1);
    expect(rows.find(r => r.stage === 'Joined')!.project).toBe(1);
    expect(rows.find(r => r.stage === 'Advertised')!.permanent).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

`npx vitest run src/lib/recruitment/drives.test.ts` → FAIL (module not found; type errors on new fields).

- [ ] **Step 4: Implement**

`src/types/index.ts` — extend `VacancyAdvertisement`:

```typescript
  staffCategory: 'Permanent' | 'Project';
  driveStage: 'Advertised' | 'Applications Closed' | 'Screening' | 'Interviews'
            | 'Selection' | 'Offers Issued' | 'Joined' | 'Closed';
```

`src/utils/dataMapper.ts` — in `mapVacancyAdvertisementRow` add:

```typescript
  staffCategory: row.staff_category || 'Permanent',
  driveStage: row.drive_stage || 'Advertised',
```

Create `src/lib/recruitment/drives.ts`:

```typescript
import { supabase } from '../../utils/supabaseClient';
import type { VacancyAdvertisement } from '../../types';

export type DriveStage = VacancyAdvertisement['driveStage'];

export const DRIVE_STAGES: DriveStage[] = [
  'Advertised', 'Applications Closed', 'Screening', 'Interviews',
  'Selection', 'Offers Issued', 'Joined', 'Closed',
];

export function drivesByStage(ads: VacancyAdvertisement[]) {
  return DRIVE_STAGES.map(stage => ({
    stage,
    permanent: ads.filter(a => a.driveStage === stage && a.staffCategory === 'Permanent').length,
    project: ads.filter(a => a.driveStage === stage && a.staffCategory === 'Project').length,
  }));
}

export async function setDriveStage(id: string, stage: DriveStage): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.from('vacancy_advertisements').update({ drive_stage: stage }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
```

- [ ] **Step 5: Run tests + health gate**

`npx vitest run src/lib/recruitment/drives.test.ts` → PASS. `npx tsc --noEmit` — fix any other constructor sites of `VacancyAdvertisement` (test fixtures, mock data) by adding the two new fields.

- [ ] **Step 6: RecruitmentAnalytics section**

In `src/pages/RecruitmentAnalytics.tsx` add a "Drive progress" card:
- `const funnel = useMemo(() => drivesByStage(vacancyAdvertisements), [vacancyAdvertisements]);`
- Render an 8-row stage table with Permanent / Project count columns (skip all-zero rows only if the table would otherwise exceed the card).
- Below it, an admin-only (`HRAdmin`/`SystemAdmin`/`MasterAdmin` via `useAuth().user.activeRole`) list of open drives, each with a `<select>` of `DRIVE_STAGES` bound to `setDriveStage(ad.id, value)` followed by data refresh — same refresh mechanism as Task 15 Step 5.

- [ ] **Step 7: Health gate + commit**

`npx tsc --noEmit && npx eslint src/` → clean.

```bash
git add supabase/migrations/20260707040000_recruitment_drive_fields.sql src/types/index.ts src/utils/dataMapper.ts src/lib/recruitment/ src/pages/RecruitmentAnalytics.tsx
git commit -m "feat: recruitment drive funnel — stage tracking, permanent vs project split"
```

---

### Task 20: R&D lifecycle monitor — proposal conceptualisation → project → reports

**Files:**
- Create: `src/lib/intelligence/lifecycle.ts`
- Test: `src/lib/intelligence/lifecycle.test.ts`
- Create: `src/pages/RnDMonitor.tsx`
- Modify: `src/App.tsx` (lazy route, wrapped in the same providers as the `/proposals` and `/reports` routes), `src/components/layout/Layout.tsx`, `src/constants/access.ts`

**Interfaces:**
- Consumes: `Proposal` (`src/types/proposal.ts` — `status: ProposalStatus`, `linkedProjectNo`, `requestedBudget`, `divisionCode`, `title`), `ProjectInfo` (`src/types` — `ProjectNo`, `ProjectStatus`, `SanctionedCost`, `UtilizedAmount`), `ProjectReport` (`src/types/projectReport.ts` — `projectNo`, `status`, `periodLabel`). Data hooks: `useProposals()`, `useData()`, `useProjectReports()`.
- Produces: `lifecycleThreads(proposals, projects, reports): LifecycleThread[]` where `LifecycleThread = { key: string; title: string; divisionCode: string; stage: LifecycleStage; proposalStatus?: string; projectNo?: string; reportCount: number; lastReport?: string }` and `LifecycleStage = 'Concept' | 'Under Evaluation' | 'Sanctioned' | 'Execution' | 'Completed' | 'Dropped'`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/intelligence/lifecycle.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { lifecycleThreads, stageOfProposal } from './lifecycle';
import type { Proposal } from '../../types/proposal';
import type { ProjectInfo } from '../../types';
import type { ProjectReport } from '../../types/projectReport';

const prop = (over: Partial<Proposal>): Proposal => ({
  id: 'p1', proposalCode: 'PC-1', title: 'Nano coatings', acronym: null,
  domainTheme: '', fundType: '', sponsorType: '', sponsorName: '',
  projectCategory: '', proposedStartDate: '', proposedDurationMonths: 12,
  requestedBudget: 0, piUserId: 'u', piName: '', divisionCode: 'LWMD',
  abstract: '', problemStatement: '', objectives: '', expectedOutcomes: '',
  currentTrl: null, targetTrl: null, status: 'DRAFT', reviewBody: null,
  reviewSentDate: null, revisionNotes: null, rejectionReason: null,
  sanctionedAmount: null, sanctionDate: null, omNumber: null, omDate: null,
  linkedProjectNo: null, archived: false, createdAt: '', updatedAt: '',
  submittedAt: null, createdBy: 'u', ...over,
} as Proposal);

const proj = (over: Partial<ProjectInfo>): ProjectInfo => ({
  ProjectID: 'GAP-1', ProjectNo: 'GAP-1', ProjectName: 'Nano coatings', FundType: '',
  SponsorerType: '', SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Ongoing',
  StartDate: '', CompletioDate: '', SanctionedCost: '', UtilizedAmount: '',
  PrincipalInvestigator: '', DivisionCode: 'LWMD', Extension: '', ApprovalAuthority: '',
  ...over,
});

const rep = (over: Partial<ProjectReport>): ProjectReport => ({
  id: 'r1', projectNo: 'GAP-1', projectName: '', divisionCode: null,
  periodType: 'QUARTERLY', periodLabel: 'Q1 2026', dueDate: null, status: 'SUBMITTED',
  objectivesProgress: '', milestones: '', expenditureSummary: '', outcomes: '',
  remarks: '', reviewNotes: null, reviewedBy: null, ...over,
} as ProjectReport);

describe('stageOfProposal', () => {
  it('maps proposal statuses to lifecycle stages', () => {
    expect(stageOfProposal('DRAFT')).toBe('Concept');
    expect(stageOfProposal('SUBMITTED')).toBe('Under Evaluation');
    expect(stageOfProposal('UNDER_REVIEW')).toBe('Under Evaluation');
    expect(stageOfProposal('REVISION_REQUESTED')).toBe('Under Evaluation');
    expect(stageOfProposal('RECOMMENDED')).toBe('Under Evaluation');
    expect(stageOfProposal('APPROVED')).toBe('Sanctioned');
    expect(stageOfProposal('OM_ISSUED')).toBe('Sanctioned');
    expect(stageOfProposal('LINKED')).toBe('Execution');
    expect(stageOfProposal('REJECTED')).toBe('Dropped');
    expect(stageOfProposal('ARCHIVED')).toBe('Dropped');
  });
});

describe('lifecycleThreads', () => {
  it('links proposal → project → reports into one Execution thread', () => {
    const threads = lifecycleThreads(
      [prop({ status: 'LINKED', linkedProjectNo: 'GAP-1' })],
      [proj({})],
      [rep({}), rep({ id: 'r2', periodLabel: 'Q2 2026' })],
    );
    expect(threads).toHaveLength(1);
    expect(threads[0].stage).toBe('Execution');
    expect(threads[0].projectNo).toBe('GAP-1');
    expect(threads[0].reportCount).toBe(2);
    expect(threads[0].lastReport).toBe('Q2 2026');
  });

  it('completed project → Completed stage', () => {
    const threads = lifecycleThreads(
      [prop({ status: 'LINKED', linkedProjectNo: 'GAP-1' })],
      [proj({ ProjectStatus: 'Completed' })], [],
    );
    expect(threads[0].stage).toBe('Completed');
  });

  it('projects without proposals still appear as Execution threads', () => {
    const threads = lifecycleThreads([], [proj({ ProjectNo: 'OLP-9', ProjectName: 'Legacy' })], []);
    expect(threads).toHaveLength(1);
    expect(threads[0].title).toBe('Legacy');
    expect(threads[0].stage).toBe('Execution');
  });

  it('unlinked proposals appear at their proposal stage', () => {
    const threads = lifecycleThreads([prop({ status: 'SUBMITTED' })], [], []);
    expect(threads[0].stage).toBe('Under Evaluation');
    expect(threads[0].projectNo).toBeUndefined();
  });
});
```

(If `Proposal` field names differ from the fixture — check `src/types/proposal.ts:41-89` and correct the fixture, not the lib.)

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run src/lib/intelligence/lifecycle.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/lib/intelligence/lifecycle.ts`:

```typescript
import type { Proposal, ProposalStatus } from '../../types/proposal';
import type { ProjectInfo } from '../../types';
import type { ProjectReport } from '../../types/projectReport';

export type LifecycleStage =
  | 'Concept' | 'Under Evaluation' | 'Sanctioned' | 'Execution' | 'Completed' | 'Dropped';

export interface LifecycleThread {
  key: string;
  title: string;
  divisionCode: string;
  stage: LifecycleStage;
  proposalStatus?: string;
  projectNo?: string;
  reportCount: number;
  lastReport?: string;
}

const STAGE_MAP: Record<ProposalStatus, LifecycleStage> = {
  DRAFT: 'Concept',
  SUBMITTED: 'Under Evaluation',
  UNDER_REVIEW: 'Under Evaluation',
  REVISION_REQUESTED: 'Under Evaluation',
  RECOMMENDED: 'Under Evaluation',
  APPROVED: 'Sanctioned',
  OM_ISSUED: 'Sanctioned',
  LINKED: 'Execution',
  REJECTED: 'Dropped',
  ARCHIVED: 'Dropped',
};

export function stageOfProposal(status: ProposalStatus): LifecycleStage {
  return STAGE_MAP[status] ?? 'Concept';
}

const isCompleted = (p: ProjectInfo) => /complete/i.test(p.ProjectStatus);

export function lifecycleThreads(
  proposals: Proposal[], projects: ProjectInfo[], reports: ProjectReport[],
): LifecycleThread[] {
  const reportsByProject = new Map<string, ProjectReport[]>();
  for (const r of reports) {
    const list = reportsByProject.get(r.projectNo) ?? [];
    list.push(r);
    reportsByProject.set(r.projectNo, list);
  }
  const projectByNo = new Map(projects.map(p => [p.ProjectNo, p]));
  const linkedNos = new Set<string>();
  const threads: LifecycleThread[] = [];

  for (const prop of proposals) {
    const project = prop.linkedProjectNo ? projectByNo.get(prop.linkedProjectNo) : undefined;
    if (prop.linkedProjectNo) linkedNos.add(prop.linkedProjectNo);
    const reps = project ? (reportsByProject.get(project.ProjectNo) ?? []) : [];
    threads.push({
      key: `prop-${prop.id}`,
      title: prop.title,
      divisionCode: prop.divisionCode,
      stage: project && isCompleted(project) ? 'Completed' : stageOfProposal(prop.status),
      proposalStatus: prop.status,
      projectNo: project?.ProjectNo,
      reportCount: reps.length,
      lastReport: reps.length ? reps[reps.length - 1].periodLabel : undefined,
    });
  }

  for (const p of projects) {
    if (linkedNos.has(p.ProjectNo)) continue; // already part of a proposal thread
    const reps = reportsByProject.get(p.ProjectNo) ?? [];
    threads.push({
      key: `proj-${p.ProjectNo}`,
      title: p.ProjectName,
      divisionCode: p.DivisionCode,
      stage: isCompleted(p) ? 'Completed' : 'Execution',
      projectNo: p.ProjectNo,
      reportCount: reps.length,
      lastReport: reps.length ? reps[reps.length - 1].periodLabel : undefined,
    });
  }
  return threads;
}
```

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run src/lib/intelligence/lifecycle.test.ts` → PASS.

- [ ] **Step 5: RnDMonitor page + wiring**

Create `src/pages/RnDMonitor.tsx` (default export):
- Data: `const { proposals } = useProposals(); const { projects } = useData(); const { reports } = useProjectReports();` — verify hook return-field names against `ProposalsContext.tsx` / `ProjectReportsContext.tsx` before use and adjust destructures to the actual names.
- `const threads = useMemo(() => lifecycleThreads(proposals, projects, reports), [proposals, projects, reports]);`
- Header stat strip: count per stage (`Concept / Under Evaluation / Sanctioned / Execution / Completed / Dropped`) as six small stat cells.
- Body: stage-grouped list — for each stage in order, a section with its threads (title, division `Badge`, `projectNo` if present, `reportCount` + `lastReport` as "Reports: 3 (latest Q2 2026)"), stage colors via existing badge variants only.
- Division filter `<select>` (All + distinct divisionCodes), filter via `useMemo`.

Wire-up:
- `src/App.tsx`: lazy import + `<Route path="/rnd-monitor" element={<RnDMonitor />} />` — placed inside the same provider nesting that wraps the `/proposals` and `/reports` routes (check how App.tsx scopes `ProposalsProvider` / `ProjectReportsProvider`; if route-scoped, wrap this route the same way).
- `Layout.tsx` `NAV_ITEMS`: `{ to: '/rnd-monitor', label: 'R&D Monitor', icon: Activity }` (`Activity` from lucide-react).
- `access.ts`: `'/rnd-monitor': ['Director', 'DivisionHead', 'Scientist', 'FinanceAdmin', ...ADMINS] as Role[],`

- [ ] **Step 6: Health gate + commit**

`npx tsc --noEmit && npx eslint src/` → clean; `npm run dev` → `#/rnd-monitor` renders stage groups.

```bash
git add src/lib/intelligence/lifecycle.ts src/lib/intelligence/lifecycle.test.ts src/pages/RnDMonitor.tsx src/App.tsx src/components/layout/Layout.tsx src/constants/access.ts
git commit -m "feat: R&D lifecycle monitor — proposal conceptualisation to project reporting"
```

---

## Execution order & dependencies

```
Part A:
Task 1 ─→ Task 2 ─→ Task 4
   └────→ Task 3 ─┘
Task 5, 6, 8, 9, 10, 11 — independent, any order
Task 7 depends on Task 1 (docs shape)

Part B:
Task 13 ─→ Task 15 (page needs mous)
Task 14 ─→ Task 15 (page needs techTransfers)
Task 14 ─→ Task 16 (needs TechTransfer type); Task 16 also depends on Task 9
Task 17, 18, 19, 20 — independent of each other and of Part A
  (Task 17 shares Intelligence.tsx with Tasks 9/10 — execute after Task 9
   to avoid merge friction on the same page)

Task 12 last (needs 1–7 shipped to host; Part B entities join the same
E2E pass — MOU/transfer/milestone rows entered on the host count as the
"five data categories" evidence for Mid-sem Annexure-2)
```

## Self-review notes

- Spec coverage: all six dissertation use cases + 5 eval metrics + governance visibility mapped (traceability table in Global Constraints). Part B covers the six supervisor-added domains: patents pipeline (T17), tech transfer (T14–16), MOUs (T13/15), PhD scholar tracking from joining (T18), recruitment drives for permanent + project staff (T19), R&D monitoring from proposal conceptualisation (T20).
- Deliberately out of scope (YAGNI, per ponytail): network-graph visualization (list suffices for validation), RagMonitor latency chart (data recorded; chart when needed), multi-institute scalability (design-doc work for the dissertation text, not code), Excel-upload (`dataMigration.ts`) support for MOUs/tech-transfers (admin form entry suffices for pilot volume — add sheet mappings when bulk import is actually requested), per-candidate application pipeline (DB `vacancy_posts` schema drift vs SPA type is pre-existing; drive-level stages avoid it).
- Type consistency: `AskCitation.storage_path` (Task 2) matches rag `Citation.storage_path` (Task 1) and `/similar` dict keys (Task 3); `flatten` 4-tuple used consistently in Tasks 1/3. Part B: `MoU`/`TechTransfer` field names in mapper tests (T13/14) match the type defs and the `write.ts` insert payloads (T15); `commercialisationSummary` third param (T16) matches Task 9's signature extension; `VacancyAdvertisement.driveStage` union (T19) matches `DRIVE_STAGES` and the migration CHECK list; `LifecycleStage`/`stageOfProposal` (T20) covers all ten `ProposalStatus` values from `src/types/proposal.ts`.
- Known verify-at-execution points (flagged inline): `useData()` refresh function name (T15 Step 5), `Proposal` camelCase field names in the T20 test fixture, provider nesting for `/rnd-monitor` route (T20 Step 5).
