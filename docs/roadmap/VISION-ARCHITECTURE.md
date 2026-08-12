# SURYA — Vision Architecture: The Institute's Record Spine

> **STATUS: KEEP — PERMANENT VISION DOCUMENT**
> This document describes where the system should go after the current phase and
> must be **retained once the current phase is over** (dissertation submission &
> viva, pilot validation at CSIR-AMPRI — 2026). It is not a phase-specific plan:
> do not archive, delete, or move it with the dissertation-era documents. Treat it
> as the standing north-star reference for all future SURYA development.
> Last reviewed: 2026-08-08.

---

## 1. Purpose

For a CSIR-scale research organisation, the system should become the **institute's
memory spine** — not a document store and not a dashboard suite, but the single
governed layer through which every research record is captured, retrieved, shared,
and preserved. This document sets out the target architecture and feature set for
record keeping, record retrieval, and record accessibility across a research
laboratory and, over time, the CSIR laboratory network.

Audience: future SURYA maintainers, the institute's data stewards, and anyone
extending the pilot beyond AMPRI.

---

## 2. Design principles (non-negotiable)

1. **Capture as a by-product of work.** A record system fails if it asks scientists
   to file things as an extra duty. The workflow itself (proposal, report, notebook
   entry, patent step, committee minute) *is* the record. If a feature requires
   retro-filing, it is wrong.
2. **Single source of truth.** One record, one home, one ID. No parallel copies in
   email, personal drives, or spreadsheets.
3. **Governance at the record, not the module.** One entitlement model, one audit
   model, one classification scheme across every kind of record.
4. **Federation over centralisation.** Each laboratory owns its data; network-level
   retrieval happens through negotiated federation, never by centralising
   restricted records.
5. **Provenance on every output.** Every retrieval — human search, AI answer,
   export — carries the chain: record → version → page → creator. This is the M3
   traceability DNA of the current pilot, extended to *all* records, not just AI
   answers.
6. **Stable identifiers everywhere.** Every record gets a persistent ID and a
   citable form, the way publications already have DOIs.

---

## 3. Pillar 1 — Record keeping: capture everything that matters

### 3.1 Research lifecycle records
| Capability | What it means | Why it matters |
|---|---|---|
| Digital lab notebook (ELN) | Timestamped, versioned, witness-signed entries (scientist + supervisor attestation); mandatory metadata: project, instrument, material batch, personnel | The primary evidence record of research; tamper-evident by design |
| Raw data & dataset registry | FAIR-aligned: Data Management Plan per project; datasets get stable IDs, embargo periods, links to the publication/patent they underpin; "no data, no final report" workflow rule | Makes data a first-class research output; supports reproducibility and audit |
| Sample & material registry | Sample IDs with full provenance (synthesis route, parameters, storage location, disposal); chemical inventory tied to safety | Samples are the physical counterpart of every claim; loss of provenance voids the claim |
| Instrument run records | Equipment auto-logs operator, time, parameters; linked to notebook entries and project | The evidence chain behind publications and audits |
| Project master file | Complete official file per project in one chronology: sanction, revisions, extensions, fund releases, progress reports, final report, utilisation certificate, audit notes | Today the single most valuable record is spread across email and paper; this is the highest-priority capture target |

### 3.2 Output pipeline records
- **Publication workflow file** — draft → internal review → originality/IP check →
  submission → acceptance, all versions and dates retained.
- **Patent prosecution file** — invention disclosure → prior-art search → filing →
  office actions → responses → grant → annuity/renewal → licensing, every step
  dated (today run from personal spreadsheets by IP officers).
- **Thesis records** — synopsis reviews, examiner reports, viva minutes,
  conferral, and an open-access thesis repository.
- **Administrative memory** — MoU/agreement register, locked committee minutes,
  training records, service books, visit reports.

### 3.3 Record lifecycle governance
- **Classification at creation** — access tier + retention class set when a record
  is born, never retrofitted.
- **Retention & disposal schedules** — per Indian public-records rules:
  hot/warm/cold archival tiers, authorised disposal with an audit trail.

---

## 4. Pillar 2 — Retrieval: recall anything, with its proof

| Capability | What it means |
|---|---|
| Universal search | One query across people, projects, documents, datasets, equipment, samples; faceted (division, date, type, classification, project) — not per-module searches |
| Entity-resolved knowledge graph | Browse relationships: co-authorship, project→instrument→sample→patent chains; the pilot's `/explore` is the seed |
| Point-in-time recall | "What did the institute know about X in 2019?" — from version history, not today's records |
| Figure-level retrieval | Search inside micrographs, charts, spectra (OCR + caption indexing + vision models) |
| Controlled vocabularies | One governed ontology for materials, techniques, divisions, expertise across all labs; vocabulary as a governed object, not free text (label drift between labs is the silent killer of network-wide retrieval) |
| Personal research assistants | Saved searches, topic alerts, watched entities, team workspaces |
| Ask the archive | Natural-language over the entire archive with the existing refusal rule; every answer offers "open the actual record" |
| Cross-lab retrieval | Before sanctioning anything, see what the whole network has done — federation, not centralisation |

---

## 5. Pillar 3 — Accessibility: right record, right person, right format

| Capability | What it means |
|---|---|
| Record-level entitlement | owner / project-group / division / institute / confidential tiers; **project-based access groups** (join project → access its records; leave → revoked); time-limited grants |
| Secure external sharing | One-click share with industry partners and funders: expiring links, watermarked PDFs, download controls, NDA-aware defaults — replacing email attachments, which are today's biggest uncontrolled record leak |
| Public transparency portal | Auto-generated public views (sanctioned projects, outputs, technologies available for licensing) from the same governed repository |
| Auditor/funder views | Read-only, exportable, PFMS/CAG-ready; utilisation-certificate generation |
| Open APIs | Authorised interchange with ERP/eHRMS/IRINS/PFMS without file downloads; researcher-facing programmatic access |
| Mobile secure read access | Read-only access on phones/tablets for visits and plant-floor use |
| Accessibility & language | WCAG compliance, screen readers, high contrast; Hindi/English interface parity |

---

## 6. Pillar 4 — Preservation & integrity: records you can trust in 20 years

| Capability | What it means |
|---|---|
| Tamper-evident audit | Append-only/hash-chained critical records (notebooks, minutes, appraisal outcomes); immutable where the law demands |
| Format preservation | PDF/A and open formats at ingest; legacy migration; no format rot |
| Cross-site backup | Irreplaceable research data replicated across sites, never one lab's server |
| Provenance on every answer | File → version → page → creator chain on all retrieval outputs, human or AI |

---

## 7. The network dimension (CSIR-wide)

- **Per-laboratory instances** of the record spine, each under its own access
  control (the pilot's scalability design already assumes this).
- **Federation layer** for cross-lab questions: duplication checks, expertise
  discovery, document delivery under negotiated inter-lab policy.
- **Network expertise directory** — who in CSIR works on what, derived from each
  lab's governed records.
- **One shared ontology** maintained network-wide; local extensions allowed but
  visible.

---

## 8. Relationship to the current pilot (SURYA today)

| Vision capability | Today | Gap |
|---|---|---|
| Unified document registry with access tiers | ✅ exists | — |
| Project/proposal/report workflow capture as by-product | ✅ exists | extend to final-report and UC automation |
| Ask-the-archive (grounded NL, refusal, citations) | ✅ exists | extend from 5 docs to the full archive |
| Knowledge graph seed (`/explore`) | ✅ partial | entity resolution + relationship browsing |
| Role-scoped dashboards | ✅ exists | — |
| RLS + audit + query log | ✅ exists | per-record change history UI |
| Digital lab notebook | ❌ | new |
| Raw data / dataset registry (FAIR) | ❌ | new |
| Sample & material registry | ❌ | new |
| Instrument run records | ❌ | new (equipment register + AMC exist) |
| Patent prosecution file | ❌ partial | IP register exists; prosecution dates/annuities new |
| Project master file (e-file) | ❌ partial | proposals/reports exist; full financial chronology new |
| Universal search | ❌ partial | command palette is navigation, not record search |
| Figure-level retrieval | ❌ | new |
| Controlled vocabularies | ❌ | free text today |
| Secure external sharing | ❌ | new |
| Public transparency portal | ❌ | new (envisioned in report §10.4) |
| Federation across labs | ❌ design only | design exists in report §10.3 |
| Tamper-evident records | ❌ | new |

---

## 9. Adoption phases (indicative)

- **Phase A — Harden the pilot (2026–27):** project master file, patent
  prosecution file, universal search, per-record change history, secure external
  sharing. Everything else in this document stays vision.
- **Phase B — Lab-wide record spine:** ELN, sample registry, instrument run
  records, dataset registry, controlled vocabularies, transparency portal.
- **Phase C — Network:** federation layer, network expertise directory, shared
  ontology.

Each phase begins only when the previous one is in daily use — the pilot-first
discipline the dissertation itself followed.

---

## 10. Success criteria for the vision

1. A scientist can reconstruct, in minutes, the full evidence trail of any
   published claim from her lab (notebook → data → instrument log → sample →
   publication).
2. An auditor can extract a project's complete official file with two clicks.
3. A proposal can be checked against the entire network's prior work before
   sanction, under entitlement, with citations.
4. External partners receive governed, expiring, watermarked access — no email
   attachments.
5. Records survive staff retirement, format migration, and site failure without
   loss.
6. The system requires no scientist to do extra filing work.

---

## 11. Non-goals (explicit boundaries)

- Replacing ERP/eHRMS transaction processing (records interchange only).
- Autonomous decisions or allocation optimisation.
- Real-time streaming; the system operates on governed, periodically ingested
  records.
- Centralising records across labs (federation only).
- Anything that weakens the grounding invariant, the whitelist-only analytics
  rule, or record-level governance.

---

## 12. Document history

| Date | Change |
|---|---|
| 2026-08-08 | Initial vision document. Created as a KEEP document: retained after the current dissertation/pilot phase ends. |
