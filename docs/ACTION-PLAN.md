# SURYA — Post-Midsem Action Plan

> Derived from the midsem report review (2026-07-08). Two tracks: **Dissertation** (what the
> final report needs as evidence) and **Build** (what the codebase needs to produce that
> evidence). Ordered so every build item feeds a dissertation deliverable. Weeks refer to the
> 18-week DSR plan in the midsem report (currently ~week 7).

---

## Guiding decision

The intelligence layer (PageIndex retrieval, Ask SURYA, governance) is already built —
ahead of the report's Plan-vs-Progress table. Remaining risk is **evidentiary, not
technical**: no E2E run on real CSIR documents, no manual baselines, no measured metrics.
All effort below optimises for Phase 4 validation quality, not new features.

---

## Track A — Dissertation actions (no code)

| # | Action | Why | When |
|---|--------|-----|------|
> **Status 2026-07-08:** A1/A5 → protocol + sheets in [EVALUATION-PROTOCOL.md](EVALUATION-PROTOCOL.md) (staff timing still to do).
> A2/A3 → duplication recall+precision eval and ₹ cost-avoidance metric coded in `rag/eval/run_eval.py`
> (`gold_duplication.jsonl` + `AVG_PROJECT_COST_INR`). B3.1 comparables sheet → shipped
> (`src/lib/ask/comparables.ts` + `SimilarWorkPanel`). **B3.2 expertise NL path, B4.1 budget
> variance, B4.2 succession risk → shipped** as whitelisted RAG analytics functions
> (`rag/analytics.py`: `expertise_search`, `project_budget_variance`, `expertise_succession_risk`),
> router-discoverable, tested. Remaining: **B1 E2E (needs target host)**, **B5 query-log mining
> (needs real usage)**, A1 baseline timing (needs AMPRI staff), A4 report edits.
> Deferred UI dashboard cards for B4 — the analytics functions deliver the measurable use case;
> add cards when a dashboard owner asks (ponytail: don't duplicate the logic in React speculatively).

| A1 | **Measure manual baselines now.** Define 5 representative decision tasks (1 funding review, 1 proposal comparison, 1 expertise lookup, 1 duplication check, 1 commercialisation query). Time each done manually by/with AMPRI staff. Record method + timings. | Every metric in §4.3 is baseline-vs-target; "before" cannot be reconstructed later. Supervisor flagged it. | Week 7–8 — **urgent, before pilot use begins** |
| A2 | **Add one financial metric** to the evaluation framework: estimated cost of one avoided duplication (avg. sanctioned project cost × detection rate) and/or evaluator-hours saved × loaded cost/hour. | FinTech framing currently has zero rupee-denominated indicator. | Week 8, alongside A1 |
| A3 | **Add precision to the duplication metric.** Target becomes recall ≥70% **and** precision ≥60% on the seeded overlap set. | Recall-only target rewards flag-everything; noise kills adoption. | Week 8 (definition), measured in Phase 4 |
| A4 | **Update Plan-vs-Progress honestly.** Move Phase 3 rows to their true state (PageIndex, NL interface: built, pending real-corpus validation). Fix §3.1 layer contradiction, "evvaluation", "Engieering" typos. | Report understates progress; final report must match repo reality. | With final report draft |
| A5 | **Keep a validation logbook** from first E2E run onward: date, task, query, mode, outcome, timing. | Raw material for Phase 4 chapter; cannot backfill. | Continuous from B1 |

## Track B — Build actions (code)

### B1 — E2E on real host (blocker for everything below)
Runbook exists: `deploy/README.md`. Apply migrations, set `SUPABASE_SERVICE_KEY`, resolve
WDAC native-DLL policy, stand up Ollama, run worker + API as services. Ingest first batch
of real CSIR documents (start with born-digital; OCR batch second).
**Done when:** one real institute document is indexed and an Ask SURYA query answers from it
with a clickable citation. — *Week 7–8.*

### B2 — Run eval harness on real corpus
Extend `rag/eval/gold.jsonl` with 20–30 real-document queries with known answers (this is
the §4.3 "fixed test-query set"). Run `rag/eval/run_eval.py`; record router accuracy,
retrieval accuracy, citation hit-rate. Add a seeded duplication set (known-overlapping
proposals) scoring recall + precision (A3).
**Done when:** all five §4.3 indicators have a measured value against the A1 baselines.
— *Week 9–10.*

### B3 — Close the two partial use cases
1. **Proposal comparables sheet** — extend `SimilarWorkPanel` on `/proposals/:id`: for each
   match resolve the source project and show sanctioned budget, utilization, planned-vs-actual
   timeline alongside. (Underwriting story for the dissertation.)
2. **Expertise discovery NL path** — add whitelisted analytics function: expertise/keyword →
   ranked staff (expertise fields + publication co-authorship already in
   `src/lib/intelligence/collaboration.ts`). Router routes "who has worked on X" to it.

**Done when:** both runnable as documented Phase 4 use cases. — *Week 10–12.*

### B4 — New use cases (pick 2, defer rest)
Priority by demo value ÷ effort; each ≈ one whitelisted analytics function + one dashboard card:
1. **Budget-utilization early warning** — utilization drift beyond threshold flagged on
   Director/Finance dashboards (covenant-monitoring analogue).
2. **Expertise succession risk** — expertise held by one scientist retiring within N years
   (key-person risk; HR retirement dates already loaded).

Deferred (final-report "future work"): equipment-ROI ranking, IP renewal triage,
funding-mix analysis, RTI acceleration. — *Week 12–13, only if B1–B3 on time.*

### B5 — Query-log mining
After 3–4 weeks of real usage: cluster 👎/failed queries from `query_log` → unmet-need list.
Feeds dissertation §"future use cases" with real telemetry no other approach yields.
— *Week 14–15.*

## Track C — Phase 4 validation (weeks 12–14, per report plan)

1. Re-run the 5 baseline decision tasks (A1) system-assisted, timed → decision-prep time +
   proposal-turnaround metrics.
2. Report all §4.3 indicators: baseline / target / measured (from B2).
3. Execute each of the six §3.4 business use cases end-to-end with documented inputs and
   responses (screenshots + logbook A5).
4. 3–5 structured user feedback sessions with AMPRI staff → qualitative evaluation +
   adoption-risk evidence.

---

## Sequence and dependencies

```
A1 baselines ──────────────┐
B1 E2E real host ──► B2 eval on real corpus ──► C validation (wk 12–14)
                └──► B3 close partial use cases ──┘
                └──► B4 two new use cases (optional)
                └──► A5 logbook ──► B5 query-log mining ──► final report (wk 17–18)
```

**Cut line if time slips:** B4 and B5 go first; A1, B1, B2, C are non-negotiable — they are
the dissertation's evidence base.
