# One Build Order

_Written 2026-11-13. Indexed from [`../ROADMAP.md`](../ROADMAP.md). This file adds no new
work. It puts the phases of eight plans into one order._

| Plan | IDs |
|---|---|
| [`2026-11-12-enterprise-phases.md`](../../superpowers/plans/2026-11-12-enterprise-phases.md) | `P1`–`P9` |
| [`COMMITTEE-MODULE-PLAN.md`](COMMITTEE-MODULE-PLAN.md) | `CM0`–`CM8` |
| [`SCIENTIST-HOME-PLAN.md`](SCIENTIST-HOME-PLAN.md) | `SH1`–`SH6` |
| [`HOD-HOME-PLAN.md`](HOD-HOME-PLAN.md) | `HH1`–`HH8` |
| [`DIRECTOR-HOME-PLAN.md`](DIRECTOR-HOME-PLAN.md) | `DH1`–`DH13` |
| [`OTHER-ROLES-HOME-PLAN.md`](OTHER-ROLES-HOME-PLAN.md) | `ST1`–`ST4`, `PJ1`–`PJ4`, `TS1`–`TS5` |
| [`COMMON-DESK-PLAN.md`](COMMON-DESK-PLAN.md) | `CD0`–`CD17` (phases A–E) |

---

## 1. Where the code is today (looked at 2026-11-13)

Migrations `20261112000004` … `20261113000004` are on disk from the other session. By their
names they cover enterprise **P1** (`csir_rules`, identity links, typed dates,
`entity_timeline`), **P2** (staff profile), **P3** (conflict declarations, packs, CPD,
stage gate, equipment usage log), **P4** (PMS 2026) and **P5** (sanctioned posts, workload,
project staff engagement, recruitment and acting charges).

**Not verified here:** that these pass the tests, or that they are committed. `git status`
showed them as uncommitted work. P6–P9 have no migrations yet.

So the base that the home screens need (`csir_rule()`, `staff_profile_facts()`,
`entity_timeline`, `acting_assignments`, `project_engagements`, `sanctioned_posts`) is on
disk. No home-screen or committee-module code exists yet.

---

## 2. Rules for the order

1. **Shared engines before screens that use them.** Five things are used by many plans.
   Build each once, early:

   | Engine | Built in | Used by |
   |---|---|---|
   | `HomeContext`, `src/lib/home/` | `SH1` | every role screen, `CD0` |
   | Priorities (`work_priorities`) | `SH3` | all six roles; watch list "Pin to head" |
   | Decision queue (`my_decisions()`) | `HH2` | head, Director, `CD6`, delegation |
   | Signatures (attest + PDF hash + `/verify`) | `CM5` | delegation orders, letters, minutes, APAR tasks, print |
   | File imports from CPS / AMS / eHRMS | `SH6` | office tracker, fund status, purchase plan, people today |

2. **Screens on today's data ship first.** Each role gets a better page at once; depth
   comes later.
3. **Nothing waits on a file from outside.** Work that needs the institute's files is in
   the last wave, and each has a "works by hand until then" path.
4. **Two sessions, two lanes.** Two writers must not touch the same files. The lanes in §4
   are split by folder.
5. Every phase ends with `npm run build`, `npm run lint`, `npm test`,
   `python scripts/check_security_definer.py`, and a look in the running app.

---

## 3. The order, in seven waves

Effort: `S` half a day · `M` 1–2 days · `L` 3+ days · `XL` multi-week.

### Wave 0 — Make the ground firm

| Step | What | Effort |
|---|---|---|
| 0.1 | Other session: run the health stack on P1–P5; commit | — |
| 0.2 | Fix the link fault in `src/components/pms/ReportItemsPanel.tsx` (render only `http(s)://` and single-`/` links) | S |
| 0.3 | Owner: answer the "default" questions that change a schema (list in §6) | — |

**Gate:** `main` is green with P1–P5 in it.

### Wave 1 — Frames

| Step | Phase | Why now | Effort |
|---|---|---|---|
| 1.1 | `SH1` scientist screen + `HomeContext` + `src/lib/home/` | Every screen stands on it | L |
| 1.2 | `CD0` shell (two halves, right column) | Fixes the page shape before five more screens are drawn into it | M |
| 1.3 | `CM0` committee foundations (plan is ready) | Seats and stages are needed by every committee block | L |

**After this wave:** scientists have the new page; the page has two halves.

### Wave 2 — Every role gets a page

| Step | Phase | Effort |
|---|---|---|
| 2.1 | `HH1` head · `DH1` Director | L + L |
| 2.2 | `ST1` student · `PJ1` project staff · `TS1` technical staff | M + M + M |
| 2.3 | Common Desk phase A: `CD1` my day, `CD3` one door, `CD2` my requests (today's sources) | L |
| 2.4 | `SH2` report timers | M |
| 2.5 | `CM1` schedule, rooms, refreshments — with a `kind` column on `rooms` (see `CD15`) | L |

**After this wave:** all six roles open a page made for them. The old count-card
dashboards are gone.

### Wave 3 — The three engines of follow-up

| Step | Phase | Effort |
|---|---|---|
| 3.1 | `SH3` priorities → then `HH7` (both sides for the head) and the Do-first block on every role | L + S |
| 3.2 | `HH2` decision queue → `CD6` block | L |
| 3.3 | `SH4` nudges and the escalation ladder | M |
| 3.4 | `CD4` notices and office orders | M |
| 3.5 | `CM2` agenda and circulation · `CM3` the meeting | L + M |

**After this wave:** a senior can pin a priority; an approver has one queue; the system,
not the person, does the reminding; the first office order is issued in the app.

### Wave 4 — Delegation and signatures

| Step | Phase | Effort |
|---|---|---|
| 4.1 | `CM4` minutes · `CM5` signatures | L–XL + L |
| 4.2 | `DH2` delegation core (the order is issued as a `CD4` notice, signed with `CM5`) | L |
| 4.3 | `HH3` pre-checks and Ask | M |
| 4.4 | `DH3` modules obey the dial — hiring and progress reports first, then one module at a time | L |
| 4.5 | `DH4` flags, sample, call back | M |
| 4.6 | `CD10` general meetings | M |

`DH2` may start before `CM5` with password attest alone; it takes the signature page when
`CM5` lands.

**After this wave:** the Director sets how much reaches the desk; every decision carries
its authority; minutes are signed in the app.

### Wave 5 — Remove the daily follow-up

| Step | Phase | Effort |
|---|---|---|
| 5.1 | `TS2` instrument bookings | L |
| 5.2 | `PJ2` leave · `PJ3` letters (the letter engine also serves `ST4`, `CD12`) | M + L |
| 5.3 | Common Desk phase C: `CD8` letters register, `CD9` forms shelf, `CD16` safety, `CD14` print | L |
| 5.4 | `HH4` reports that go up | L |
| 5.5 | `DH13` briefing and watch list (tags: people, project, committee, upward, decisions) | L |
| 5.6 | `DH9` twelve months and people plan | M–L |
| 5.7 | `CM6` tasks and follow-up | M–L |
| 5.8 | `DH5` Headquarters desk — built as a view over `CD8` | M |

**After this wave:** the things people chase today — a slot, a leave, a certificate, a
letter, a division report — are asked once and tracked by the app.

### Wave 6 — Depth

| Step | Phase | Effort |
|---|---|---|
| 6.1 | `HH5` technologies · `HH6` outside threads | L + M–L |
| 6.2 | `ST2` gates and fellowship clock · `ST3` supervisor meetings · `ST4` private route | M each |
| 6.3 | `PJ4` contract end and what next | M |
| 6.4 | `TS3` faults and calibration · `TS4` appraisal record · `TS5` work is seen | M + L + S–M |
| 6.5 | `DH8` hand-over between Directors | S–M |
| 6.6 | `CM7` transcript · `CM8` monitoring and the minutes book | M + L |
| 6.7 | `SH5`, `HH8`, `DH7` — switch on the blocks that waited on the phases above | M, in pieces |
| 6.8 | Common Desk phase E: `CD12` no-dues, `CD13` Hindi labels, `CD15`, `CD17` | M each |

### Wave 7 — Needs something from the institute

| Step | Phase | Needs | By hand until then |
|---|---|---|---|
| 7.1 | `SH6` imports | CPS, AMS, eHRMS sample files with a project number per row | — |
| 7.2 | `DH10` fund status | AMS file; list of budget heads | **Yes** — Accounts types figures weekly. Start in wave 5 if wanted |
| 7.3 | `DH11` purchase plan | `DH10`; CPS file for live stages | Yes — status set by hand |
| 7.4 | `DH6` stuck in offices · `DH12` infrastructure and administrative matters | CPS, AMS, eHRMS files | Works register by hand |
| 7.5 | Common Desk phase D: `CD5` people today, `CD11` substitutes, `CD7` e-mail digest | eHRMS leave file; SMTP relay | `CD11` works for project staff and acting charges |
| 7.6 | `DH2` floor, final | CSIR Delegation of Powers text | Yes — the guessed floor, marked "unverified" |

Any step here moves to an earlier wave the day its file arrives.

### Enterprise P6–P9 (other session, in parallel)

| Phase | Start | Who waits for it |
|---|---|---|
| `P6` Expertise | any time | Ask box "who has worked on X" (head, Director); visit briefs (`HH6`); "sole expert" (`DH9`) |
| `P7` Numbers and screens | before wave 5 | The Director's figures should read `metric_value` so numbers agree everywhere; report packs for `HH4` |
| `P8` AI actions | after wave 4 | Model-written briefing paragraph (`DH13`); reply drafts (`DH5`); `CM7` draft |
| `P9` Project breadth | last | Nothing in these plans |

---

## 4. Two lanes for two sessions

| Wave | Lane 1 — home screens and common desk (`src/pages/dashboards/`, `src/components/home/`, `src/lib/home/`) | Lane 2 — modules and data (`src/pages/committees/`, module RPCs, enterprise) |
|---|---|---|
| 1 | `SH1`, `CD0` | `CM0` |
| 2 | `HH1`, `DH1`, `ST1`, `PJ1`, `TS1`, CD phase A, `SH2` | `CM1`, `P6` |
| 3 | `SH3`, `HH7`, `HH2`, `SH4`, `CD4` | `CM2`, `CM3`, `P7` |
| 4 | `DH2`, `HH3`, `DH4`, `CD10` | `CM4`, `CM5`, `DH3` (it edits module RPCs) |
| 5 | `HH4`, `DH13`, `DH9`, `DH5`, CD phase C | `TS2`, `PJ2`, `PJ3`, `CM6`, `P8` |
| 6 | `ST2`–`ST4`, `PJ4`, `DH8`, CD phase E, switch-ons | `HH5`, `HH6`, `TS3`–`TS5`, `CM7`, `CM8`, `P9` |

Both lanes write migrations. Rule: take the next free timestamp at the moment of writing,
and never edit a migration the other lane wrote. Both lanes touch `DataContext.tsx`,
`src/types/index.ts` and `ROADMAP.md`; keep those edits small and merge often.

---

## 5. What each wave gives the institute

| After wave | A person can say |
|---|---|
| 1 | "The scientist page tells me what to do next." |
| 2 | "Whatever my role, the first page is about my work — and my day, my requests and one door to ask are always on the right." |
| 3 | "My senior's priority is at the top. Approvals come to one list. I am reminded before, not after." |
| 4 | "The Director chose what to decide. Each decision shows under whose order it was made. Minutes are signed here." |
| 5 | "I asked once for a slot, a leave, a letter. I can see where each one is. The division report wrote its own first draft." |
| 6 | "Students, project staff and technical officers have their full pages. Technologies and outside work have a record." |
| 7 | "Purchase, bills and funds show here without anyone typing them twice." |

---

## 6. What I need from the owner, in the order it blocks

| Needed before | Item |
|---|---|
| Wave 1 | Go-ahead for this order; who builds lane 1 and lane 2 |
| Wave 2 | `CM1`: confirm rooms get a `kind` (room, vehicle, guest house) |
| Wave 3 | Escalation ladder (who is told, when): defaults in `SH4`, `HH` §4. Who may issue notices (`CD4`) |
| Wave 4 | **CSIR Delegation of Powers text** (the floor of the dial). Kinds of decision to list on the dial |
| Wave 5 | Who signs certificates; is eOffice in use (`CD8`); which reports a head owes upward (`HH4`) |
| Wave 7 | **CPS, AMS, eHRMS sample files**; list of budget heads; SMTP relay |

Each plan lists its other open questions with defaults. A default is used when no answer
is given, and is written in the code as a setting, not a constant, wherever the plan says so.

---

## 7. What this order leaves out

- Screens for the DG and Headquarters, `HRAdmin`, `FinanceAdmin`, `PME`, and the desks
  (Purchase, Accounts, Diarist, Works). They use the common half today; role halves can
  follow the same pattern later.
- The items scored `Later` in the enterprise plan.
