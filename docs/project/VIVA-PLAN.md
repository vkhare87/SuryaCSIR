# Viva Readiness Plan — PageIndex E2E + Evaluation + Screenshots

Deadline: viva in 7 days (2026-08-12). Goal: working ingestion → PageIndex → Ask SURYA on real institute data, harness-measured M2/M3/M4 figures matching Section 6.9 of the final report, 6–7 evidence screenshots, filled validation logbook (Annexure A4.3).

## Day 1 executed (2026-08-05) — status

Done:
- Env green: Ollama up (`qwen3-vl:8b`), remote DB in sync (31/31 migrations applied), 170 rag tests pass, SPA + RAG API run together.
- **Full PageIndex loop proven E2E**: document row → worker → parse → LLM summaries → tree in `doc_indexes` → `indexed` → Ask SURYA answers from it with a page-level citation.
- **Real institute data loaded**: 12 divisions, 107 staff, 82 projects, 87 project staff, 66 PhD scholars, 169 equipment — imported from the real Excel files through the app's own pipeline (`scripts/import_institute_data.ts` runs `parseFileRaw → detectColumnMappings → applyColumnMapping → validateRows`, the same functions the Data Management console calls).
- 5 real institute PDFs queued and ingesting (patents India/Abroad/licensed, scientific profile, CSIR R&D projects overview).

Bugs found and fixed along the way:
1. `rag/dev_server.py` never loaded `rag/.env.api`, so the API silently ran the **FakeLLM** — every "answer" was just the first line of retrieved context. Fixed; this would have been a fatal viva demo.
2. `SCHEMA_MAPS` was missing the real files' header variants (`ProjectStaffName`, `Recruitment_cycle`, `Id`, `Name of student`, the long AcSIR fellowship/co-supervisor headers) — 153 real rows were rejected. Added.
3. `pushToSupabase` sent `''` for empty optional cells; Postgres rejects that for `date`/`uuid` columns and failed the whole batch. Now coerces blanks to null (app import path, not just the script).
4. Root `.env` lacked `VITE_RAG_URL` and `CORS_ORIGINS`, so Ask SURYA could not reach the API at all from the dev server.
5. Added the missing **Institute Documents** upload tab to Data Management (mounts the existing `DocumentPanel`) — the report claims documents enter through the data console, and there was no such surface.

**Blocking decision — model runtime.** Ollama runs `qwen3-vl:8b` at **100% CPU** (Intel Arc iGPU is not used), measured on this laptop:
route 104s + section pick 54s + answer 67s ≈ **3–4 minutes per question**. Disabling thinking tokens only got the answer step to 47s, so it is raw CPU inference, not reasoning overhead. Unusable for a live viva demo and it makes the eval harness runs take hours.
Hosted-API support is now implemented (`OPENLLM_API_KEY` → bearer header on the existing OpenAI-compatible client), so switching is three env values. See "Model runtime decision" below.

## What already exists (verified 2026-08-05)

- `rag/` worker (parse → PageIndex tree → `doc_indexes`), FastAPI `/query`, router, grounding refusal — all shipped and unit-tested.
- Eval harness `rag/eval/run_eval.py`: router accuracy, citation hit-rate (M2), duplication recall/precision (M4), refusal check (M3), `--report` writes `eval_report.md` (the evidence record the report cites).
- `.venv` Python 3.12 ready; `.env` points at hosted Supabase + Ollama `qwen3-vl:8b` (OpenAI-compatible `/v1`).
- Worker previously verified against Ollama (parse + OCR + summaries work; WDAC already handled).
- `gold.jsonl` (58 router cases) exists. **`gold_citations.jsonl` and `gold_duplication` are 1-line samples — the real gold sets do not exist yet. `corpus.json` does not exist.** These are the actual blockers for M2/M4.

## Measured results (2026-08-05, DeepSeek `deepseek-v4-flash`, real 6-document corpus)

| Indicator | Target | Measured | Verdict |
|---|---|---|---|
| Router mode accuracy | — | **1.00** (58/58) | — |
| Refusal invariant (grounding) | — | **4/4** | supports M3 |
| M2 retrieval accuracy (citation hit-rate) | ≥0.80 | **0.93–1.00** (13/14, then 14/14) | **Met**, above the 0.86 the draft claimed |
| M4a duplication recall | ≥0.70 | **0.90** (9/10) | **Met** |
| M4b duplication precision | ≥0.60 | **0.38–0.41** (9/24, 9/22) | **Below target** — see note |
| M3 source traceability (live API) | ≥95% | **1.00** (8/8) | **Met** |
| Median query latency (live API) | — | 19.8 s document mode, ~7 s structured | — |

Evidence files: `rag/eval/eval_report.md` (harness, regenerate with `python eval/run_eval.py --report`) and `python eval/log_queries.py` for the live M3 + latency run.

**M3 evidence, measured through the live endpoint** (`eval/log_queries.py`, 17 queries under a real user's JWT, logged in `query_log`): 8 of 8 non-refusal document answers carried at least one citation, and all 7 refusals — including three deliberately out-of-corpus controls ("What is the capital of France?", another institute's recruitment decisions, a cricket result) — returned exactly zero citations. That is the grounding invariant demonstrated empirically, not just architecturally.

**M4b is below target and should be reported as such.** Precision is 9/22. Part of that is a labelling artifact: each seeded topic lists only two known-overlapping sections, while the corpus genuinely contains more (red-mud radiation shielding appears across several patent pages), so a correct flag on an unlabelled-but-genuine overlap counts against precision. Do not quietly relabel to inflate it — either expand the gold set to every genuinely overlapping section and re-run, or report 0.41 with this explanation. Recall, the metric the report actually targets for M4, is met at 0.90.

**Run-to-run variance is real and worth owning.** Two harness runs on identical code and
corpus gave M2 = 0.93 (13/14) and 1.00 (14/14), and M4b = 0.41 then 0.38. The model is
sampled at temperature 0 but hosted inference is not bit-reproducible. Quote the run
whose `eval_report.md` you submit as evidence, and say it is one run rather than a mean
— with 14 questions, a single case flipping moves the figure by 7 points.

**One honest caveat for the viva.** The harness scored M2 at 0.93, but a live 14-question spot-check through the API refused on 4 of them. The difference is run-to-run model variance plus the router legitimately sending some questions to structured/expertise functions instead of document retrieval. If asked, the defensible statement is: retrieval accuracy measured 0.93 on the gold set under the documented harness; live behaviour varies and the system refuses rather than fabricates when it cannot ground an answer.

Three retrieval bugs were found by these measurements and fixed:
1. **Section picking was blind.** `descend()` showed the model only labels like `"Patents Filed and Granted — India — Page 5"` — no content — so it could not tell which page held fly-ash compositions and refused. The tree already stores a summary per node (the whole point of PageIndex); the pick label now carries it. Pick precision went to 1–2 correct sections per question.
2. **The harness was harder than production.** Production passes `fetch_texts` so answers are grounded in real page text; the offline eval passed `None`, so it answered from summaries alone, refused, and scored correct retrievals as misses. The harness now reads `doc_pages` too. This alone moved M2 from 0.43 to 0.93.
3. **Duplication returned a shelf, not a shortlist.** `similar_matches()` returned every picked node (~21–26 per query), so precision was 0.07 regardless of quality. It now shares the same summary-aware labels and caps at the 6 strongest matches.

Also fixed while validating against real data: the commercialisation strip read every externally funded project as in-house, because it matched only `consultancy|sponsor|industry|contract` while CSIR-AMPRI's records say fund type `ECF` (External Cash Flow) with sponsor types `Central Govt/Agencies`, `Private`, `PSU`. It showed 0 external projects on real data; it now shows 41 worth ₹19.88 crore. Same class of defect as the shipped PMS designation-vocabulary fix.

## Use-case sweep on DeepSeek V4 (2026-08-05) — `python eval/uc_check.py`

Every use case was exercised through the live API under a real JWT. All routed to the
right mode and function; the gaps that remain are **missing data, not broken code**.

| Use case | Route | Works? | Data behind the answer |
|---|---|---|---|
| UC-1 portfolio mix | `count_projects_by_division` | ✅ | 82 real projects |
| UC-1 sanctioned vs utilised | `project_expenditure_summary` | ⚠️ | sanctioned ₹41.34 cr real, **utilised reads 0 — no source data** |
| UC-1 budget variance | `project_budget_variance` | ⚠️ | cannot flag anything without utilisation |
| UC-2 / UC-4 similar work | `/similar` | ✅ | 5 ranked matches with page citations |
| UC-3 expertise search | `expertise_search` | ✅ | real scientists (Dr. Shabi T.S., Dr. Pradip Kumar) |
| UC-3 succession risk | `expertise_succession_risk` | ✅ | 6 staff incl. real (Dr. P. Asokan) — **after two fixes below** |
| UC-5 patent pipeline | `patent_pipeline_counts` | ⚠️ | 5 seeded IP rows; real patents exist only as PDFs |
| UC-5 tech transfers | `tech_transfer_summary` | ⚠️ | **table empty** |
| UC-5 MOUs | `mou_status_summary` | ⚠️ | **table empty** |
| UC-6 emerging themes | Intelligence page | ✅ | real project titles across real divisions |
| UC-7 document mode | PageIndex retrieval | ✅ | cited answers, 14–43 s |
| UC-7 refusal | grounding invariant | ✅ | zero citations on out-of-corpus |

Two defects found and fixed by this sweep:

1. **`_parse_date` accepted only ISO dates.** Real HR records write `28.12.1970`, so
   all 107 real staff were silently skipped and succession risk answered *entirely from
   seeded demo staff* — it would have named invented people in the viva. Now parses
   `dd.mm.yyyy` and `dd/mm/yyyy`, mirroring `parseDate()` in the SPA. 107/107 DOBs parse.
2. **Succession risk keyed on `CoreArea`.** That is a coarse bucket ("Group-I",
   "Material Science") shared by dozens, so nothing real was ever unique. It now keys on
   the specific `Expertise` field (falling back to CoreArea), and treats the literal
   `'N/A'` as blank. Matches the report's own wording, "expertise no colleague covers".

## P1 outcome (2026-08-07): dates fixed, utilisation absent by source

Chasing the utilisation gap surfaced a worse defect underneath it.

**Excel date serials were being stored raw.** `readRawRows` read the workbook without
`cellDates`, so `10-03-2021` was stored as the string `'44265'`. `parseDate('44265')`
does not fail — `new Date('44265')` returns **the year 44265**. Every real project
therefore started and ended forty-two thousand years in the future, which silently
disabled the R&D lifecycle monitor, overdue detection and burn-rate variance: they
reported "nothing to flag" over unusable data. Fixed at the single choke point
(`cellDates: true`, dates normalised to local ISO), and `parseDate` now rejects a bare
numeric string outright so a stray serial fails loudly instead of quietly.
After re-import: **82/82 projects hold ISO dates, and 35 active projects are now
correctly flagged as past their end date** — previously zero.

`parseDate` also now accepts the dotted `22.12.1997` the HR sheets use, matching the
Python `_parse_date` fixed earlier. The two implementations agree again.

**Utilisation itself cannot be sourced from the files on hand** (see the table below).
Rather than report absence as zero spend, both analytics now distinguish the two:

- `project_expenditure_summary` → "sanctioned 413,436,568. Utilisation is not recorded
  for any of these projects, so no utilisation percentage can be reported."
- `project_budget_variance` → "Budget variance cannot be assessed: no active project
  has a recorded utilisation figure."

Previously these read "utilized 0 (0.0% utilization)" and "No active projects breach
the budget-variance threshold" — a confident zero and a false all-clear over no data.
When a partial export arrives, the percentage is computed over the recorded subset and
the answer states the coverage.

## P3 outcome (2026-08-08): licensing record loaded, stalled-ingest gap closed

**UC-5 technology transfer is now real.** `Patents licensed.pdf` — already in the RAG
corpus — holds the institute's actual licensing register. `rag/eval/extract_licensing.py`
transcribes it with pymupdf's structural table extractor (cells stay aligned when a
field wraps), and `scripts/import_licensing.ts` maps it into `tech_transfers`. Nothing
is inferred: a row missing any of title / licensee / date / amount is reported and
skipped rather than guessed.

Result: **25 agreements, ₹2.25 crore total**, 2013–2021, licensees from Jindal Steel
to Permali Wallace. Ask SURYA now answers *"Technology transfers by status —
Completed: 25; total agreement value 225.25 lakhs"* where it previously said zero.

One judgement worth recording: entry #16 (bamboo composite, Permali Wallace) carries a
lump sum of **0** with licence type "---". That is a real agreement on royalty or
unstated terms, not a parse failure, so it is loaded at zero value. Excluding it would
have undercounted the institute's transfers.

**Stalled-ingest reclaim.** `requeue_stale_processing()` returns documents held in
`processing` beyond a 60-minute window to `pending`, run at the top of every worker
pass. Without it, a worker dying mid-document left the row neither pending nor failed —
invisible to the queue forever, while the console still showed it in flight. Verified
against the live database: a simulated crash was reclaimed and re-queued with
`ingest_error = 'requeued after stalled ingest'`. The window is deliberately generous
because a large scanned PDF on a CPU-only host can legitimately hold a worker for
several minutes; a late reclaim only delays a retry.

Remaining for UC-5: MOUs (`mous` still empty — no source document found for them).

## Data still needed to make every use case real

Ranked by how visible the gap is in a demo:

| Need | Why | Where it goes |
|---|---|---|
| **Project utilisation / expenditure figures** | **Not present in any file you hold** — `Projects_AMPRI.xlsx` carries the `UtilizedAmount` column with 0 of 82 filled, and `Projects 1.5.26.xlsx` has sanctioned cost only. This is a Finance & Accounts figure (expenditure booked against each sanction), not something the projects register holds. Ask F&A or PFMS for a two-column export: `ProjectNo` + expenditure-to-date. Until then the system now says so explicitly instead of reporting 0. | F&A export → `UtilizedAmount`, re-import via Data Management |
| ~~**Technology-transfer agreements**~~ | **Done 2026-08-08** — 25 real agreements worth ₹2.25 crore, transcribed from `Patents licensed.pdf` | `rag/eval/extract_licensing.py` → `scripts/import_licensing.ts --push` |
| **MOUs with expiry dates** | UC-5 MOU/expiry alerts read zero | Partnerships module → `mous` |
| **IP register** | Patent funnel runs on 5 seeded rows while 60+ real patents sit in the indexed PDFs | `ip_intelligence` — a patent register sheet |
| **2–3 progress reports & 2 real proposals (PDF)** | `project_reports` is empty; proposals are seeded. Real ones make UC-2/UC-4 genuinely about AMPRI work | Progress Reports / Proposals modules |
| Publications export | `scientific_outputs` holds 10 seeded rows; IRINS export would make UC-5/UC-6 real | IRINS sync or a sheet |

Everything above is optional for a *working* demo — the system answers correctly today —
but each one converts a seeded number into an institute number.

## Report claims to reproduce (Section 6.9)

| Metric | Target | Report claim | Status |
|---|---|---|---|
| M2 citation hit-rate | ≥0.80 | 12/14 (0.86) | must re-run on real corpus |
| M3 traceability | ≥95% | zero uncited non-refusal answers | architecturally enforced; confirm from query log |
| M4 duplication recall | ≥0.70 | "To confirm — values from harness output" | must run |
| M1 prep time | ≥50% cut | ~1–2 days → ~2 hours (trial observation) | logbook entry, no harness |

Report note allows it: "highlighted cells are to be replaced with the final evaluation-harness output". So the numbers in the submitted report must be whatever the harness actually prints. Do not hand-edit numbers.

## Day-by-day

### Day 1 — Environment green (½ day)
1. Start Ollama, confirm model: `ollama list` shows `qwen3-vl:8b`; `curl localhost:11434/v1/models`.
2. Sync DB: `supabase db push` (also lands the pending RLS-reads scoping migration `20260718000001`).
3. `cd rag && .venv/Scripts/activate && python -m pytest` — suite green.
4. Start API (`python dev_server.py`) + SPA (`npm run dev`), log in, confirm Ask SURYA structured mode answers (no docs needed yet).

### Day 1–2 — Ingest real institute corpus
5. Pick 12–20 real documents: annual/progress reports, 4–6 project proposals, 2–3 completed-project reports. Include **at least 3 topically overlapping pairs** (needed to seed M4) and the 2025 progress reports (gold question A4.4 depends on them).
6. Upload through the app (Data Management / document registry — the report claims ingestion *from the app*, so do not shortcut via SQL).
7. Run `python worker.py`; watch RAG admin console until all show indexed. 📸 **Screenshot 6** (ingestion console, all green).
8. Structured-data side: if real HR/project Excel not fully loaded, load real Excel via the Data Management upload flow; `supabase/mock` fixtures only as last resort for dashboard fill.

### Day 2–3 — Build the gold sets (the real work)
9. Dump corpus: run the SQL in `run_eval.py` docstring (service role) → save `rag/eval/corpus.json`.
10. `gold_citations.jsonl`: 14 questions, each answerable by a specific ingested doc/section. Start from A4.4 examples; write the rest by opening each doc's tree in `doc_indexes` and asking a question whose answer lives in a known node. Format: `{"question": ..., "expected_citation": "<substring of 'title — node_title'>"}`. Include 1–2 out-of-corpus control questions with `expect_refusal` in `gold.jsonl` if not already covered.
11. `gold_duplication.jsonl`: the seeded overlap set — for each overlapping pair, a query naming the topic and the expected matching doc(s). Validate both files with `python eval/validate_gold.py`.

### Day 3–4 — Run the harness, get the numbers
12. `LLM_BACKEND=openllm OPENLLM_MODEL=qwen3-vl:8b python eval/run_eval.py --report`
13. If hit-rate < 0.80: first check gold-set quality (ambiguous question / wrong expected substring), then retrieval behaviour per miss. Iterate honestly — fix system or fix a genuinely bad question, never the number.
14. **Fallback if qwen3-vl too weak/slow:** DeepSeek (or any OpenAI-compatible API). `OpenLLMClient` sends no auth header today — add optional `OPENLLM_API_KEY` → `Authorization: Bearer` (~5 lines in `llm.py`/`config.py`), then point `OPENLLM_BASE_URL` at the hosted endpoint. Report already covers this ("hosted APIs used in development, budgeted and logged"). Keep local model as the headline story; hosted API is the dev accelerator.
15. Keep `eval_report.md` + terminal output. 📸 **Screenshot 7** (harness output showing M2/M4 vs targets).
16. Transcribe the printed numbers into report Section 6.9 (replace highlighted cells).

### Screenshot recipe (all routes verified working 2026-08-05)

Start both servers, sign in as `master@test.local` / `Test@1234`, and use a **freshly opened tab** — a tab left open through many hot-reloads can wedge the Supabase client and leave admin pages stuck on "Loading…". A reload fixes it; it is not an app defect, but do not discover it during the viva.

| # | Route | What to capture | Evidences |
|---|---|---|---|
| 1 | `#/ask` | "Which AMPRI technologies were licensed to companies between January 2020 and February 2021?" — DOCUMENT badge, answer, clickable page citations | UC-7, M2, M3 |
| 2 | `#/ask` | "How many projects does each division run?" — STRUCTURED badge, source table named | UC-1, UC-7 |
| 3 | `#/ask` | "What is the capital of France?" — "Not found in institute documents.", zero citations | M3, grounding |
| 4 | `#/proposals` → any proposal → **Check for similar work** | ranked prior work with page citations | UC-2, M4 |
| 5 | `#/intelligence` | commercialisation strip (41 external projects, ₹19.88 crore), patent funnel, emerging cross-division themes | UC-5, UC-6 |
| 6 | `#/admin/rag` | 6 documents INDEXED with page counts, M3 traceability 100%, latency chart | ingestion pipeline, M3 |
| 7 | terminal | `python eval/run_eval.py --report` output + `rag/eval/eval_report.md` | M2, M4 |

Optional 8th, strong for the viva: `#/staff` or `#/projects` showing 107 real staff / 82 real AMPRI projects, to make the point that this runs on the institute's own records.

### Day 4–5 — Use-case runs + remaining screenshots
Run each UC live, fill the A4.3 logbook per run (date, verbatim query, mode badge, rating, latency from query log, screenshot ref):
- 📸 **1** Ask SURYA document mode: "What outcomes did the 2025 progress reports highlight?" — answer with clickable page citations (UC-7, M2/M3).
- 📸 **2** Ask SURYA structured mode: "Total sanctioned cost versus utilised amount across all projects?" — mode badge + source table named (UC-1).
- 📸 **3** Proposal page similar-work check listing overlapping prior work with citations (UC-2, M4).
- 📸 **4** Expertise search "Who has worked on X?" or succession-risk analytic (UC-3).
- 📸 **5** Intelligence page: commercialisation strip + patent funnel + emerging themes (UC-5/UC-6).
- Bonus (viva gold): out-of-corpus control question → "Not found in institute documents." refusal, zero citations (M3).
- M1: one timed trial run of a sanction-prep task with the process owner's before/after note → logbook.

### Day 5–6 — Report closure + M3 evidence
- Query-log SQL: count non-refusal document answers vs those with ≥1 citation → the M3 "zero uncited" line, from the actual log.
- Paste final numbers + screenshot references into report; regenerate Annexure-4 tables.

### Day 6–7 — Dry run
- Full demo rehearsal twice: login → dashboard → Ask SURYA (structured, document, refusal) → similar-work → Intelligence page → eval report. Under 10 minutes.
- Prepared answers: why PageIndex over vectors (structure-preserving, inspectable reasoning, no chunking); how grounding is enforced (empty picks → refusal path in `retrieval.py`); why local model (data sovereignty) with hosted-API dev fallback.

## Model runtime decision

Two knobs, and they are independent:

| Path | Query latency | Retrieval hit-rate | Use for |
|---|---|---|---|
| Local `qwen3-vl:8b` on Ollama (CPU) | **586 s/question** (2 of 3 hit the 600 s cap) | 1/1 completed, correct + cited | Ingestion (batch, unattended), OCR, and the sovereignty claim |
| Local `qwen2.5:3b-instruct` (CPU) | 45–123 s/question | **0.20** (1/5) | Nothing — too weak; it refuses rather than retrieves |
| Hosted `deepseek-v4-flash` | 7–20 s | **0.93** (13/14) | Live viva demo, eval-harness runs, screenshots |

The 8B result is the important one: **quality holds locally** (it answered correctly
with a precise citation), so self-hosting is a hardware-speed question, not an
accuracy compromise. Sizing down to 3B does not buy usable speed — it was still slow
*and* failed four of five gold questions by refusing. Qualify any candidate model with
`python rag/eval/bench_local.py --model <name> --cases 5` before trusting it.

### Switching hosts (implemented 2026-08-05)

`LLM_PROVIDER` selects a preset endpoint, so moving between local and hosted is one
line plus a key — no URLs or model ids to look up, and no code change:

```bash
LLM_PROVIDER=ollama                    # local, no key needed
LLM_PROVIDER=deepseek                  # hosted
OPENLLM_API_KEY=<key>
```

Any other OpenAI-compatible provider still works: leave `LLM_PROVIDER` unset and give
`OPENLLM_BASE_URL` + `OPENLLM_MODEL` directly. `OPENLLM_MODEL` also overrides a
preset's default when you run a different model on the same host. Covered by tests in
`rag/tests/test_llm.py`, and verified live in both directions (Ollama 102.7 s vs
DeepSeek 1.9 s on the same call).

Recommended: hosted API for the query path during the demo, local model kept working and demonstrated once (slowly) as proof of the sovereignty claim. The report already sanctions this — Section 6.7 says usage is budgeted and logged where hosted APIs are used in development, and Annexure-6 lists the model runtime as "locally hosted open LLM (hosted API optional for development)". Say exactly that in the viva if asked; do not claim the local model is fast.

To switch, set in `rag/.env.api`:

```bash
OPENLLM_BASE_URL=https://<provider>/v1
OPENLLM_MODEL=<provider model id>
OPENLLM_API_KEY=<key>
```

Restart the API. Nothing else changes — the client is the same OpenAI-compatible one. The worker keeps its own `rag/.env`, so ingestion can stay local while queries go hosted, or both can point at the API.

## Risks

- **Ollama quality on routing/picking** → DeepSeek fallback (step 14), decide by end of Day 3.
- **Real-data confidentiality in demo** → screenshots may show real titles; clear with guide, or use a mixed corpus (real + sanitised).
- **Hosted Supabase drift** → `db push` on Day 1 catches it early, not on demo day.
