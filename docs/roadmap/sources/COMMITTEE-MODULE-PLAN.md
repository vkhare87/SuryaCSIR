# Committee Module — Implementation Plan

_Proposal, 2026-11-12. Item IDs `CM0`–`CM8`. Indexed from [`../ROADMAP.md`](../ROADMAP.md)._

**Goal.** One module that runs a committee from its constitution order to its closed
tasks, so that the physical minutes book, and the person who keeps it, are no longer
needed. Members, terms, schedule, rooms, refreshments, agenda, circulation, attendance,
transcript, proceedings, signatures, tasks, follow-up and monitoring live in one place.

**Rule sources.** CSIR OM No. 33/GIM&FGP/2025-CPD, 25 April 2025 ("§n"): minutes deadlines
(§5), conflict-of-interest declarations (§6.3), committee make-up and quorum (§3.3, §5).

**Relation to other work.** The enterprise phase plan
(`docs/superpowers/plans/2026-11-12-enterprise-phases.md`) is being built in another
session. It owns two things this module uses and must **not** create again:

| Owned there | Used here |
|---|---|
| `coi_declarations` on `meeting_id` (P3, `EP4`) | Shown in the attendance step (`CM3`) |
| `csir_rules` / `csir_rule()` (P1, `EA4`) | Minutes deadlines, quorum, cadence |
| `acting_assignments` (P5, `EG1`) | An acting chairperson |
| `entity_timeline` (P1, `EA3`) | Committee and meeting history |

Start `CM0` after P1 of that plan is merged. Both plans touch `App.tsx`, `Sidebar.tsx`,
`access.ts` and `types/index.ts`.

---

## 1. What exists today (read from the schema and `src/lib/committees/permissions.ts`, 2026-11-12)

| Area | State | Gap this plan closes |
|---|---|---|
| Committee | Name, type (4 values), mandate, chairperson, secretary, active flag, formed date | No constitution order, no term, no quorum rule, no meeting frequency, no history on reconstitution |
| Members | `staff_id` + role (`Member`, `Invitee`, `ExternalExpert`) | No join or leave dates. An outside expert needs a staff row. Chair and secretary are columns, not members |
| Meeting | Date (no time), free-text venue, title, summary, `Scheduled / Completed / Cancelled`, Teams link | No serial number, no notice, no stages, no adjournment |
| Venue | Free text | No room list, no clash check, no refreshments |
| Agenda | Sequence, description, proposer, `Pending / Discussed / Deferred`; link to a project review or proposal | No item type, presenter, papers, time; no circulation record |
| Attendance | None | No RSVP, no attendance, no quorum |
| Minutes | One editor; locked when `Completed` and older than 7 days; admins can unlock | No versions, no comments from members, no approval by the chair, no signature, no confirmation at the next meeting. An unlock rewrites history |
| Tasks | Task, one assignee, deadline, `Pending / InProgress / Completed`, notes; kanban | No link to the decision, no update log, no verification, no escalation |
| Who may do what | Decided in the browser by role | Not enforced in SQL by membership. Every meeting is readable by everyone |
| Monitoring | An analytics page | No view of terms expiring, meetings missed, minutes late |

**To confirm at `CM0` start:** `permissions.ts` compares `user.id` with
`committee.chairperson_id`, which is a staff ID. If `user.id` is the login id, the chair and
secretary checks never pass.

---

## 2. Design in one page

### 2.1 Principles

- **The meeting writes its own record.** Notice, agenda, attendance, decisions and tasks are
  captured as the work is done. Nobody types the minutes from memory afterwards.
- **A signed record never changes.** A correction is a new, numbered corrigendum that names
  what it corrects. There is no unlock.
- **Membership decides access.** The database checks who is on the committee today. The
  browser only hides buttons.
- **One term at a time.** Reconstitution closes a term and opens the next. Old members keep
  their name on old minutes.
- **The member-secretary is a seat, not an app role.** No new role is added.
- **AI drafts; the member-secretary decides.** A draft from a transcript cites the lines it
  came from and is never final on its own.

### 2.2 One meeting, one stage strip

```
PLANNED → NOTICE_ISSUED → AGENDA_CIRCULATED → HELD → MINUTES_DRAFT → MINUTES_CIRCULATED
                                                 → MINUTES_SIGNED → CONFIRMED
side exits: POSTPONED · CANCELLED · ADJOURNED (no quorum)
```

`meetings.stage` is new and carries a `CHECK`. The old `status` column stays and is set by
trigger (`Scheduled` up to `AGENDA_CIRCULATED`, `Completed` from `HELD`, `Cancelled`), so
existing screens and the project-review link keep working. This is the pattern `PL0` used
for `projects.stage`.

### 2.3 Seats

| Seat | Can |
|---|---|
| Chairperson | Approve the agenda, rule on conflicts, approve and sign the minutes, grant leave of absence |
| Member-Secretary / Convener | Everything in the running of a meeting: notice, agenda, rooms, attendance, proceedings, circulation, tasks |
| Member | Propose agenda items, RSVP, read papers, comment on draft minutes, sign, update own tasks |
| External expert | As a member. With no login: see §8, question 2 |
| Invitee | Read the agenda and papers of the items invited for. No vote, not counted for quorum |
| Constituting authority (Director, admins) | Constitute, reconstitute, dissolve; read everything; monitor |

### 2.4 Confidentiality

`committees.confidentiality`: `institute` (any verified staff may read final minutes),
`members` (members and the constituting authority only), `confidential` (as `members`, and
its documents never enter Ask SURYA). Selection and assessment committees default to
`confidential`. Draft minutes are always members-only.

---

## 3. Data model

All new tables: snake_case, RLS enabled with an explicit policy block, every state change
through a `SECURITY DEFINER` RPC that opens with an authorization block.

### 3.1 Changes to existing tables

| Table | Change |
|---|---|
| `committees` | `+ confidentiality`, `+ parent_committee_id`, `+ rule_key` (links a CSIR body such as LSG or RC to its rules), `+ sign_policy` (`CHAIR_SECRETARY` \| `ALL_PRESENT`), `+ dissolved_on`, `+ dissolution_ref`. `chairperson_id` / `secretary_id` stay, kept in step with memberships by trigger |
| `meetings` | `+ stage`, `+ meeting_no` (serial per committee, set at `HELD`), `+ starts_at`, `+ ends_at` (`timestamptz`), `+ mode` (`IN_PERSON` \| `ONLINE` \| `HYBRID`), `+ term_id`, `+ adjourned_from_id`, `+ notice_days` |
| `agenda_items` | `+ item_type` (`CONFIRM_MINUTES`, `ACTION_TAKEN`, `DECISION`, `INFORMATION`, `OTHER`), `+ title`, `+ presenter_staff_id`, `+ minutes_allotted`, `+ proposal_state` (`PROPOSED`, `ACCEPTED`, `DECLINED`). `subject_type` `CHECK` widened: `+ change_request`, `+ completion_report`, `+ action_item` |
| `action_items` | `+ agenda_item_id`, `+ proceeding_id`, `+ priority`, `+ verified_by`, `+ verified_at`, `+ extensions` (count). `status` `CHECK` widened: `+ Blocked`, `+ Dropped`, `+ Verified` |
| `meeting_documents` | `+ agenda_item_id`, `+ document_id` → `documents` (new uploads go through the unified registry) |

### 3.2 New tables

| Table | Holds | Written by |
|---|---|---|
| `committee_terms` | `term_no`, `from_on`, `to_on`, `order_ref`, `order_document_id`, `terms_of_reference`, `quorum_min`, `quorum_needs_chair`, `cadence_months`, `status` (`ACTIVE`, `EXPIRED`, `SUPERSEDED`) | Constituting authority, by RPC |
| `external_members` | Name, organisation, designation, email, phone, `user_id` (if given a login) | Member-secretary, admins |
| `committee_memberships` | `term_id`, `staff_id` **or** `external_member_id`, `seat` (`CHAIRPERSON`, `MEMBER_SECRETARY`, `CONVENER`, `MEMBER`, `EXTERNAL_EXPERT`, `NOMINEE`, `INVITEE`), `from_on`, `to_on`, `ended_reason` | RPC |
| `rooms` | Name, building, capacity, facilities, custodian, active | Room desk |
| `room_bookings` | `room_id`, `meeting_id` (optional), `starts_at`, `ends_at`, purpose, status (`REQUESTED`, `CONFIRMED`, `CANCELLED`). Two live bookings of one room may not overlap | RPC |
| `hospitality_requests` | `meeting_id`, headcount, items, serve time, budget head, estimated cost, status (`REQUESTED`, `APPROVED`, `SERVED`, `CANCELLED`), approver | Member-secretary asks; hospitality desk decides |
| `module_desks` | `desk` (`rooms`, `hospitality`), `user_id` — who handles each | MasterAdmin |
| `meeting_circulations` | `kind` (`NOTICE`, `AGENDA`, `DRAFT_MINUTES`, `FINAL_MINUTES`, `CORRIGENDUM`), version, PDF document, `sha256`, when, by whom | RPC |
| `meeting_circulation_receipts` | Per member: delivered, opened, acknowledged | System; member acknowledges |
| `meeting_attendance` | Per member: RSVP (`YES`, `NO`, `TENTATIVE`), leave granted, attended (`PRESENT`, `ONLINE`, `ABSENT`), marked by | Member (RSVP); member-secretary (attendance) |
| `meeting_transcripts` | Document, kind (`TEXT`, `VTT`, `DOCX`), language, uploader | Member-secretary |
| `meeting_proceedings` | Per agenda item: discussion, decision, `decision_kind` (`APPROVED`, `REJECTED`, `DEFERRED`, `NOTED`, `REFERRED`), dissent | Member-secretary, until signed |
| `meeting_minutes_versions` | Version number, full snapshot (`jsonb`), PDF document, `sha256`, state (`DRAFT`, `CIRCULATED`, `APPROVED`, `SIGNED`, `CONFIRMED`) | RPC |
| `minutes_comments` | Version, agenda item, member, text, resolved | Members; member-secretary resolves |
| `signatures` | `subject_type`, `subject_id`, `document_sha256`, signer, seat, time, `method` (`ATTEST`, `SCAN`, `DSC`, `ESIGN`), certificate data, `prev_hash`, `row_hash`, `verify_code` | RPC only; insert-only |
| `action_item_updates` | By, at, note, new status, new deadline, evidence document | Assignee, member-secretary |
| `committee_events` | Append-only timeline; one writer function called by every RPC | RPCs only |

`signatures` is generic on purpose. PMS finalisation and project steps can use it later
without a second table.

### 3.3 Access helpers

- `committee_seat(p_committee_id uuid) RETURNS text` — the caller's seat in the active term,
  through `caller_staff_id()`; `NULL` if none.
- `committee_can_read(p_committee_id uuid) RETURNS boolean` — by `confidentiality` and seat.
- `committee_can_run(p_committee_id uuid) RETURNS boolean` — chairperson, member-secretary,
  convener.

Read policies on `committees`, `meetings`, `agenda_items`, `meeting_documents` change from
"open to all" to `committee_can_read`. This **narrows** access. It needs a negative RLS
test per table.

### 3.4 Rules encoded

| Rule | Where enforced |
|---|---|
| Minutes within 2 days (LSG) or 1 week (Task Force) (§5) | Overdue flag from `csir_rule('committee.minutes_due_days')`; other committees use the term's own value |
| Meeting frequency (RC half-yearly, Task Force quarterly, Monitoring Committee twice a year) (§5) | `cadence_months` on the term; "meeting due" on the monitor |
| Quorum, including "chair + 2" for selection committees (§3.3) | `meeting_mark_held` refuses without quorum; the only other exit is `ADJOURNED` |
| Conflict declaration before taking part (§6.3) | Attendance step lists who has not declared (table owned by `EP4`) |
| A committee acts only within its term | Notice refused when the term has expired |
| Notice period | Warning when a notice goes out later than `notice_days` before the meeting; the chair may waive with a note |

---

## 4. The flow, step by step

### 4.1 Constitute

The constituting authority records the order (number, date, scan), terms of reference,
tenure, quorum, frequency, confidentiality and the members with their seats. Reconstitution
opens the next term; a member who leaves mid-term gets an end date and a reason, and a
replacement joins the same term. Sixty days before a term ends, the authority and the
member-secretary are told.

### 4.2 Schedule, room, refreshments

- The term's frequency gives the year's expected meetings as "due" markers.
- The member-secretary picks a date and time. The form shows clashes: members already in
  another meeting, institute holidays, and free rooms of the right size.
- Booking a room is part of the same form. A room can also be booked without a meeting.
  The room desk sees all bookings on a day grid.
- Refreshments: headcount (pre-filled from RSVPs), items, time, budget head. The
  hospitality desk approves and marks served. SURYA records the request and the approval;
  it does not pay anyone.
- Postponing a meeting moves the room booking and tells every member.

### 4.3 Agenda and circulation

- Two items add themselves: _Confirmation of the minutes of meeting N−1_ and _Action taken
  report_ (built from the open tasks of earlier meetings).
- Pending business is offered: project reviews due, change requests, completion reports,
  proposals at the committee step.
- Members propose items until a cut-off; the member-secretary accepts or declines.
- Each item has a type, presenter, time and papers.
- **Issue notice** and **Circulate agenda** each produce a numbered PDF, store its hash,
  notify every member, and open a receipt row per member. The member-secretary sees who
  has opened it and who has replied.
- A changed agenda is circulated again as version 2. Version 1 stays on file.

### 4.4 The meeting

- Attendance sheet on one screen: present, online, absent, leave granted. Quorum shows
  live. Conflict declarations show beside each name.
- For each agenda item: discussion notes, the decision, its kind, any dissent, and tasks
  with owner and date — typed while the meeting runs.
- **Mark held** needs quorum. Without it, **Adjourn** creates the follow-on meeting with the
  same agenda.

### 4.5 Transcript

- The member-secretary uploads a transcript (text, VTT or Word) if one exists. It is
  members-only.
- **Draft from transcript** asks the AI service for a draft of each item's discussion and
  decision. Each drafted sentence carries the transcript lines it rests on. The draft fills
  empty fields only and is marked as a draft until the member-secretary accepts it.
- No transcript, or no AI host: the step is skipped and nothing else changes.

### 4.6 Proceedings and minutes

1. **Draft** — built from the per-item proceedings, attendance and tasks.
2. **Circulate draft** — members comment per item inside a comment window.
3. **Resolve** — the member-secretary answers each comment; a changed draft is a new version.
4. **Approve** — the chairperson approves one version.
5. **Sign** — see §4.7. The signed version gets its `meeting_no` page in the minutes book.
6. **Issue** — the final PDF is circulated and filed in the document registry.
7. **Confirm** — at the next meeting, the first agenda item confirms it. A change asked for
   there is recorded as a corrigendum against the signed minutes.

From step 5 the version, its proceedings and its attendance cannot be edited by anyone.
`unlock_meeting_minutes` is withdrawn for meetings run in the new flow.

### 4.7 Signature

Three levels. The level is recorded on every signature.

| Level | How | Standing | Needs |
|---|---|---|---|
| `ATTEST` | The member opens the final PDF, enters their password again, and signs. The row stores the PDF hash and is chained to the row before it. The PDF gains a signature page with a verification code | A tamper-evident record of assent inside the institute. **Not** an electronic signature under the IT Act | Nothing outside the team |
| `SCAN` | The signed paper page is scanned and attached to the same record | As today (lifecycle decision 5) | Nothing |
| `DSC` / `ESIGN` | Token-based digital signature, or Aadhaar eSign through a licensed provider | Legally recognised | A purchase and provider onboarding (roadmap `D6`) |

`/verify/<code>` shows who signed which document and when, and whether the stored file
still matches the hash. Who must sign follows `sign_policy`: chairperson and
member-secretary, or all members present.

### 4.8 Tasks and follow-up

- A task is born from a decision and keeps the link to it.
- The owner posts updates with evidence. A new date is an extension and is counted.
- `Completed` by the owner becomes `Verified` when the member-secretary accepts it.
- Reminders before the due date; after it, the chairperson is told.
- Open and newly closed tasks appear by themselves in the next meeting's action taken
  report. A task cannot fall off the list.

### 4.9 Monitoring

| For | Shows |
|---|---|
| Director and admins | Every committee: term end, meetings held against due, quorum rate, days from meeting to signed minutes against the rule, open and overdue tasks, a plain **In order / Watch / Lapsing** reading. Committees with no meeting in their period. Staff who sit on many committees |
| Chairperson and member-secretary | Their committee: attendance by member, comment and signature pending lists, task ageing |
| Each member | My committees, my next meetings, papers to read, minutes to sign, my tasks |

### 4.10 The minutes book

Per committee: every meeting in serial order with its notice, agenda, attendance, signed
minutes, corrigenda and signatures; one export as a single PDF with a contents page. Final
minutes of `institute` and `members` committees are filed for Ask SURYA with the matching
access tier, so "what did the committee decide on X" is answered with a page citation.

---

## 5. Screens

**Navigation.** A **Committees** section of its own: _My committees_ · _Calendar_ · _Tasks_ ·
_Rooms_ · _Minutes book_ · _Monitor_ (authority only).

| Route | Page |
|---|---|
| `/committees` | My committees, then all I may read |
| `/committees/:id` | Tabs: Overview · Members and terms · Meetings · Tasks · Minutes book · Timeline |
| `/committees/meetings/:id` | Stage strip, next action, then tabs that appear as the stage reaches them: Plan · Agenda · Papers · Attendance · Proceedings · Minutes · Signatures · Tasks |
| `/committees/tasks` | All my tasks across committees; kanban and list |
| `/rooms` | Day and week grid; book, move, cancel |
| `/committees/monitor` | §4.9 |
| `/verify/:code` | Signature check |

On a phone: RSVP, read papers, comment, sign, update a task. Running a meeting stays on
desktop.

---

## 6. RPCs

| RPC | Who | Does |
|---|---|---|
| `committee_constitute(p_committee jsonb, p_term jsonb, p_members jsonb)` | Authority | Committee, term 1, memberships |
| `committee_reconstitute(p_committee_id, p_term jsonb, p_members jsonb)` | Authority | Closes the term, opens the next |
| `committee_member_change(p_term_id, p_change jsonb)` | Authority | Join, leave, change seat |
| `committee_dissolve(p_committee_id, p_ref)` | Authority | Refused while tasks are open, unless reassigned |
| `meeting_plan(p_committee_id, p_details jsonb)` | Runs | Creates `PLANNED` |
| `room_book(p_room_id, p_starts_at, p_ends_at, p_meeting_id, p_purpose)` · `room_booking_cancel(p_id)` | Any verified staff · owner or desk | Refuses an overlap |
| `hospitality_request(p_meeting_id, p_details jsonb)` · `hospitality_decide(p_id, p_decision, p_note)` | Runs · desk | |
| `agenda_propose(p_meeting_id, p_item jsonb)` · `agenda_decide(p_item_id, p_state)` | Member · runs | |
| `meeting_issue_notice(p_meeting_id, p_document_id)` · `meeting_circulate_agenda(p_meeting_id, p_document_id)` | Runs | Stage move, circulation, receipts, notifications |
| `meeting_rsvp(p_meeting_id, p_rsvp)` · `circulation_acknowledge(p_circulation_id)` | Member | |
| `meeting_mark_attendance(p_meeting_id, p_rows jsonb)` | Runs | |
| `meeting_mark_held(p_meeting_id)` · `meeting_adjourn(p_meeting_id, p_new_starts_at)` · `meeting_postpone(…)` · `meeting_cancel(…)` | Runs | Quorum check; serial number |
| `minutes_draft(p_meeting_id)` · `minutes_circulate(p_version_id, p_document_id)` · `minutes_comment(…)` · `minutes_resolve_comment(…)` | Runs · member | |
| `minutes_approve(p_version_id)` | Chairperson | |
| `signature_attest(p_subject_type, p_subject_id, p_sha256)` · `signature_attach_scan(…)` | Signer · runs | Hash chain; refuses when the hash is not the approved version's |
| `minutes_issue(p_version_id)` · `minutes_confirm(p_meeting_id, p_at_meeting_id)` · `minutes_corrigendum(…)` | Runs | |
| `action_item_update(p_id, p_update jsonb)` · `action_item_verify(p_id)` | Owner · runs | |
| `committees_sweep()` | `pg_cron` | Reminders, overdue minutes, term expiry, meetings due |

---

## 7. Phases

Effort as in the roadmap (`S` half a day · `M` 1–2 days · `L` 3+ days · `XL` multi-week).
Each phase ships alone and leaves the app working.

| ID | Phase | Contents | Effort | Done when |
|---|---|---|---|---|
| `CM0` | Foundations | Terms, memberships, external members, confidentiality, SQL access helpers and narrowed read policies, `meetings.stage` with the status trigger, date-and-time columns, `committee_events`. Backfill: each committee gets term 1 from `formed_date`; chair, secretary and members become memberships; old statuses map to stages | L | A non-member cannot read a `members` committee (DB test). Every existing committee, meeting and project-review link still opens |
| `CM1` | Schedule, rooms, refreshments | §4.1–4.2: constitute and reconstitute screens, cadence markers, clash check, `rooms`, `room_bookings`, `hospitality_requests`, `module_desks`, `/rooms` | L | Two people booking one room for the same hour: one is refused (DB test with both in flight). A postponed meeting moves its booking |
| `CM2` | Agenda and circulation | §4.3: item types, standing items, pending business, member proposals, papers, notice and agenda PDFs, circulation and receipts, RSVP | L | A member gets the agenda, opens it, replies; the member-secretary sees all three. Version 2 does not erase version 1 |
| `CM3` | The meeting | §4.4: attendance, quorum, declarations shown, per-item capture, held / adjourned | M | A meeting without quorum cannot be marked held; adjourning creates the follow-on meeting with the same agenda |
| `CM4` | Proceedings and minutes | §4.6: versions, comment round, chair approval, final PDF, immutability, confirmation at the next meeting, corrigendum; `unlock_meeting_minutes` withdrawn for new-flow meetings | L–XL | After signing, an update to proceedings, attendance or the version is refused for every role including MasterAdmin (DB test) |
| `CM5` | Signatures | §4.7: `signatures`, attest flow with password re-entry, signature page on the PDF, scan attachment, `/verify/:code` | L | Changing one byte of the stored PDF makes `/verify` report a mismatch. A signature against a non-approved version is refused |
| `CM6` | Tasks and follow-up | §4.8: decision link, update log, verification, extensions, reminders and escalation, auto action-taken report | M–L | An open task from meeting 3 appears in meeting 4's action taken report with no one adding it |
| `CM7` | Transcript and draft | §4.5: upload now; AI draft when the AI host can serve it | M + L | A drafted sentence opens the transcript lines behind it. With no transcript the minutes flow is unchanged |
| `CM8` | Monitoring and the minutes book | §4.9–4.10: monitor, minutes-book export, filing for Ask SURYA by access tier, own navigation section, old screens retired | L | A committee past its meeting period shows **Lapsing** with nobody logged in. Ask SURYA cites a signed minute for a member and refuses a non-member |

**Order.** `CM0` first. `CM1` and `CM2` may swap. `CM3 → CM4 → CM5` is fixed. `CM6` needs
`CM3`. `CM7` needs `CM4`; its AI half also needs the GPU host. `CM8` last.

### Verification, every phase

- `npm run build`, `npm run lint`, `npm test`, `python scripts/check_security_definer.py`.
- `scripts/db/committees.db.test.ts` on the PGlite harness: each RPC's happy path, each
  seat's refusal, confidentiality, immutability after signing, the booking clash.
- `supabase/tests/rls_negative.sql` and `rls_positive.sql`: committee cases.
- Engineering docs updated in the same PR. UI follows `DESIGN.md`; semantic tokens only.

### Cases that must have a test

1. Two bookings for one room submitted at the same moment.
2. A member removed mid-term: still named on minutes signed earlier, refused on new ones.
3. The chairperson is absent: quorum fails where `quorum_needs_chair`; an acting chairperson
   under `EG1` satisfies it.
4. A meeting that crosses midnight, and all due dates, are computed in IST.
5. An external member with no login: counted for quorum, shown as "signed on paper".
6. An admin tries to edit signed minutes directly in the table.

---

## 8. Open questions

| # | Question | Default if unanswered |
|---|---|---|
| 1 | Which signature level is required? | **Decided 2026-11-12:** `ATTEST` (in-app sign), with `SCAN` allowed. `DSC` / `ESIGN` are not built in `CM5`; the `method` column leaves room for them |
| 2 | Do external experts get a login? | No. The member-secretary hands them the PDFs and records their reply and paper signature. A `Guest` login may be given case by case |
| 3 | Is there outgoing email? | No; notices are in-app. Email follows roadmap `D1` |
| 4 | Who handles rooms and refreshments? | One named user per desk in `module_desks` |
| 5 | Who may read minutes of an ordinary committee? | Any verified staff (as today), final minutes only |
| 6 | Who may constitute a committee? | Director, SystemAdmin, MasterAdmin (as today) |
| 7 | Who signs? | Chairperson and member-secretary; a committee may be set to all present |
| 8 | Are audio recordings transcribed here? | No. Text transcripts only |
| 9 | Are PMS evaluation committees moved into this module? | No. They keep their own tables |
| 10 | How long is the comment window on draft minutes? | 3 days; less where §5 gives a shorter deadline |

---

## 9. Out of scope

- Running the video call. Only the link is stored.
- Paying for refreshments or rooms. Requests and approvals are recorded; no money moves.
- Speech-to-text from audio.
- Voting and secret ballots.
- Merging PMS evaluation, empowered and grievance committees.
- Committees of other laboratories. A sister-lab member is an external member here.
- PDF/A output. Final minutes are ordinary PDFs with a stored hash.
