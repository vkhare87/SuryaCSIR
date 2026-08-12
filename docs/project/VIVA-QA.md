# VIVA / Presentation Q&A

Prepared answers for the examiners (Supervisor Dr. Dipen Kumar Rajak, Additional
Examiner Shri Shiv Singh Patel, BITS faculty). Every answer is grounded in the
report (§ refs) and the repo (file refs). Say the answer in 2–3 sentences, point
at the evidence, and never overclaim. The honest caveats are already built into
the answers below — they are strengths when you state them first.

---

## A. Motivation & framing

**A1. Why is this a FinTech dissertation?**
The institute allocates public capital every year — sanctions projects, deploys
salaried expertise, prices instrument time, licenses IP. Each use case maps to a
financial discipline: portfolio monitoring (UC-1), cost avoidance (UC-2),
underwriting (UC-4), asset monetisation (UC-5), early positioning (UC-6). The
evaluation is denominated in time and rupees, not uptime. Boundary stated in the
report: the system supports monitoring, screening, and evidence assembly — it
does not run allocation optimisation. (§1.1, §3.4)

**A2. What problem does SURYA actually solve?**
CSIR-AMPRI had the data but not the recall: records were scattered across
departments and formats, decisions depended on manually compiled reports and
individual memory, and retirement removed working knowledge. SURYA makes
institutional memory queryable on demand, with every answer traceable to a
governed source. (§1)

**A3. Why build instead of buy?**
Three filters eliminate the commercial field before price is considered: data
sovereignty (restricted data cannot route through foreign-jurisdiction clouds),
row-level governance (no product enforces per-row entitlement on AI answers in
the database), and workflow fit (memory must be captured as a by-product of
work, not as an extra filing duty). The surviving option — self-hosted open
source — is also the cheapest over five years. (§3.5.2–3.5.3)

**A4. Is the system live? Who uses it?**
A working pilot runs at CSIR-AMPRI on the institute's own records: 12 divisions,
107 staff, 82 projects, 25 real technology-transfer agreements worth ₹2.25 crore,
and 5 real institute documents indexed for retrieval. Production status needs the
Director's sanction and nominated data stewards (§10.2). Demo data note: the dev
seed account `master@test.local` exists in `supabase/seed.sql`.

**A5. What was the hardest part?**
Schema design for mixed data (tabular financial + long-form text) — the main
Phase-2 slippage, resolved by the content-plus-metadata model; and the grounding
invariant, which took a structural fix (empty retrieval forces the refusal path)
after early versions could produce fluent but ungrounded answers. (§5.1, §9)

---

## B. Architecture & design

**B1. Walk us through the architecture.**
Three layers plus governance. Layer 1: ingestion pipeline + PostgreSQL knowledge
repository + unified document registry. Layer 2: 14 role-scoped dashboards and
decision-support analytics. Layer 3: Python FastAPI retrieval service (PageIndex
tree reasoning, three-mode router, grounding refusal) behind the Ask SURYA
interface. Governance spans all layers: RBAC, RLS, access tiers, audit. (§6.2,
Annexure-1; `docs/ARCHITECTURE.md`)

**B2. Why PostgreSQL/Supabase?**
Row-Level Security is the hard gate — enforced in the database on every path,
including AI answers, under the caller's own credentials. Schema is maintained as
versioned migrations (31 files), so any environment is reproducible — the basis
of the multi-laboratory scalability claim. (§6.7, Annexure-6)

**B3. How does data enter the system?**
Two paths. Structured: the Data Management console — upload Excel/CSV → column
mapping detection → validation with a cleaning UI → import (`src/utils/dataMigration.ts`).
Unstructured: the document registry — every workflow (proposal, report, minute,
annexure) files its PDF automatically; a background worker parses it (with an OCR
branch), builds the tree index, and marks it indexed or failed with a reason.
Users never "upload to the AI". (Annexure-3)

**B4. What is the content-plus-metadata design?**
Instead of forcing heterogeneous content into one rigid schema, each item keeps
its content plus a consistent metadata set (source category, division, type,
date, access tier). HR-side field names deliberately mirror the institute's
Excel headers so uploads are transparent to the staff who own the spreadsheets.
(§6.3.1)

**B5. How are workflow state machines enforced?**
Proposal, progress-report, and PMS statuses change only through SECURITY DEFINER
database procedures that check preconditions and write audit rows — the
interface can never patch a status. (§6.7; e.g. `supabase/migrations/20260712000004_pms.sql`)

**B6. Why React + TypeScript + Vite + Tailwind?**
End-to-end type safety, fast iteration, and a chart stack (ReCharts) suited to
dashboard density; 14 role dashboards share one data foundation. (§6.1;
`package.json`)

---

## C. RAG / intelligence layer

**C1. What is PageIndex and why not vector RAG?**
Each document is parsed into a hierarchical tree of sections and pages;
retrieval is the LLM reasoning over the tree — reading the table of contents,
choosing sections, descending, extracting passages. Two reasons: institutional
documents are long and structured, and tree reasoning respects that structure
where fixed-size chunks destroy it; and every retrieval step is inspectable —
which sections were considered and chosen — which an auditor can verify, unlike
an opaque similarity score. No vector database, no chunking. (§6.6.1; `rag/pageindex.py`, `rag/retrieval.py`)

**C2. How does the three-mode router work?**
The question is classified first: `structured` (counts/sums over governed tables),
`document` (content from indexed documents), `hybrid` (both). The mode is shown
as a badge on every answer so the user always knows what kind of evidence they
are reading. (§6.6.2; `rag/router.py`)

**C3. How is the grounding guarantee enforced?**
Structurally, not by instruction: an empty retrieval or blank context forces the
fixed refusal "Not found in institute documents." with zero citations, and the
answering model receives retrieved context only. Out-of-corpus control questions
("What is the capital of France?") were refused with zero citations in every
validation run — that is evidence for the M3 figure, not just an architectural
claim. (§6.6.3; `rag/retrieval.py` refusal path; `rag/eval/log_queries.py`)

**C4. What stops the AI from running arbitrary SQL?**
Structured mode can only invoke a whitelist of reviewed, tested analytic
functions (expenditure summary, budget variance, patent pipeline, expertise
search, succession risk, …). Free-form SQL is never generated or executed.
(§6.6.2; `rag/analytics.py` + `rag/tests/test_analytics.py`)

**C5. Why are citations clickable?**
Each document answer carries page-level citations that open the source PDF at
the cited page via a signed, entitlement-checked URL — the same storage policy
that gates the document itself. (§6.6.2)

**C6. Local model vs hosted API?**
Production design is a locally hosted open LLM on institute hardware — data
sovereignty and zero per-query cost. During development and for the evaluation
runs, a hosted API was used, budgeted and logged, exactly as the report permits
(§6.7, Annexure-6). The measured result that matters: the local 8B model
answered gold questions correctly with precise citations — quality holds
locally; speed on CPU-only hardware is the only limitation, and that is a
hardware question, not an accuracy compromise. (`docs/project/VIVA-PLAN.md` model-runtime decision)

**C7. What if the corpus doesn't contain the answer?**
The system refuses rather than fabricates. That was received positively by senior
staff during feedback sessions — read as honesty, not weakness — and it is the
property that makes the tool safe in front of decision-makers. (§6.9.1 qualitative findings)

---

## D. Evaluation & metrics

**D1. What is the evaluation design?**
Baseline-versus-target, per the supervisor's mid-semester guidance: manual
baselines for five decision tasks were captured before any system-assisted use,
so "before" measurements could not be contaminated. Indicators M1–M6 each have a
named instrument; the instruments are reproduced in Annexure-4 so every figure
is independently re-derivable. (§4.3)

**D2. How was retrieval accuracy (M2) measured?**
A gold set of 14 questions authored from the indexed documents *before* any
question was put to the system — for each item the source document and section
were selected first, the question was written second. A case scores a hit when
the returned citations include the recorded source. The harness measured 1.00
(14/14) on the final run (earlier runs 0.93). We report the run whose
`eval_report.md` we submit, as one run rather than a mean — with 14 questions, a
single flip moves the figure by 7 points. (§6.9.1; `rag/eval/run_eval.py` → `rag/eval/eval_report.md`)

**D3. Isn't a 14-question gold set too small?**
Yes, and the report says so: the result is reported as a fraction, not a bare
percentage; and retrieval over a pilot corpus is an easier problem than at
institute scale. What it establishes is that the mechanism works as designed on
real institute documents. The instrument is repeatable and should be re-run as
the corpus grows — that is recommendation R4 in §10.2.

**D4. How credible is the M1 time saving?**
It is a trial observation by the process owner (Business Head, PME Division):
the preparation step of one externally sanctioned project went from ~1–2 working
days to ~2 hours. It is demonstration evidence in the DSR sense, not a
controlled timing study, and it is confined to the preparation step — the
sanction-to-disbursement approval chain is untouched. (§6.9.2)

**D5. Recall 0.90 but precision 0.38 — how do you defend that?**
The report's target for M4 is recall ≥70%, which is met (0.90). Precision is
additional instrumentation: part of the miss is a labelling artifact — each
seeded topic lists only two known-overlapping sections while the corpus
genuinely contains more, so a correct flag on an unlabelled-but-genuine overlap
counts against precision. And the workflow asymmetry justifies tuning toward
recall: a false positive costs a human evaluator a minute of reading with
citations in hand; a false negative can cost the price of a duplicated project.
(§6.9.2; `rag/eval/gold_duplication.jsonl`)

**D6. Why do you report run-to-run variance?**
Hosted inference is not bit-reproducible: two harness runs on identical code and
corpus gave M2 = 0.93 then 1.00, and M4b = 0.41 then 0.38. Owning that variance
is more credible than presenting a single polished percentage — and the
instruments are designed so anyone can re-run them. (VIVA-PLAN measured results)

**D7. What is M3 evidence exactly?**
Architecturally enforced and empirically confirmed from the query log: 8 of 8
non-refusal document answers carried at least one citation, and all 7 refusals —
including three deliberately out-of-corpus controls — returned exactly zero
citations. (§6.9; `rag/eval/log_queries.py` run)

**D8. What are the honest limitations of the evaluation?**
Single site, pilot-scale corpus, small gold set, trial-based M1, direction-of-
travel claims rather than statistical significance. Every limitation is stated
in the report with the corresponding re-measurement plan (§6.9.1, §10.2) — that
is deliberate, so the numbers can be trusted.

---

## E. Governance & security

**E1. How is access control enforced on AI answers?**
Row-level security in PostgreSQL is the single hard gate on every path. The
interface and the retrieval service both act under the caller's own token, so an
AI answer can only ever be built from rows and documents the asker could open
directly. (§6.7)

**E2. What are the document access tiers?**
`institute` / `division` / `owner` / `confidential`, shown as badges and enforced
by database and storage policies. (§6.7; migrations `20260718000001_rls_scope_reads.sql` etc.)

**E3. Can a user distinguish "does not exist" from "not entitled"?**
No — and that is correct information-security behaviour. The entitlement probe
validated this: a question whose only evidence lies above the asker's tier is
refused identically to an out-of-corpus question. (Annexure-7, A7.6)

**E4. What is audited?**
HR-data changes and appraisal actions in a merged, badged timeline for data
administrators; and the query log records who asked what, in which mode, at what
latency, with what feedback. (§6.7; `src/pages/pms/AuditLog.tsx`, `query_log` table)

**E5. Where does the data physically live?**
Institute server; local model runtime; hosted APIs used in development only,
budgeted and logged. (§6.7, Annexure-6; `deploy/README.md`)

---

## F. Business case & make-or-buy

**F1. What does the system cost?**
One-time development delivered within the dissertation at no procurement cost;
recurring cost is essentially server power and part-time administrator attention
for ingestion monitoring and access approvals. Licence, subscription, and
per-query lines are permanently zero. (§6.10.3)

**F2. What is the payback?**
The time recovered in sanction processing alone is of the same order as the
running cost within the first year; the duplication and collaboration benefit
sits on top, unpriced. The investment case rests on continued use, which is why
the implementation strategy concentrates on adoption cadence. (§6.10.3)

**F3. Why is the duplication benefit not priced in rupees?**
Because the observed effect is rarely a cancelled project. The similar-work
check at proposal stage leads to scope differentiation or a shared-equipment
collaboration — both conserve capital, neither produces a saved-project line
item. Pricing it would require assuming cancellations that do not occur; the
report declines to invent that figure. (The harness does contain a model —
recall × average project cost × assumed attempts, ~₹28–56 lakh/year at 1–2
attempts — available if the institute ever wants it, reported as a sensitivity
band, not an estimate.) (§6.10.2)

**F4. Your §6.10.1 table says "avg 3 Hour per task" — inconsistent with §6.9?**
Correct — that is a typo to fix before submission. The trial record is a single
observation: ~1–2 working days → ~2 hours for one sanction-preparation instance;
the report should not claim an average over repeated instances it did not run.
(Being able to say this is exactly the kind of correction a viva panel respects.)

**F5. Why does the eval harness print ₹43.2 lakh for M6 while the report keeps it qualitative?**
The harness implements the model from §6.10.2 as a mechanical calculation; the
report deliberately reports M6 qualitatively because the benefit is realised as
scope differentiation and collaboration, not as an attributed rupee figure. The
two are consistent: the model exists, the report chooses not to present its
output as a claim. (`rag/eval/run_eval.py`; §6.10.2)

---

## G. Scalability & future work

**G1. How does a 37-laboratory network work without centralising data?**
Per-laboratory instances — each lab runs its own repository, registry, and
retrieval service under its own access control — with a federated query tier for
cross-lab questions under negotiated policies. Because entitlement is enforced
at row level per instance, federation inherits it by composition: a cross-lab
query returns only what the asking lab has been granted. Local models per site
keep documents on-site. Replication cost per lab is hardware only, since the
schema is reproducible from versioned migrations. (§10.3)

**G2. What is the first federated use case?**
Cross-laboratory duplication detection — clearest financial return and the
least sensitive data footprint (titles, abstracts, public outputs). (§10.4)

**G3. What is the most important future work?**
Portfolio construction on top of portfolio monitoring (Markowitz-style
allocation over the project book is now data-feasible), temporal analytics over
the accumulating appraisal/report corpus, and continuous measurement from the
query log instead of periodic studies. (§10.4)

---

## H. Practical & demo questions

**H1. Show me the duplication check.**
`#/proposals` → open any proposal → "Check for similar work" → ranked prior work
with page-level citations into the underlying reports/proposals.
(`src/components/SimilarWorkPanel.tsx`; `/similar` endpoint)

**H2. Show me a refusal.**
Ask "What is the capital of France?" → "Not found in institute documents." with
zero citations. This is the strongest single demo of the grounding invariant.

**H3. Show me the two answer modes.**
Structured: "How many projects does each division run?" — computed answer naming
its source table, STRUCTURED badge. Document: "Which AMPRI technologies were
licensed to companies between January 2020 and February 2021?" — cited answer
from the licensing register PDF, DOCUMENT badge, clickable citations.

**H4. What happens if the live demo fails?**
Structured mode needs no documents; the refusal path always works; and the
screenshot pack covers every route. Fresh browser tab per demo — a tab left
open through hot-reloads can wedge the Supabase client (known dev quirk, not an
app defect). (VIVA-PLAN screenshot recipe)

**H5. Is this real institute data or demo data?**
Mixed by category, and we say which is which: staff, projects, divisions, PhD
scholars, and equipment are the institute's real records (107 staff, 82
projects); technology transfers are 25 real agreements worth ₹2.25 crore
transcribed from the institute's licensing PDF; publications and MOU/IP
registers still await the institute's exports and are currently seeded —
the system answers correctly on both, the difference is which number is an
institute number. (VIVA-PLAN "Data still needed" table)

**H6. Where is the data stored and how is it kept fresh?**
Supabase/PostgreSQL on institute infrastructure; monthly structured-data refresh
through the Data Management console by owning sections; documents captured
automatically as workflows complete. (§10.2)

---

## Key numbers card (memorise)

| Item | Number |
|---|---|
| Migrations | 31 versioned SQL files |
| Role dashboards | 14 |
| Test files | 75 (src + rag), ~170 rag tests, CI on both stacks |
| Real data loaded | 12 divisions · 107 staff · 82 projects · 87 project staff · 66 PhD · 169 equipment |
| Technology transfers | 25 agreements, ₹2.25 crore (2013–2021) |
| External/sponsored projects | 41, ₹19.88 crore |
| M2 retrieval accuracy | 1.00 (14/14) final run (0.93 earlier) |
| M3 source traceability | 8/8 cited; 7/7 refusals with zero citations |
| M4 duplication recall / precision | 0.90 / 0.38–0.41 |
| Router accuracy | 1.00 (58/58); refusal invariant 4/4 |
| M1 sanction-prep time | ~1–2 working days → ~2 hours (trial) |
| M6 model (not claimed) | ₹28–56 lakh/yr sensitivity band; harness prints ₹43.2 lakh at its parameters |
