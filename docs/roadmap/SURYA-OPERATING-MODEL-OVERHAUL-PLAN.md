# SURYA Operating Model Overhaul — Phased Product Plan

**Status:** Proposed; planning document only  
**Created:** 2026-10-31  
**Context:** Follows the completed UX/navigation modernization. This plan expands the product around continuous institutional data stewardship, business-case lifecycle management, and access-shaped individual workspaces.

## 1. Product ambition

Make SURYA the place where institute business cases and institutional data stay current because maintaining them is part of doing the work. Stakeholders should not have to remember a separate reporting chore, find a hidden upload page, or re-enter data already held elsewhere. The system should ask each person only for the information they own, at the time it becomes relevant, in a workflow matched to their role and access.

SURYA should connect the lifecycle:

```text
Opportunity / need → business case → decision → funded work → evidence and updates
       → outcome / impact → technology, IP, partnership, or closure
```

The same governed records should power role workspaces, management views, analytics, alerts, and exports. Role-based access controls what a person may see or do; individual workspace choices control how they organize permitted work.

## 2. Desired outcomes

1. **More complete, fresher data:** priority domains have named owners, expected update cadence, clear provenance, and visible freshness/completeness.
2. **Less reporting friction:** contributors can confirm, correct, or add only changed information; imports are assisted and errors are actionable.
3. **Business cases are first-class:** each case has an owner, evidence, decisions, milestones, financial picture, risks, outcomes, and links to the records that support it.
4. **Useful to every level:** institute leaders see portfolio choices and exceptions; divisions see their portfolio and gaps; project teams see delivery work; contributors see clear, manageable requests; support teams see their assigned queue.
5. **Individual exploration is safe:** a person can find their permitted work, understand why a feature is available, configure a personal home, and explore related records without seeing beyond their entitlement.
6. **Ownership is actionable:** missing data creates a request to the responsible steward, with context and a completion path, instead of a generic warning to “upload data.”
7. **Decisions remain human:** SURYA surfaces evidence, gaps, options, and consequences. It does not make sanction, funding, appraisal, staffing, or allocation decisions autonomously.

## 3. Product model

### 3.1 Separate three ideas that are often mixed together

| Layer | Answers | Examples |
|---|---|---|
| **Identity and assignment** | Who is this person, and what institutional relationships apply? | User, staff link, division, projects, committees, delegated stewardship |
| **Entitlement** | What records and actions are they allowed to access? | Existing role/feature grants plus record-level scope and RLS |
| **Workspace** | Of the allowed work, what should this person see first and how do they prefer to work? | Personal home cards, saved filters, recent records, subscriptions, density |

Workspace personalization must never grant access. The interface should make active role and scoped context visible. Feature access should use clear permission packages or policy rules where possible; avoid unreviewable one-off user exceptions becoming the main authorization model.

### 3.2 Treat a business case as a connected lifecycle record

Create a business-case portfolio view and lifecycle around existing proposals, projects, reports, budgets, outputs, IP, partnerships, and commercialization records. Do not copy the same record into a parallel “case” silo. The case should link to canonical records and carry the decision context and traceability that do not currently have a clear home.

Proposed lifecycle stages (validate names and gates with AMPRI stakeholders):

1. **Opportunity captured** — a need, research opportunity, partner request, capability gap, or commercialization lead.
2. **Case being prepared** — owner, proposed outcome, evidence, team, effort, cost, funding path, risks, milestones, and partner information assembled.
3. **Decision pending** — reviewers, decision date, questions, and required evidence visible.
4. **Approved / declined / deferred** — outcome and rationale recorded; approval must follow existing authority and audit rules.
5. **In delivery** — linked project, spend, milestones, reports, staff, facilities, risks, and decision changes.
6. **Outcome / transition** — outputs, IP, technology readiness, licensing/transfer, partnership value, impact, lessons, and close-out evidence.

Some cases will stop at intake or be declined. Capture a concise reason so the institute learns from the portfolio without demanding a full proposal for every idea.

## 4. New product ideas to validate

These are options for discovery and phased pilots, not assumptions that users want every feature.

### A. “Update what changed” instead of recurring blank forms

- At the start of a reporting period, prefill known data and show the last-confirmed date/source.
- Ask the owner to confirm unchanged fields, edit changed fields, and explain only material variances.
- Compare proposed changes with the previous record and show a reviewable before/after summary.
- Allow a delegate to prepare an update while the accountable owner reviews or confirms it.

### B. Stakeholder contribution inbox

- One short queue of assigned data requests across project reports, personnel, equipment, outputs, agreements, and case evidence.
- Each request says why it is needed, who needs it, due date, estimated effort, source data already known, and one direct completion action.
- Offer “not mine,” delegate, request clarification, cannot provide, and snooze-with-reason options; route the item to the right steward rather than losing it.
- Batch related requests and let a data steward update multiple rows in one review session.

### C. Data stewardship map

- For every data domain and critical field, identify system of record, accountable office, operational steward, contributing roles, cadence, accepted evidence, and escalation path.
- Show records missing an owner separately from records missing data.
- Support domain-level stewards and delegated contributors without confusing stewardship with permission to access unrelated data.
- Start with the domains that power business cases: projects, budget/utilization, milestones/reports, staff/project team, instruments, outputs/IP, partnerships, and transfer/commercialization.

### D. Assisted intake and import concierge

- Reuse the existing import pipeline but turn it into a guided path: choose data type → download a current template or reuse a source → map columns → preview changes → resolve exceptions → confirm import → see what changed.
- Remember validated column mappings per source office/file format; flag only new or ambiguous columns.
- Show row-level errors with plain-language fix instructions and allow safe retry without re-entering valid rows.
- Provide an update/API/feed path for systems that can supply data reliably; keep human review and provenance. Do not promise integrations until source owners and access are agreed.
- Offer a “send us the file” intake route only if governance, malware scanning, ownership, and retention are designed; otherwise keep uploads inside the authenticated workflow.

### E. Business-case readiness and evidence coach

- Show a readiness checklist appropriate to the case type and stage: purpose, expected benefit, baseline, options, costing, funding, people/capacity, infrastructure, risk, partner, milestones, and evidence.
- Distinguish required, recommended, not applicable, and unknown. Explain why a missing item matters; do not use a single opaque readiness score as a decision.
- Link every checklist item to an existing record or an easy action to add evidence.
- Let reviewers request a specific change against an evidence item; retain the response and decision history.

### F. Portfolio and scenario workspace

- Let leaders and division heads compare an authorized portfolio by status, strategic theme, funding source, division, timeline, risk, outcome, and missing evidence.
- Support saved views and “what needs attention” queues, with traceable filters and definitions.
- Provide scenario views for discussion (e.g., delayed, at risk, awaiting decision) without automatically recommending who should receive staff or funds.
- Separate actuals, commitments, forecasts, and estimates; show source and “as-of” date.

### G. Contribution-friendly motivation

- Close the loop: show contributors where their update appeared (case, report, dashboard, decision) and acknowledge accepted/rejected changes.
- Give managers a team-level view of request status and blockers, not a punitive leaderboard of individual lateness.
- Recognize useful contributions through workflow feedback and reduced duplicate requests. Avoid gamification that encourages low-quality uploads.

## 5. Phased execution plan

### Phase 0 — Validate operating reality and choose the pilot

**Goal:** Confirm who owns data and business-case decisions before redesigning forms or creating integrations.

**Work**

1. Interview/observe representatives: Director/leadership, division head/HOD, PI/project staff, scientist, finance, HR/data steward, technician/facility owner, partnership/IP support, and system administrator.
2. Map 3–5 real business cases from first signal to outcome. Include one active funded project, one proposed/awaiting decision case, and one partnership or commercialization case.
3. For each selected case, map the data it needs, its source, current file/form/email location, owner, update cadence, quality failures, and downstream decisions.
4. Identify why stakeholders do not upload: effort, unclear ownership, duplicate entry, unavailable source, fear of scrutiny, lack of feedback, access barriers, or workflow timing. Validate each reason rather than assuming reluctance is a UI problem.
5. Pick a pilot domain with frequent updates, a willing accountable owner, measurable value, and manageable integrations. Prefer project progress/business-case evidence if users confirm the workflow is representative.
6. Agree on data classification, authority, access model, and retention before moving sensitive records or accepting inbound files.

**Deliverables**

- Stakeholder/persona and decision-rights map.
- Data stewardship matrix for pilot domains.
- Current-state workflow and friction inventory.
- Business-case lifecycle, stages, and decision gates validated with owners.
- Pilot charter: roles, cases, measures, systems, exclusions, and accountable sponsor.

**Exit criteria:** Every pilot data element has a known source or an explicitly accepted manual owner; pilot participants agree on the case stages and outcomes; major access/privacy constraints are recorded.

### Phase 1 — Make contribution requests easy and owned

**Goal:** Convert missing/stale data into a small, clear task for the person or office that can resolve it.

**Work**

1. Introduce steward/owner metadata for pilot data domains and record families.
2. Build a role-scoped contribution inbox with due/overdue, blocked, delegated, and completed states.
3. Generate requests from missing required evidence, approaching reporting dates, stale records, or an explicit case workflow step.
4. Prefill known values, cite their source/as-of date, and request confirmation or delta updates.
5. Support delegate preparation, owner confirmation, correction, not-mine routing, and clarification requests.
6. Give the requester a direct link to the exact record/form/row, not a generic module homepage.
7. Record source, contributor, reviewer, timestamp, and accepted change for audit/provenance.

**Deliverables:** Contribution request model, inbox views per pilot role, update/confirm forms, ownership map, request/audit history.

**Exit criteria:** A contributor completes a request without finding the module manually; an unowned request routes for ownership instead of repeatedly notifying the wrong person; existing RLS remains authoritative; request completion updates the requesting case/report and acknowledges the contributor.

### Phase 2 — Business-case portfolio and lifecycle

**Goal:** Give institutional business cases one connected, decision-ready home.

**Work**

1. Define case types and minimum fields by stage; keep intake deliberately short.
2. Link cases to existing proposal, project, budget, report, staff, instrument, output, IP, MoU/partnership, and transfer records using canonical IDs.
3. Create portfolio list, case overview, timeline, evidence checklist, decision record, risks/blockers, financial summary, outcomes, and related-record sections.
4. Map approval/review actions to the existing institutional authority model and server-side state transitions; do not invent a generic approval chain that bypasses current rules.
5. Make missing evidence create contribution tasks from Phase 1.
6. Support close, defer, decline, and transition outcomes with reason and evidence, not just “complete.”

**Deliverables:** Case taxonomy, lifecycle specification, linked case pages, portfolio filters, decision history, audit coverage.

**Exit criteria:** A pilot case can be traced from intake/decision through delivery and outcome without duplicate record entry; reviewers can identify evidence, costs, assumptions, and unresolved items; all decisions remain attributable and permission-scoped.

### Phase 3 — Role and individual workspaces

**Goal:** Make the product relevant to what each person is accountable for, while strictly limiting information to their entitlement.

**Work**

1. Create a role/task matrix for all user types, beginning with business-case participants and data stewards. Include view, create, contribute, review, approve, administer, and export permissions.
2. Audit role grants and person-to-staff linking. Resolve ambiguity for users with multiple roles and make active context explicit.
3. Build role homes from actions, owned/delegated requests, authorized business cases, deadlines, and a small set of scoped portfolio signals.
4. Let individuals configure allowed home cards, default filters, saved views, and subscriptions. Personalization must only rearrange or narrow already-authorized information.
5. Provide a permission-aware “Explore my work” area: my profile/assignments, my cases, my projects, contributions due, followed records, and recently viewed items.
6. Add a clear “why can I see this?” explanation where useful, and a request-access path for records/features the user needs but cannot access.
7. Ensure access changes take effect in search, links, previews, notifications, exports, and cached workspace data.

**Deliverables:** Permission matrix, role home specs, user workspace preferences, multi-role context behavior, access request journey, individual exploration map.

**Exit criteria:** Each pilot persona has a useful first screen; users can only discover authorized records; preference changes do not alter entitlements; multi-role users can tell which context is active; users can request access without exposing inaccessible record details.

### Phase 4 — Business intelligence and portfolio decision support

**Goal:** Turn complete cases and continuous updates into useful, qualified views for different decision levels.

**Work**

1. Define a governed metric catalog for portfolio status, funding/actuals, milestone health, reporting completeness, outputs/IP, partnerships, and outcomes.
2. Separate actual, committed, forecast, estimated, and missing values. Add definitions, period, source, scope, freshness, and caveats.
3. Create leader, division, finance, case-owner, and support views from the same governed case data, each with appropriate scope.
4. Connect every signal to the records and open tasks that explain it. Provide filtered export with provenance.
5. Add portfolio comparisons and scenario views only after baseline completeness and comparable definitions are adequate.
6. Keep the final decision human and capture the rationale/assumptions.

**Deliverables:** Metric catalog, role-scoped portfolio views, linked exception queues, evidence-backed reports, scenario prototypes.

**Exit criteria:** A dashboard number can be traced to a definition, authorized records, source, and as-of date; no scenario implies an automated allocation decision; missing data is visibly distinct from zero.

### Phase 5 — Assisted ingestion and source connections

**Goal:** Reduce manual effort where data already exists in office files or trusted systems.

**Work**

1. Upgrade the import journey to source-specific templates, remembered mappings, change previews, validation fixes, deduplication, partial retry, and an import receipt.
2. Identify high-value sources through Phase 0 and estimate owner, API/file availability, refresh cadence, quality, and maintenance cost.
3. Add one integration at a time, beginning with the most reliable source that removes duplicate entry for a pilot stakeholder group.
4. Retain source provenance and a human review step for ambiguous or consequential changes.
5. Notify stewards about failed/partial syncs with an easy repair path.
6. Consider secure email/folder ingestion only when ownership, access, scanning, retention, and idempotent retry are resolved.

**Deliverables:** Source registry, import receipts, source adapters, reconciliation/error queue, integration ownership and monitoring.

**Exit criteria:** Each connection has an accountable owner and failure path; duplicate records are not silently created; data changes are traceable; the manual route remains usable if the source fails.

### Phase 6 — Adoption, governance, and scale

**Goal:** Prove that the new operating model improves data currency and decisions, then extend it safely.

**Work**

1. Pilot through at least one complete reporting or business-case cycle; include people who currently contribute reluctantly.
2. Measure request completion time, on-time/complete updates, correction rate, duplicate-entry reduction, case decision lead time, and number of decisions supported by traceable evidence.
3. Gather qualitative feedback on request burden, trust, clarity of ownership, and whether contributors see value after updating.
4. Review access logs, delegation, audit, data retention, and search/notification leakage.
5. Update workflows where a request is ignored because it is unnecessary, poorly timed, duplicated, or assigned to the wrong person.
6. Expand to additional domains only when the pilot has working stewardship and quality measures.
7. Treat lab notebook, datasets/samples, cross-lab federation, and network-wide ontology as later strategic programs, not prerequisites for proving this operating model.

**Exit criteria:** Pilot targets are met or revised with evidence; data owners and support responsibilities are staffed; access, audit, and retention are approved; scale decision has an accountable sponsor.

## 6. Role capability starting matrix

This is a discovery starting point, not a final permission grant. Exact roles, assignments, and data scopes must be checked against the access matrix and institutional authority.

| Persona / role cluster | Primary job in SURYA | Workspace should prioritize | Typical capabilities to validate |
|---|---|---|---|
| Director / institute leadership | Portfolio choices, approvals, exceptions, outcomes | Cases awaiting decision, major risks, finance/outcome summary, data confidence | Institute-scoped read; approve/return where authorized; decision rationale |
| Division Head / HOD | Manage division portfolio and submissions | Division case pipeline, missing updates, capacity, deadlines, cross-project risks | Division-scoped review; assign/delegate requests; submit/review at authorized gates |
| PI / Scientist | Develop and deliver research work | My cases/projects, next report, evidence gaps, team, outputs/IP, partner actions | Create/maintain own cases; contribute evidence; submit; see related authorized records |
| Project staff / technician / facility owner | Provide operational updates and evidence | Assigned requests, equipment/instrument status, milestone evidence, upcoming due work | Update assigned operational fields; upload evidence; view scoped project/instrument context |
| Finance / HR / data steward | Validate a domain and keep its records current | Domain queues, exceptions, source freshness, imports awaiting resolution | Domain-scoped edit/review/import; corrections with provenance; delegate to known owners |
| Partnership / IP / transfer support | Move opportunities toward protected/market use | Leads, agreements, IP deadlines, partner steps, readiness evidence | Manage assigned specialist records; contribute linked case evidence; restricted access where needed |
| Committee / reviewer | Review and record a decision or action | Assigned cases, required evidence, meeting agenda, decision/action follow-up | Time/scoped access to assigned cases; comment/recommend/decide only within mandate |
| Student / guest / public-facing user | Complete own task or explore approved information | Own milestones/records or public/approved portfolio information | Self-scoped view/update; no institute-wide private analytics |
| System / master admin | Operate platform and manage access | Data health, integration status, user/role lifecycle, audit | Platform administration separated from routine business approval |

## 7. Information architecture target

Keep the completed navigation improvements, but orient primary destinations around the work users are accountable for:

1. **My Work** — personal actions, contribution requests, assigned cases, deadlines, followed records.
2. **Business Cases** — intake, portfolio, review queues, decisions, delivery, outcomes.
3. **Research Portfolio** — projects, proposals, reports, finance, people, facilities, outputs/IP, partnerships.
4. **People & Organisation** — staff, divisions, students, recruitment, expertise.
5. **Governance** — PMS, committees, decisions, audit, helpdesk.
6. **Explore & Ask** — authorized records, analytics, graph, grounded document questions.
7. **Data Stewardship** — source catalog, imports, freshness, quality exceptions, ownership, sync status.
8. **Administration** — identity, role/feature policy, system health, settings.

Show only authorized sections and actions, but make hidden/unavailable functionality discoverable through an access request where appropriate. On first login, offer a short “choose your work context” or “take a guided tour” path only if role and assignments are ambiguous; do not force every returning user through onboarding.

## 8. Measures of success

Set numeric targets after Phase 0 baseline. Do not set arbitrary upload quotas before learning why data is missing.

### Data operations

- Share of priority data domains with a named accountable owner and steward.
- On-time update completion and freshness by domain/role.
- Median time to complete a contribution request.
- Share of requests resolved via confirm/delta update rather than full re-entry.
- Import first-pass acceptance, row correction rate, duplicate rate, failed-sync recovery time.
- Number of repeated requests caused by unclear ownership or duplicate collection.

### Business cases

- Share of active cases with owner, decision status, funding/estimate, milestones, risks, and outcome evidence appropriate to stage.
- Time from opportunity intake to decision; time waiting on evidence by owner/domain.
- Share of decisions traceable to linked evidence and recorded rationale.
- Close-out completeness for outcomes, outputs/IP, transfer/partnership, and lessons.

### Individual experience and governance

- Time for each persona to find assigned next action and relevant case.
- Task completion without navigation assistance; dead links and abandoned requests.
- Permission incidents and access-request resolution time.
- User-reported duplicate effort, usefulness of alerts, and confidence in data definitions.

## 9. Risks and guardrails

| Risk | Guardrail |
|---|---|
| More reminders create fatigue | Send actionable, deduplicated requests with owner, reason, effort, and direct completion path; tune cadence from response data |
| Staff perceive monitoring as punitive | Emphasize evidence quality and blockers; avoid personal late-work leaderboards; clarify who sees contribution status |
| Personalization becomes an access bypass | Keep workspace preferences separate from entitlements; enforce RLS on every underlying record and query |
| Business case becomes a duplicate database | Link canonical records; only store decision context that has no existing authoritative home |
| Integration failure silently corrupts records | Source provenance, import preview, idempotency, reconciliation queue, owner, and retry path |
| Low-quality data creates false confidence | Show freshness/completeness and uncertainty; separate zero, missing, estimated, and stale |
| Too much scope delays value | Pilot one case lifecycle and a few data domains; add integrations and extra case types only after measured adoption |
| Automation appears to decide funding or staff allocation | Keep recommendations descriptive and evidence-based; record the human decision and rationale |

## 10. Execution packet for each phase

Before implementation, turn the phase into a build-ready spec with:

- Named sponsor, process owner, data stewards, and representative contributors.
- The user journeys and case types in scope, with roles and record-level access.
- Current source-of-truth map and the fields to reuse versus introduce.
- Wireframes/states for desktop and mobile, including no-data, stale, blocked, denied, and error cases.
- Data contracts, audit/provenance, RLS rules, and server-side workflow transitions.
- A migration/backfill and rollback approach for schema changes.
- Acceptance checks tied to phase exit criteria and pilot measures.
- Training/support/communications owner; a feature is not complete when only code is shipped.

## 11. How this plan relates to prior planning

- The previous UX/navigation plan is treated as completed baseline. Revisit it only when new operating-model work exposes a concrete gap.
- `DESIGN.md` remains the UI visual contract.
- `docs/roadmap/VISION-ARCHITECTURE.md` remains the long-term institute record-spine direction.
- `docs/roadmap/ROADMAP.md` remains the broad inventory of technical/product work packages. This document is the focused execution strategy for stakeholder data continuity, business cases, and role/individual experience. Before scheduling, map selected phases to relevant master-roadmap packages and reconcile status rather than duplicating them.

## Definition of success

Stakeholders contribute accurate updates with less effort because requests arrive in their workflow, use known information, and show where the contribution matters. Leaders and case teams can follow an authorized business case from opportunity through decision, delivery, and outcome. Every individual sees a useful workspace shaped by their assignments and permissions, and every important number or decision can be traced to its supporting records.
