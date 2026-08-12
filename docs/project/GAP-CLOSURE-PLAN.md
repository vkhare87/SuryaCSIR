# Gap Closure Plan — Report ↔ Repo

What stands between `SURYA-Final-Project-Report v3.docx` and the actual repository
state, and the concrete actions to close each gap before the presentation.
Status checked 2026-08-08. Evidence files: `docs/project/VIVA-PLAN.md`,
`docs/project/REPORT-REPO-MAP.md`, `rag/eval/eval_report.md`.

---

## 1. Gap register

| # | Gap | Report currently says | Repo reality | Action | Priority |
|---|---|---|---|---|---|
| G1 | **M2 number stale** | §6.9: 0.86 (12/14) | `eval_report.md` (2026-08-05): **1.00 (14/14)**; earlier run 0.93 (13/14) | Re-run harness on the final corpus, then transcribe whatever it prints into §6.9, §6.9.1, Annexure-4. Add "one run, not a mean". | P0 |
| G2 | **M4 "To confirm" placeholder** | §6.9 M4 row: "values from harness output", status To confirm | Harness: recall **0.90** (9/10), precision **0.38** (9/24) | Fill the cell with the harness run; add the precision note (G3). The report itself authorises this ("highlighted cells are to be replaced"). | P0 |
| G3 | **M4b precision below harness target** | No precision claim (report targets recall ≥70% only) | Precision 0.38–0.41 vs harness's own 0.60 | Option A (better): extend `gold_duplication.jsonl` so every genuinely overlapping section is labelled (currently 2 per topic; corpus has more, e.g. red-mud shielding across several patent pages) and re-run. Option B: report 0.38 with the labelling-artifact explanation. **Never relabel to inflate.** | P0 |
| G4 | **"avg 3 Hour per task" typo** | §6.10.1 input table | Trial record: 1–2 working days → ~2 hours (single observation) | Fix to the logbook figure; remove the "half an hour per task" average claim in §6.10.1 narrative — there is one trial, not an average. Confirm wording with the process owner. | P0 |
| G5 | **M6 mismatch** | §6.10.2 qualitative (declines to price) | Harness prints INR 4,320,000 model value | Keep the report qualitative (it is methodologically defensible). Add one footnote in Annexure-4: the harness contains a parametric model (recall × avg project cost × assumed attempts) that yields ₹43.2 lakh/yr at its default inputs; report it only if asked, with the sensitivity band. | P1 |
| G6 | **M1 / M3 rows empty in eval_report.md** | §6.9 reports M1 indicative, M3 met | M1: trial logbook entry needed (A4.3 format). M3: query-log SQL count needed | Write the M1 logbook entry with the process owner's note. Run the M3 query-log count (non-refusal document answers vs ≥1 citation — expected 8/8) and append to `eval_report.md`. | P1 |
| G7 | **Local-model narrative vs hosted dev usage** | §6.7/Annexure-6: locally hosted model; hosted API optional for development | Measured runs used hosted DeepSeek (dev accelerator); local qwen3-vl:8b correct but 586 s/question | No repo change. Viva answer prepared (see VIVA-PLAN "Model runtime decision" and VIVA-QA C6): quality holds locally, speed is hardware; production stays local. Optionally add a line to `deploy/README.md` documenting both paths. | P2 |
| G8 | **UC-5/UC-1 data gaps** | Report claims consolidation of five data categories | `project_expenditure_summary` → "utilisation not recorded" (0/82); `mous` empty; `ip_intelligence` 5 seeded rows (60+ patents live in PDFs only); `scientific_outputs` 10 seeded; `project_reports` empty; proposals seeded | Get the missing sources (table below) and import through the app's own pipeline. Until then the system correctly says "not recorded" instead of 0 — say that in the demo rather than hiding it. | P1 |
| G9 | **Eval artefacts freshness** | Annexure-4 refers to retained harness output | `eval_report.md` is from 2026-08-05 on a 6-doc corpus; `corpus.json` (16.9 KB) exists but may lag current index | Rebuild the corpus (`worker.py` collections → corpus dump per `run_eval.py` docstring), re-run harness, commit the new `eval_report.md` as the evidence record. | P0 |
| G10 | **Evidence pack (screenshots + logbook)** | Annexure-4 A4.3 logbook format; report cites screenshots | Not all captured | Follow the 7-route screenshot recipe in VIVA-PLAN; fill the A4.3 logbook per UC run (date, verbatim query, mode badge, rating, latency, screenshot ref). | P1 |
| G11 | **Harness M5 row confusion** | §6.9.2: M5 merged into M1 | `eval_report.md` still prints an M5 row (proposal turnaround) | Add one line to the eval report or Annexure-4: "M5 in the harness corresponds to the merged indicator M1 (report §6.9.2)". No number change. | P2 |
| G12 | **Demo-data confidentiality** | — | Real titles visible in screenshots/demo | Clear with the guide or use a mixed corpus (VIVA-PLAN risk note). Decide before Day 4. | P2 |

---

## 2. Data still missing — where to get it

| Need | Why it matters (demo visibility) | Where it goes | Source |
|---|---|---|---|
| Project utilisation / expenditure-to-date | UC-1 sanctioned-vs-utilised and budget-variance answer "not recorded" on real data | `UtilizedAmount` on projects; re-import via Data Management | F&A / PFMS two-column export: `ProjectNo` + expenditure-to-date |
| MOUs with validity/expiry | UC-5 MOU tab and expiry alerts read zero | `mous` (Partnerships module) | Partnership files; or one sheet listing partner, purpose, validity, status |
| IP register | Patent funnel runs on 5 seeded rows | `ip_intelligence` | Patent register sheet (60+ patents already in indexed PDFs — a transcription exercise like `extract_licensing.py`) |
| Publications | UC-5/UC-6 numbers are seeded | `scientific_outputs` | IRINS export via `npm run sync:irins` |
| 2–3 real progress reports + 2 real proposals (PDF) | UC-2/UC-4 become genuinely about AMPRI work | Document registry → `project_reports` / proposals | Institute files; upload through the app (report claims ingestion from the app — do not shortcut via SQL) |

All optional for a *working* demo — each converts a seeded number into an institute
number. Ranked by visibility, utilisation and MOUs first.

---

## 3. Execution plan (5 days)

### Day 1 — Lock the numbers (P0)
1. Environment green per VIVA-PLAN Day 1 (Ollama or hosted provider up; `supabase db push`; `python -m pytest` green in `rag/`).
2. Rebuild corpus: `python worker.py` build-collections → dump `rag/eval/corpus.json` (per `run_eval.py` docstring).
3. Run: `LLM_BACKEND=openllm OPENLLM_MODEL=<chosen> python eval/run_eval.py --report`.
4. Inspect `eval_report.md`; iterate only on genuinely bad gold questions or system bugs — never the number.
5. **Commit `eval_report.md`** — it is the evidence record the report cites.

### Day 2 — Close the report (P0)
6. G4: fix "avg 3 Hour" + reconcile §6.10.1 narrative with the single trial record; get process-owner sign-off on the wording.
7. G3 decision: either expand `gold_duplication.jsonl` labels and re-run (then Day 2 numbers supersede), or finalise the labelling-artifact note.
8. G1+G2: transcribe the harness output into §6.9, §6.9.1, Annexure-4. Add G5 footnote (M6 qualitative), G11 note (M5 row).
9. G6: write M1 logbook entry; run the M3 query-log SQL; append both to the evidence pack.

### Day 3 — Data push (P1, as obtainable)
10. Request F&A/PFMS utilisation export; import via Data Management (re-run UC-1 checks with `uc_check.py`).
11. Load MOUs (Partnerships form); run IRINS publications sync; upload 2–3 real reports + 2 proposals through the document registry; load the IP register if a sheet exists.
12. Re-run `python eval/uc_check.py` — every UC should now answer from real data; log what is still seeded.

### Day 4 — Evidence pack (P1)
13. Capture the 7 screenshots from the VIVA-PLAN recipe (fresh tab each; login `master@test.local` / `Test@1234`).
14. Fill the A4.3 logbook for each UC run; record latencies from the query log.
15. Clear the confidentiality question with the guide (G12).

### Day 5 — Rehearse
16. Dry-run the full demo twice, under 10 minutes: login → dashboard → Ask SURYA (structured, document, refusal) → similar-work check → Intelligence page → eval report.
17. Final read of report §6.9, §6.10, Annexure-4 for consistency; keep `docs/project/VIVA-QA.md` and `docs/project/REPORT-REPO-MAP.md` open as your reference.

---

## 4. Non-negotiables (from VIVA-PLAN)

- The numbers in the submitted report are **whatever the harness prints**. Do not hand-edit them.
- Do not relabel gold sets to inflate precision; report the labelling artifact honestly.
- M2: say "one run, not a mean" — a single flip moves 14-question results by ~7 points.
- Never claim the local model is fast; say quality holds locally and speed is hardware.
- Say "utilisation is not recorded for any project" rather than "0% utilisation" — the system now does exactly this; the demo should too.
