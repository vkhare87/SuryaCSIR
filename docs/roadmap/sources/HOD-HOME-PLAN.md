# Head of Department Home — Implementation Plan

_Proposal, 2026-11-13. Item IDs `HH1`–`HH8`. Indexed from [`../ROADMAP.md`](../ROADMAP.md).
Delivers roadmap `WP-5 E` (role-first home) for the `HOD` and `DivisionHead` roles. Builds on
[`SCIENTIST-HOME-PLAN.md`](SCIENTIST-HOME-PLAN.md) (`SH1`–`SH6`) and reuses its code._

**Goal.** One screen a Head of Department opens each morning that answers, in order: what did
the Director ask for first, who is stopped until I decide, which division projects need me,
what must I send up, where do our technologies stand, what do my committees need, how are my
people, who outside is waiting on us, and are our instruments working.

**The role in one line.** A scientist *does* work. An HoD *unblocks* work. So the HoD screen
is built around **decisions**, not tasks. Its main number is "people stopped until you
answer", and its main record is the HoD's own answer time.

**An HoD is also a scientist.** Most HoDs run their own projects. The HoD screen has a
switch at the top: **Division** (this plan) and **My own work** (the scientist screen,
`SH1`). The switch is remembered per user. It is not a second login and not a role change.

---

## 1. The screen

```
┌ (ring 2/8)  Good morning, Dr. Mehta. Six decisions wait on you. Two people are stopped … ┐
│ [ Ask or search ………………………………… ]  [Pin a priority] [Call a meeting]   [Division | My work] │
├ DO FIRST · asked by the Director                                              1 of 3 ────┤
├ WAITING ON YOUR DECISION · oldest first                              people stopped: 2 ──┤
│  hire PA-I HCP0054 · rule check passed            [9 days]   [Approve] [Ask]             │
│  indent FTIR ₹7.4 lakh · similar unit 38% used    [4 days]   [Approve] [Return]          │
│  progress report GAP-207 → PME                    [2 days]   [Forward] [Read]            │
│  quick: 2 leave, 1 tour note                      [1 day]    [Approve all]               │
├ DIVISION PROJECTS · those that need you  │ REPORTS THAT GO UP FROM YOU ───────────────────┤
├ TECHNOLOGIES · readiness (TRL)           │ OUTSIDE · collaboration and visits ────────────┤
├ COMMITTEES · my seats                    │ PEOPLE · my division ──────────────────────────┤
├ INSTRUMENTS · purchases and health ──────────────────────────────────────────────────────┤
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

| # | Block | Shows | Actions from the block |
|---|---|---|---|
| 1 | Decision ring and greeting | Decisions cleared today against total; one composed sentence (Fraunces); division size; the HoD's median answer time this month | — |
| 2 | Ask and start | Ask SURYA scoped to the division ("who has worked on …") / record search | Pin a priority · Call a meeting · switch Division / My own work |
| 3 | **Do first** | Up to three priorities pinned by the Director (`work_priorities`, `SH3`). Shows how many of the division's inputs are in | Open · Seen it · Cannot by then · Mark done |
| 4 | **Waiting on your decision** | Every approval that sits with the HoD, oldest first, with days waiting and a one-line pre-check: hiring requests, purchase indents, reports to forward, appraisals to review, proposals to recommend, leave and tour, project changes | Approve · Return (reason required) · Ask (question to the requester) · Forward · Approve all (quick items only) |
| 5 | Division projects | Only projects that need attention: behind, review soon, ending soon, vacant post, money and time out of step. Two bars: time used, money used. A count of the rest | Open file · Pin a priority to the PI |
| 6 | Reports that go up | One timer per report the HoD owes upward. Shows "N of M inputs in" and what the draft still needs from the HoD | Open draft · Nudge the missing people · Send |
| 7 | Technologies | One row per technology of the division: readiness (TRL 1–9), IP state, transfer state, days since the last movement. One line for thrust areas with nobody on them | Open · Log a step · Pin a priority |
| 8 | Outside | Open collaboration threads: partner, what stage, who owes the next step, last contact date. Visits this fortnight with a one-page brief | Log contact · Reply note · Read brief · New thread |
| 9 | Committees — my seats | Meetings this fortnight with the HoD's seat and what the HoD still owes; minutes to sign; tasks on the HoD | Build agenda · Declare · Sign · Update |
| 10 | People | Priorities the HoD asked (seen / pushed back / done); overdue notices told to the HoD; contracts ending; vacant posts; load per scientist | Answer push-back · Pin · See load · Start hiring |
| 11 | Instruments | Purchases in the pipeline with stage and days at the stage; instruments down; instruments with low use | Details · Add to Lab Strategic Group agenda · Offer hours |

**Layout rules**

- The order above is fixed. Decisions (3, 4) are above status (5–11).
- **One strong button on the screen.** It belongs to the first priority; with no priority,
  to the oldest row in block 4 (`DESIGN.md`: terracotta is ceremonial).
- The amber border is used once, on block 3. With no open priority, block 3 is not rendered.
- **Exception first.** Blocks 5, 7, 10 and 11 show only rows that need the HoD, then one
  line "6 others are on track · See all". A division with no exceptions shows that line only.
- Red is used only for what the HoD can fix. A delay in Purchase, Accounts or Legal carries
  that office's name and days. A delay by the HoD shows on the HoD's own rows.
- Every approval row carries a **pre-check line** before the buttons. The HoD must not
  open three pages to decide.
- Phone: blocks 1, 3, 4 and 6 only. The rest sit behind "More".
- Counts and dates in IBM Plex Mono. Colour is never the only signal.

---

## 2. What the HoD can do from this screen alone

| Area | Actions |
|---|---|
| Approve | Hiring request, purchase indent, leave and tour, project change request, extension of a staff contract |
| Forward upward | Progress report to PME, proposal with recommendation, division report to the Director, slides to the Research Council desk |
| Assess | Open the appraisals the HoD reviews as reporting officer; sign Annexure I (tasks assigned) |
| Direct people | Pin a priority; answer a push-back; withdraw a priority; nudge a missing input |
| Run committees | Build an agenda from stuck items; declare a conflict; sign minutes; update own tasks |
| Projects | Open any division project file; add a note for the next review; pin a priority to the PI |
| Technologies | Log a readiness step; open the transfer record; start an outside thread with a licensee |
| Outside | Log a contact; draft a reply note; read a visit brief; start a new thread |
| People | Start a hiring request for a vacant post; see load; name an acting head (`acting_assignments`) before leave |
| Instruments | Send a stuck purchase to the Lab Strategic Group agenda; offer free hours to other divisions |
| Ask | "Who in my division has worked on X", "which projects end this quarter", "what did we publish on Y" |

---

## 3. Pre-checks on approval rows

The pre-check is the part that saves the HoD's time. Each is a pure function over data the
app holds; none is a judgement by a language model.

| Request | Pre-check line says | Source |
|---|---|---|
| Hire project staff | Is the post in the sanction; does the budget head have funds for the months asked; does the candidate pass the 6/7-year cap and the PhD exclusion | `sanctioned_posts`, project budget lines, `project_engagements`, `csir_rule()` (enterprise P1) |
| Purchase indent | Amount against the ₹5 lakh rule; is a similar instrument in the institute and how much it is used; funds in the equipment head | `equipment`, `equipment_usage_log`, budget lines; indent itself from CPS (`SH6`) |
| Progress report | Milestones late and whether a reason is given; date due at PME | `project_milestones`, `project_review_slots` |
| Proposal | Readiness score; overlap with past proposals; conflict-of-interest declarations in | `src/lib/proposals/readiness.ts`, RAG duplication check, `coi_declarations` |
| Leave / tour | Clash with a review slot, a committee meeting or a report due date | `project_review_slots`, `meetings`, `my_report_timers()` |
| Contract extension | Time left under the cap; funds; the PI's reason | `project_engagements` |
| Appraisal | Days left in the window; items the scientist has not evidenced | PMS tables |

A pre-check that cannot run (data not connected) says so in plain words:
"Funds check not connected yet." It never shows a pass it did not compute.

---

## 4. Nudges for an HoD

| Nudge | Rule |
|---|---|
| People stopped | The count of requesters whose work cannot move until the HoD answers. Shown in the greeting and on block 4 |
| Oldest first | Block 4 is sorted by days waiting. It cannot be re-sorted |
| Your answer time | "Your median answer time this month: 1.6 days." The HoD's own record only |
| Approve all | Offered only for items whose pre-check has no finding and whose kind is marked quick (leave, tour) |
| Return needs a reason | "Return" opens one line for the reason. The requester sees it at once |
| Inputs in | "6 of 7 inputs in · 1 person nudged" on each report. A count; the name shows only when the HoD opens the draft |
| Draft before deadline | A division report draft is offered 30 days before it is due, built from the scientists' entries (same ladder as `SH4`) |
| Idle thread | An outside thread with no contact for 21 days is tagged "idle"; a technology with no movement for 30 days likewise |
| Before leave | When the HoD's leave starts within 3 days and no acting head is named, one row asks for the name |
| Honest consequence | A decision 7 days old: the requester may ask the Director's office (question 2). The row says so from day 5. Nothing happens that the row did not say |

**Not used, by decision.** Ranking of scientists. A league table of divisions on the HoD's
screen. Names of late colleagues in counts. Pop-up windows. Auto-approval of anything.

---

## 5. What exists today (checked 2026-11-13)

| Block | Data today | Gap |
|---|---|---|
| Whole screen | `HoDView.tsx` is one line that re-exports `DivisionHeadView`. That view shows five counts (staff, active projects, PhD, outputs, equipment) and two lists. Raw colours, upper-case headings — not `DESIGN.md` | Replace the view |
| Who is the HoD | `divisions."divHoDID"` → `staff."ID"`; `staff."ReportingID"`; `acting_assignments` (other session) | One helper `caller_division_codes()` that honours acting assignments |
| 3 | `work_priorities` is planned in `SH3` | The Director is already allowed to pin (`SH3` rule 1). Nothing extra |
| 4 | Each approval lives in its own module: proposals (`proposal_review_steps`), project reports, project changes, PMS, recruitment (`20261113000004`), leave of project staff (`project_staff_leave`, kept by PME/HR). `deriveMyActions` already lists some for the logged-in user | No single queue; no days-waiting; no pre-check; no "Ask"; indents and permanent-staff leave are outside SURYA (CPS, eHRMS) |
| 5 | `projects`, `project_milestones`, fund reading, `project_review_slots`, `project_engagements` | No "needs attention" rule; no time-against-money view |
| 6 | Scientist-level timers planned in `SH2`. Project reports and PMS items hold the raw content | No division report; no input tracking; no deck builder |
| 7 | `proposals.current_trl` / `target_trl`; `tech_transfers` (title, licensee, status, division); IP records | No technology record that lives across projects; TRL is on the proposal only |
| 8 | `mous` (partner, type, status, validity, division) | No thread of contacts, no "who owes the next step", no visits |
| 9 | Committees today; seats, agenda, signing arrive with `CM0`–`CM5` | As in `SH5` |
| 10 | `sanctioned_posts`, `project_engagements`, workload (`20261113000002`), contract-end items | No one division view; priorities list comes with `SH3` |
| 11 | `equipment`, `equipment_usage_log`, AMC fields | Purchase stages are in CPS (`SH6`); no "down" state with dates; no low-use rule |

---

## 6. New data — only three small things

Everything else on the screen is read from tables that exist or are planned elsewhere.

**6.1 Decision queue — a function, not a table.**
`my_decisions() RETURNS TABLE(kind text, subject_type text, subject_id text, title text,
requester_user_id uuid, waiting_since timestamptz, quick boolean, link text)` — invoker
rights, a `UNION ALL` over each module's "waiting on this user" rows. Each module keeps its
own state machine and its own approve RPC; the home screen calls those RPCs. No approval
logic is copied. A new module joins the queue by adding one `SELECT` to the function.

`decision_questions(id, subject_type, subject_id, asked_by, asked_to, question, answer,
asked_at, answered_at)` for the "Ask" button. RLS: the two parties read; writes through
`decision_ask(...)` and `decision_answer(...)`. While a question is open, the row's clock
shows "with requester" and does not count against the HoD.

**6.2 Technologies.**
`technologies(id, title, division_code, lead_staff_id, thrust_area, trl smallint 1–9,
trl_on date, status)` and `technology_events(id, technology_id, at, kind, note, actor)`
with kinds `TRL_STEP`, `IP_FILED`, `IP_GRANTED`, `DEMO`, `LICENSEE_CONTACT`, `TRANSFER`.
Link columns `technology_id` on `tech_transfers` and on the project and IP link tables
(nullable; added by a new migration, no shipped file is edited). RLS: read institute-wide
for staff; write by the lead, the HoD of the division, PME. A TRL step needs an evidence
document (`documents` registry).

**6.3 Outside threads.**
`outside_threads(id, partner_name, partner_type, division_code, owner_staff_id, purpose,
stage, next_step, next_step_by 'US'|'THEM', next_step_due date, mou_id, technology_id,
status)` and `outside_contacts(id, thread_id, on_date, kind, summary, by_staff_id)` with
kinds `MEETING`, `CALL`, `EMAIL`, `VISIT_IN`, `VISIT_OUT`, `LETTER`. Stages: `LEAD →
TALKS → DRAFT_AGREEMENT → WITH_LEGAL → SIGNED → ACTIVE → CLOSED`. A thread that reaches
`SIGNED` links to its `mous` row. RLS: the owner, the division's HoD, the Director, PME and
Business Development read and write; other staff read the partner name and stage only.

**Division reports** use no new report engine. A division report is a `project_reports`-style
document assembled from: project report sections, `pms_report_items`, outputs, technology
events and outside contacts in the period. One table records it:
`division_reports(id, division_code, kind, period_from, period_to, due_on, status
'DRAFT'|'SENT', sent_at, document_id)` plus `division_report_inputs(report_id, staff_id,
asked_at, received_at)`.

---

## 7. Phases

Effort as in the roadmap (`S` half a day · `M` 1–2 days · `L` 3+ days · `XL` multi-week).

| ID | Phase | Contents | Effort | Needs | Done when |
|---|---|---|---|---|---|
| `HH1` | The screen on today's data | New `HoDView` (own file; `DivisionHeadView` uses it). Greeting, Division / My-own-work switch, division projects with the "needs attention" rule, people block from existing tables, instruments from `equipment` and the usage log, committees as far as today's data goes. `src/lib/home/division.ts`: `needsAttention(project)`, `divisionGreeting()`. `caller_division_codes()` honouring `acting_assignments` | L | `SH1` (shared `src/lib/home/`) | An HoD sees only their division; an acting head sees it for the acting period only; a division with no exceptions shows the "on track" line |
| `HH2` | Decision queue | `my_decisions()`, days waiting, "people stopped", Approve / Return / Forward wired to each module's existing RPC, answer-time record (`my_answer_time()`), quick "Approve all" | L | — | Each module's pending row appears once; approving from the home screen and from the module page give the same audit row; a user who is not the approver gets the module's own refusal |
| `HH3` | Pre-checks and Ask | §3 pre-checks as pure functions in `src/lib/home/prechecks/`; `decision_questions` and its two RPCs | M | `HH2`; enterprise P1 (`csir_rule`), P5 | Every pre-check has a table-driven test with a pass, a finding and a "not connected" case |
| `HH4` | Reports that go up | `division_reports`, `division_report_inputs`, the assembler, timers on the screen, nudge for missing inputs, export to the institute's document and slide formats | L | `SH2`, `SH4` | A monthly report draft is filled from real entries with a source line under each paragraph; the HoD can send it without retyping |
| `HH5` | Technologies | §6.2 tables and RPCs, a Technology page, the block, backfill from `tech_transfers` and `proposals.current_trl` | L | — | A technology shows its full line from first project to transfer; a TRL step without evidence is refused |
| `HH6` | Outside | §6.3 tables and RPCs, the block, visit brief (people, past work, open asks) built from the profile and project data, link to `mous` | M–L | Enterprise P2 (profile) for the brief | A thread idle 21 days is tagged; a visit shows a brief with sources |
| `HH7` | Priorities from both sides | Block 3 (Director → HoD) and the "Priorities I asked" list in block 10. No new backend | S | `SH3` | An HoD holding three priorities cannot be given a fourth; a push-back shows in the HoD's list with Answer |
| `HH8` | Blocks that wait on other work | Committee seat actions (`CM1`–`CM5`); indents and purchase stages, bills, permanent-staff leave (`SH6` imports); hiring start (enterprise P5) | M, in pieces | `CM1`–`CM5`, `SH6`, P5 | Each row shows its real action the day its source ships, and "not connected yet" until then |

**Order.** `HH1` then `HH2` — together they already replace today's five counts with a
working desk. `HH7` the day `SH3` ships. `HH3`, `HH4`, `HH5`, `HH6` are independent of each
other; my order is `HH4` (the largest time saving), `HH3`, `HH5`, `HH6`. `HH8` follows
other plans.

**Not loaded at login.** Reads go through the `HomeContext` of `SH1`, on demand.

### Verification, every phase

- `npm run build`, `npm run lint`, `npm test`, `python scripts/check_security_definer.py`.
- Unit tests for `src/lib/home/division.ts` and each pre-check — pure functions.
- `scripts/db/hodHome.db.test.ts`: `my_decisions()` per module; division scope; acting head;
  RLS on `technologies`, `outside_threads`, `decision_questions`, `division_reports`.
- Checked in the running app as HoD, as acting head, and as a scientist (who must not reach
  the division view), at desktop and phone width, light and dark.

---

## 8. Open questions

| # | Question | Default if unanswered |
|---|---|---|
| 1 | Are `HOD` and `DivisionHead` the same screen | Yes. One view; scope comes from `caller_division_codes()` |
| 2 | What happens when a decision is 7 days old | The requester may send it to the Director's office; the HoD is told on day 5 |
| 3 | Which reports does an HoD owe upward, and when | Monthly to Director; Research Council slides; annual report chapter; CPD rows (15 Apr, 15 Sep). List to be confirmed by the institute |
| 4 | Does the HoD approve indents in SURYA or only see them | See them, with the pre-check, until CPS exports are connected (`SH6`). Approval stays in CPS |
| 5 | May an HoD see a scientist's appraisal scores | Only reports the HoD reviews as reporting officer, as PMS rules allow today |
| 6 | Who keeps the technology list | The lead scientist writes; the HoD confirms a TRL step; PME reads all |
| 7 | Does Business Development own outside threads with industry | Shared: the division owns the thread; Business Development sees every industry thread |
| 8 | Is the HoD's answer time shown to the Director | Yes, as a division figure on the Director's screen (its own plan). Not shown to other HoDs |
| 9 | Instrument "down" state: who records it | The technical officer in charge, from the instrument page |

---

## 9. Out of scope

- The Director's and DG's screens. They read the same functions with a wider scope; each
  gets its own plan.
- Replacing CPS, AMS or eHRMS.
- Any automatic approval. The pre-check informs; the HoD decides.
- Ranking of people or of divisions on this screen.
