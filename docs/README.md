# SURYA Documentation

Five folders, one rule each: **`engineering/` says what is true today. `roadmap/` says what
might be true later. Nothing else is authoritative about the system.**

---

## `engineering/` — the system as built

The verified reference. If code and one of these disagree, that is a bug in the doc.

| Doc | Owns |
|---|---|
| [app.md](engineering/app.md) | Product specification — vision, core differentiator, users, key flows, shipped/planned phases, non-goals |
| [architecture_addendum.md](engineering/architecture_addendum.md) | Architecture — principles, layers, folder map, frontend/AI/worker/event layers, DI, config, security, observability, extension points |
| [system_design.md](engineering/system_design.md) | Runtime — request flows, ingestion pipelines, every state machine, deployment, failure recovery, scaling limits |
| [api_spec.md](engineering/api_spec.md) | All three API surfaces — PostgREST, every RPC signature, the Ask SURYA HTTP endpoints, DTOs and validation |
| [database_design.md](engineering/database_design.md) | All 121 tables (8-file 2026-11-21 baseline), 8 views, 310 functions, 301 policies, ER diagrams, indexes, migration strategy, retention |
| [development_guide.md](engineering/development_guide.md) | Setup, branching, testing workflow, commit conventions, PR checklist, Definition of Done, debugging. **Also serves as the contributing guide** |
| [coding_standards.md](engineering/coding_standards.md) | TypeScript, React, Python and SQL conventions; naming; exception design; DI patterns; logging |
| [STACK.md](engineering/STACK.md) | Versions and dependencies |
| [FEATURES.md](engineering/FEATURES.md) | Plain-English feature & functionality guide across all 14 domains, role access, workflows, and §9 Quick Update Checklist |
| [access_matrix.md](engineering/access_matrix.md) | Which role sees which feature (least privilege), and MasterAdmin per-user grants |
| [role_features.md](engineering/role_features.md) | Snapshot of the role-to-feature matrix guarded by `src/lib/access/roleFeatures.test.ts` (do not hand-edit) |

Read alongside [../CLAUDE.md](../CLAUDE.md) (condensed rules, loaded by every Claude
session) and [../DESIGN.md](../DESIGN.md) (**read before any visual change**).

## `roadmap/` — what happens next

| Doc | Owns |
|---|---|
| [ROADMAP.md](roadmap/ROADMAP.md) | **Start here.** 20 work packages merged from every proposal in the repo, grouped so related items are taken up together. No dates, no committed order |
| [EXECUTION-PLAN.md](roadmap/EXECUTION-PLAN.md) | **Ordered build checklist (Stages 0–8).** Consolidated, dependency-ordered execution guide of all remaining unfinished work (current as of `2026-11-21`); point new Gemini threads here to execute step by step |
| [VISION-ARCHITECTURE.md](roadmap/VISION-ARCHITECTURE.md) | The north star — the institute record spine, four pillars, permanent document |
| [sources/](roadmap/sources/) | The original proposal briefs the roadmap merges. Hand one of these to an implementation session; the roadmap tells you *which* |

## `operations/` — running it

| Doc | Owns |
|---|---|
| [RAG-SETUP-TUTORIAL.md](operations/RAG-SETUP-TUTORIAL.md) | The AI stack from zero to a cited answer |
| [EVALUATION-PROTOCOL.md](operations/EVALUATION-PROTOCOL.md) | Baseline measurement and the validation logbook |

Deployment lives outside `docs/`, next to what it deploys:
[../deploy/README.md](../deploy/README.md), [../rag/README.md](../rag/README.md),
[../ingest/README.md](../ingest/README.md).

## `project/` — dissertation and viva artifacts

Time-boxed to the 2026 academic submission. Accurate as records of that phase; not a guide
to the system.

[ACTION-PLAN.md](project/ACTION-PLAN.md) · [VIVA-PLAN.md](project/VIVA-PLAN.md) ·
[VIVA-QA.md](project/VIVA-QA.md) · [REPORT-REPO-MAP.md](project/REPORT-REPO-MAP.md) ·
[GAP-CLOSURE-PLAN.md](project/GAP-CLOSURE-PLAN.md)

## `history/` — shipped and superseded

Design records for work that is done. Retained for the *why*, not the *what* — for current
behaviour, read `engineering/`.

[OVERHAUL-PLAN.md](history/OVERHAUL-PLAN.md) (T0–T6, all shipped) ·
[ARCHITECTURE-REMEDIATION.md](history/ARCHITECTURE-REMEDIATION.md) (2026-07-25 audit; three
items still open, tracked as WP-0) ·
[PMS-SENIOR-TRACK-PLAN.md](history/PMS-SENIOR-TRACK-PLAN.md) (shipped 2026-07-26)

Also here in spirit: [superpowers/](superpowers/) (dated design specs and plans) and
[archive/](archive/) (superseded intelligence documents).

---

## Redirects

`ARCHITECTURE.md`, `STRUCTURE.md` and `DATA-MODEL.md` remain at this level as pointers
only — their content was merged into `engineering/` on 2026-08-08. They stay at their
original paths so old links resolve.

## Where to add a new document

```
Describes how the system works now?        → engineering/
Proposes future work?                      → roadmap/sources/, then index it in ROADMAP.md
Describes how to run or measure it?        → operations/
Dissertation / viva artifact?              → project/
Record of work already shipped?            → history/
```

One rule: **a document states what is true, and marks what is not yet true as Planned.** A
doc that describes an intention as if it shipped is worse than no doc.
