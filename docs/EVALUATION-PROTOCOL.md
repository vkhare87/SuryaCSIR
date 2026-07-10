# SURYA — Phase 4 Evaluation Protocol (Baselines + Logbook)

> Companion to [ACTION-PLAN.md](ACTION-PLAN.md) Track A. Fill the baseline sheet **before**
> staff start using the system — "before" timings cannot be reconstructed later.
> All measured values feed the dissertation §4.3 indicator table.

---

## 1. Metric register (what to measure, how, with what)

| # | Indicator | Target | Instrument | Baseline source |
|---|-----------|--------|------------|-----------------|
| M1 | Decision-preparation time | ≥50% reduction | Stopwatch on tasks T1–T5, manual vs system-assisted | §2 sheet |
| M2 | Retrieval accuracy | ≥80% | `rag/eval/run_eval.py` citation hit-rate over `gold_citations.jsonl` (20–30 real-document queries) | n/a (system-only metric) |
| M3 | Source traceability | ≥95% | Share of non-refusal document answers carrying ≥1 citation, from `query_log`. Architecturally enforced (refusal on zero citations) — report the empirical share as confirmation. | n/a |
| M4a | Duplication-detection recall | ≥70% | `run_eval.py` duplication eval over `gold_duplication.jsonl` (seeded known-overlap set) | n/a |
| M4b | Duplication-detection precision | ≥60% | Same run — share of returned matches that are true overlaps | n/a |
| M5 | Proposal-evaluation turnaround | ≥50% reduction | Stopwatch on task T2, manual vs `SimilarWorkPanel` route | §2 sheet |
| M6 | Expected annual duplication cost avoidance (₹) | Report value | `AVG_PROJECT_COST_INR` + `DUPLICATE_ATTEMPTS_PER_YEAR` env vars to `run_eval.py`; prints recall × avg sanctioned cost × attempts/yr | Avg sanctioned cost from projects table (Ask SURYA: "average sanctioned cost across all projects") |

Run on host:
```bash
cd rag
AVG_PROJECT_COST_INR=<avg sanctioned cost> DUPLICATE_ATTEMPTS_PER_YEAR=<estimate> \
LLM_BACKEND=openllm OPENLLM_BASE_URL=... OPENLLM_MODEL=... python eval/run_eval.py
```
Requires next to `run_eval.py`: `corpus.json` (dump query in file header), `gold_citations.jsonl`,
`gold_duplication.jsonl` (formats: `*.sample.*` files in `rag/eval/`).

## 2. Baseline capture sheet (fill first — manual route, no SURYA)

Five representative decision tasks. For each: one AMPRI staff member performs it the current
manual way; record wall-clock time and steps. Repeat system-assisted in Phase 4 (same task,
same person where possible).

| Task | Decision scenario | Manual time (min) | Steps/sources used | Date | Person (role) |
|------|-------------------|-------------------|--------------------|------|---------------|
| T1 | Funding review: assemble budget + progress picture of one active project | | | | |
| T2 | Proposal comparison: find comparable past projects for a new proposal (budgets, timelines) | | | | |
| T3 | Expertise lookup: who in the institute has worked on topic X | | | | |
| T4 | Duplication check: has similar work been done/proposed before | | | | |
| T5 | Commercialisation query: which granted patents/capabilities are licensable in area Y | | | | |

Rules: time from "question posed" to "information assembled, decision-ready". Note interruptions.
Three runs per task if staff time allows; else one honest run beats zero.

## 3. System-assisted re-run sheet (Phase 4, weeks 12–14)

Same table, system-assisted: T1 via Ask SURYA structured/hybrid; T2 via proposal
`SimilarWorkPanel` (+ comparables); T3 via Ask SURYA expertise query; T4 via similar-work
check; T5 via Intelligence page commercialisation strip + Ask SURYA.

| Task | System time (min) | Route used | Answer correct? | Citations OK? | Date | Person |
|------|-------------------|------------|-----------------|---------------|------|--------|
| T1–T5 | | | | | | |

M1 = (manual − system) / manual, averaged over T1–T5. M5 = same for T2 alone.

## 4. Validation logbook (A5 — append one row per notable run, from first E2E day)

| Date | Task/Use case | Query (verbatim) | Mode | Outcome (answer quality, 1–5) | Latency | Notes/screenshot ref |
|------|---------------|------------------|------|-------------------------------|---------|----------------------|
| | | | | | | |

Screenshots: save to a `evidence/` folder (gitignored) named `YYYY-MM-DD_taskN.png`; reference
here. `query_log` table is the authoritative telemetry backup — the logbook adds human
judgement the table can't record.

## 5. User feedback sessions (Phase 4, 3–5 staff)

Per session record: role, 3 tasks attempted, task success (Y/N), SUS-style 1–5 ratings
(useful / trustworthy / would use again), one quote, one requested improvement.
Feeds the adoption-risk discussion (report §8) and the qualitative evaluation (Phase 5).
