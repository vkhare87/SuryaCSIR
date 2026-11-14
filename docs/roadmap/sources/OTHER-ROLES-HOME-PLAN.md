# Home Screens for PhD Students, Project Staff and Technical Staff — Implementation Plan

_Proposal, 2026-11-13. Item IDs `ST1`–`ST4` (student), `PJ1`–`PJ4` (project staff),
`TS1`–`TS5` (technical staff). Indexed from [`../ROADMAP.md`](../ROADMAP.md). Delivers
roadmap `WP-5 E` (role-first home) for `Student`, `ProjectStaff` and `Technician`. Reuses
the code of [`SCIENTIST-HOME-PLAN.md`](SCIENTIST-HOME-PLAN.md) (`SH1`–`SH6`)._

**One sentence per role — the feeling the screen must give.**

| Role | The person must be able to say |
|---|---|
| PhD student | "I know where I am on the road to my thesis, and what my supervisor expects next." |
| Project staff | "I know my contract, my leave, my pay and how much time I have left." |
| Technical staff | "My instruments are in order, people are not kept waiting, and my work is seen." |

**Shared with the scientist screen, not rebuilt:** the greeting sentence, the **Do first**
block (priorities pinned by a senior, `work_priorities`, `SH3`), the report timers (`SH2`),
the nudges and escalation ladder (`SH4`), `HomeContext`, `src/lib/home/`. One strong
button per screen. Amber border once, on Do first. Counts and dates in IBM Plex Mono.

**Who may pin a priority** (adds to `SH3` rule 1): a student's supervisor and
co-supervisor; a project staff member's PI; a technical officer's reporting officer and
the head of the division. The limit of three open priorities holds for every role.

---

## 1. PhD student

### 1.1 The screen

| # | Block | Shows | Actions |
|---|---|---|---|
| 1 | Greeting and the road | Year N of M; the next gate and days to it. A road of gates: joined → course work → proposal defence → pre-submission → thesis → viva. Fellowship end date against the thesis date at the present pace, and the spare months | Open a gate |
| 2 | **Do first** | Priorities from the supervisor | Upload · Seen it · Cannot by then · Mark done |
| 3 | This week | Instrument slots; forms due (with a draft and "N lines left"); claims and where they wait | Add sample list · Open draft |
| 4 | Supervisor meetings | Date of the last meeting; what was agreed and its state; days since the last meeting | Ask for a slot · Write the note |
| 5 | My work record | Papers and their state; instrument hours; conferences; courses. Checks the "papers before thesis" rule | Add entry |
| 6 | Need something | Book an instrument · bonafide letter · leave · hostel / ID · **talk to someone, in private** | Each opens its request |

### 1.2 Rules of this screen

- **A student sees their own road only.** No list, count or average of other students. The
  screen has no comparison of any kind.
- **The fellowship clock is the main nudge.** When the thesis date at the present pace
  passes the fellowship end, the greeting says so, 12 months ahead, in plain words — to the
  student and the supervisor both.
- **Meeting notes are two-sided.** The student writes "what we agreed"; the supervisor
  confirms or corrects. Neither can change a confirmed note. A gap of 30 days without a
  meeting is told to the supervisor, of 60 days to the head (question 2).
- **"Talk to someone, in private"** opens a ticket that the supervisor **cannot** read. It
  goes to the student grievance / internal committee desk (`helpdesk_routing`). This is a
  hard rule in RLS, tested.
- Red is used only for what the student can fix. A claim that waits in Accounts shows the
  office and its days.

### 1.3 What exists today (checked 2026-11-13)

| Block | Data today | Gap |
|---|---|---|
| Screen | `StudentView.tsx` (198 lines): three cards, enrolment details, a milestone list. Raw colours | Replace |
| 1 | `phd_students`, `phd_milestones` | No standard gate list per university; no pace forecast; fellowship end not always held |
| 2 | Planned in `SH3` | Supervisor as a permitted asker |
| 3 | Instrument bookings — none in SURYA (usage log only); tickets exist | Booking arrives with `TS2` |
| 4 | Nothing | New table |
| 5 | `scientific_outputs` by author name; `equipment_usage_log` | Student as author by ID; courses and conferences |
| 6 | `tickets`, `helpdesk_routing` | A private route; letter requests |

### 1.4 New data

```
phd_gate_templates   university, gate_key, label, order_no, normal_month
phd_meetings         id, student_id, held_on, agreed jsonb [{text, state}], written_by,
                     confirmed_by, confirmed_at
```
`phd_milestones` gains `gate_key`. `phd_students` gains `fellowship_kind`,
`fellowship_end_on` where missing (new migration; no shipped file is edited).
`student_pace(p_student_id)` — invoker — returns the forecast thesis month from the gates
passed and the template's normal months.

### 1.5 Phases

| ID | Phase | Contents | Effort | Needs | Done when |
|---|---|---|---|---|---|
| `ST1` | The screen on today's data | New `StudentView`: greeting, road from `phd_milestones`, this week from `deriveMyActions`, work record, Need-something buttons to existing tickets | M | `SH1` | A student with no milestones sees a plain sentence, not an empty road; no other student's data is reachable (RLS test) |
| `ST2` | Gates and the fellowship clock | Gate templates, `gate_key`, `student_pace()`, the spare-months line, the 12-month warning to student and supervisor | M | — | The forecast for a known student matches a hand count; the warning fires once, not daily |
| `ST3` | Supervisor meetings | `phd_meetings`, write / confirm RPCs, the 30 / 60-day rule | M | `SH4` (sweep) | A confirmed note cannot be edited by either side (DB test) |
| `ST4` | Private route, letters, priorities | Private ticket category with RLS that excludes the supervisor; bonafide letter from a template; Do first block | M | `SH3`; `PJ3` (letter engine) | The supervisor's account cannot read a private ticket by any path (DB test) |

---

## 2. Project staff

### 2.1 The screen

| # | Block | Shows | Actions |
|---|---|---|---|
| 1 | Greeting and two clocks | Contract end date and what is in motion. Clock 1: this contract — days left, post, pay. Clock 2: time in CSIR projects against the cap — used and left | Open my engagement |
| 2 | **Do first** | Priorities from the project leader | Mark done · Cannot by then · Seen it |
| 3 | My leave | Days left of 12; days used; the year's end and "do not carry over"; open requests and who holds them | Ask leave |
| 4 | My pay | Last pay and its date; pay-raise or arrears requests and where they wait | — |
| 5 | Papers I can ask for | Experience certificate · pay certificate · no-objection letter · ID card | One click each |
| 6 | What next for me | Open posts the person is eligible for under the rules; a downloadable record of their work (papers, instruments trained, projects) | See post · Download record |

### 2.2 Rules of this screen

- **No surprise at the end of a contract.** The person, the PI and the head are told at
  90, 60 and 30 days. At 90 days the PI gets a one-click "extend / do not extend" row. A
  "do not extend" answer is shown to the person the same day. Silence is not an answer:
  at 30 days with no answer the head is told.
- **The cap is shown as time left, never as a threat.** "3 years 2 months left" with the
  rule's reference (`csir_rule('project_staff.max_years')`, 6 or 7 years by category;
  time as a PhD fellow is excluded as the rule states).
- **Certificates come from the record.** When engagement dates, post and pay are on
  record, the certificate is generated, sent for one signature (in-app attest, the
  committee module's `signatures`), and carries a `/verify/:code`. Target: 2 working days,
  shown as a timer to the signer.
- **Leave is counted by rule**: 12 days paid a year, maternity 180, paternity 15
  (`csir_rule`). The request goes to the PI; PME/HR keep the register as today.
- Pay status is read from the AMS import (`SH6`). Until then the block shows only what
  SURYA holds and says "pay status not connected yet".

### 2.3 What exists today (checked 2026-11-13)

| Block | Data today | Gap |
|---|---|---|
| Screen | `ProjectStaffView.tsx` (120 lines): two counts, assignments, linked projects | Replace |
| 1 | `project_staff_persons`, `project_engagements` (other session, `20261113000003`); contract-end items in `deriveMyActions` | Cap arithmetic as a function; the person's own read access to their engagement |
| 3 | `project_staff_leave` — a register kept by PME/HR; no request flow | Request and approve |
| 4 | Nothing (AMS) | `SH6` |
| 5 | Nothing | Letter engine |
| 6 | `vacancy_posts`, recruitment drives | Eligibility match |

### 2.4 New data

```
leave_requests      id, engagement_id, kind, from_on, to_on, reason, status
                    ('ASKED','APPROVED','REFUSED','WITHDRAWN'), decided_by, decided_at
letter_requests     id, requester_user_id, kind ('EXPERIENCE','PAY','NOC','BONAFIDE','ID'),
                    subject_type, subject_id, status ('ASKED','READY','SIGNED','ISSUED'),
                    document_id, signature_id, asked_at, issued_at
extension_answers   engagement_id, asked_at, answer ('EXTEND','NOT_EXTEND'), months,
                    reason, answered_by, answered_at
```
`my_engagement()` — invoker — the caller's own engagement, the two clocks, leave balance.
An approved `leave_requests` row writes the `project_staff_leave` register row inside the
RPC, so the register stays the one source.

### 2.5 Phases

| ID | Phase | Contents | Effort | Needs | Done when |
|---|---|---|---|---|---|
| `PJ1` | The screen and two clocks | New `ProjectStaffView`; `my_engagement()`; cap arithmetic from `csir_rule` | M | `SH1`; enterprise P1, P5 | The clocks for a known person match a hand count; a person sees only their own engagement (RLS test) |
| `PJ2` | Leave | `leave_requests`, ask / decide RPCs, balance by rule, the PI's quick-win row | M | — | A request over the balance is refused with the rule; an approved request appears in the PME register once |
| `PJ3` | Letters | `letter_requests`, templates rendered with `@react-pdf/renderer`, one signature, verify code. The same engine serves the student's bonafide letter | L | Committee `signatures` (or password attest alone until then) | A certificate's dates equal the engagement record; a changed PDF fails `/verify` |
| `PJ4` | Contract end and what next | 90 / 60 / 30 ladder, `extension_answers`, eligible open posts, downloadable record; Do first block | M | `SH3`, `SH4` | No engagement reaches its end date without an answer or a notice to the head (sweep test) |

---

## 3. Technical staff

### 3.1 The screen

| # | Block | Shows | Actions |
|---|---|---|---|
| 1 | Greeting | Instruments in charge; how many are down; people waiting today. A quiet count of the year's entries | — |
| 2 | Today's queue | Booked slots, workshop jobs, training asks — oldest first, with the requester and project | Start · Done and log (one tap) · Certify a trained user |
| 3 | My instruments | State (up / down N days / due), use %, service contract end, calibration due, logbook rule and unlogged uses | Log · Update fault · Book agency |
| 4 | Quick entry | Five large buttons: used · job done · fault · consumable low · photo of a logbook page. Stock lines that run low | Each is one short form |
| 5 | My year | Annexure I: tasks assigned and signed. Annexure II: work done, grouped by APAR output code, filled from the entries. Papers that named the person or the instrument | Remind the reporting officer · See draft |
| 6 | **Do first** | Priorities from the reporting officer or head (rendered above block 2 when present) | As elsewhere |

### 3.2 Rules of this screen

- **Phone first.** This role works at a bench, not a desk. Blocks 2 and 4 are designed for
  a phone and one hand. "Done and log" writes the usage row with the booking's user,
  project and hours already filled.
- **Every entry is counted once and used three times**: the instrument's logbook (the
  ₹5 lakh rule), the project's instrument use, and the person's own appraisal record.
  Nobody types the same fact twice.
- **The appraisal draft builds itself.** Each kind of entry maps to an APAR output code:
  usage → 20 (operation and maintenance of sophisticated equipment); test report → 3;
  training given → 8; workshop / job work → 9 and 18; technical assistance → 10. Annexure
  II is then a query, with scheduled against actual dates and the constraints the person
  noted ("delay in equipment delivery").
- **Work is seen.** When a paper or report uses an instrument's logged hours, the
  technical officer is told and it is counted in block 5. Authors are prompted, not forced,
  to acknowledge.
- **A fault is not the officer's red mark.** "Down 11 days" names where it waits (service
  engineer, spare part in Purchase).
- Only a certified user may book an instrument that needs training.

### 3.3 What exists today (checked 2026-11-13)

| Block | Data today | Gap |
|---|---|---|
| Screen | `TechnicianView.tsx` (129 lines): three counts, AMC expiring, an inventory table | Replace |
| 2 | `tickets`; no bookings | Booking and job tables |
| 3 | `equipment` (AMC fields), `equipment_usage_log`, `equipment_logbook_required()` | Who is in charge, by staff ID; fault state with dates; calibration |
| 4 | Usage log RPC exists | Fault, stock, photo entry |
| 5 | PMS covers scientists. No Annexure I / II for technical staff | New |

### 3.4 New data

```
equipment_in_charge   equipment_id, staff_id, from_on, to_on
equipment_bookings    id, equipment_id, user_id, project_id, from_at, to_at, samples,
                      status ('ASKED','CONFIRMED','DONE','MOVED','CANCELLED'), usage_log_id
equipment_faults      id, equipment_id, opened_at, closed_at, summary, waits_on, reported_by
equipment_training    equipment_id, user_id, certified_by, certified_on
equipment_calibration equipment_id, done_on, due_on, agency, document_id
tech_jobs             id, kind ('WORKSHOP','TEST','ASSIST','TRAINING'), requester_user_id,
                      project_id, title, asked_at, done_at, done_by, output_code smallint
apar_tasks            id, staff_id, year, project_title, task, expected_output,
                      output_code, assigned_on, target_on, inputs_committed,
                      signed_by_employee_at, signed_by_ro_at          -- Annexure I
apar_work_done        task_id, work_done, scheduled_on, actual_on, constraints,
                      output_code                                      -- Annexure II
```
`my_apar_draft(p_year)` — invoker — joins `apar_tasks` with counts from `tech_jobs`,
`equipment_usage_log` and training rows by output code. The confidential parts of the APAR
(grades, Part III) are **not** in this plan.

### 3.5 Phases

| ID | Phase | Contents | Effort | Needs | Done when |
|---|---|---|---|---|---|
| `TS1` | The screen on today's data | New `TechnicianView`: greeting, my instruments from `equipment` and the usage log, in-charge mapping, quick "used" entry, service contracts ending | M | `SH1` | An officer sees only instruments in their charge first; the usage entry works at phone width |
| `TS2` | Bookings and queue | `equipment_bookings`, `equipment_training`; ask / confirm / done RPCs; "Done and log" writes the usage row; the student's and scientist's "Book instrument" | L | — | A booking marked done creates exactly one usage row; an untrained user is refused for a training-gated instrument |
| `TS3` | Faults, calibration, stock | `equipment_faults`, `equipment_calibration`, low-stock notes; moved bookings notify users; the Director's and head's "instrument down" lines read this | M | `TS2` | A fault moves that day's bookings to "moved" and tells each user once |
| `TS4` | Jobs and the appraisal record | `tech_jobs`, `apar_tasks`, `apar_work_done`, `my_apar_draft()`, both signatures on Annexure I, export in the form's layout | L | Enterprise P4 (assessment); `signatures` | The draft for a test year equals a hand count per output code; a task cannot be changed after both signatures |
| `TS5` | Work is seen | Link outputs to logged instrument hours; tell the officer; count acknowledgements; Do first block | S–M | `SH3`; enterprise P2 | A paper tagged to a project with logged XRD hours appears in the officer's block 5 |

---

## 4. Order across the three roles

1. `ST1`, `PJ1`, `TS1` — three screens on today's data. Each is small once `SH1` exists.
2. `TS2` — bookings. It unblocks the student's "Book instrument" and the instrument lines
   on the head's and Director's screens.
3. `PJ2`, `PJ3` — leave and letters. These remove the most follow-up for the most people.
4. `ST2`, `ST3`, `PJ4`, `TS3`.
5. `TS4`, `TS5`, `ST4`.

### Verification, every phase

- `npm run build`, `npm run lint`, `npm test`, `python scripts/check_security_definer.py`.
- `scripts/db/roleHomes.db.test.ts`: own-data-only for each role; the private ticket rule;
  leave balance; booking → one usage row; signed rows are frozen.
- Checked in the running app as each role at phone width first, then desktop; light and dark.

---

## 5. Open questions

| # | Question | Default if unanswered |
|---|---|---|
| 1 | Which universities' gate lists are needed (AcSIR, others) | AcSIR first; one template per university |
| 2 | Who is told when a student has no supervisor meeting | Supervisor at 30 days; head at 60 |
| 3 | Who reads a student's private ticket | The student grievance desk only. Never the supervisor |
| 4 | Who signs an experience certificate | The PI prepares nothing; Administration signs. One signature |
| 5 | Does project staff leave need the head, or the PI only | PI only, up to the 12 days |
| 6 | May project staff see the pay-raise file's stage | Yes: office name and days only |
| 7 | Who names the instrument in-charge | The head of the division |
| 8 | Which instruments need training before booking | Set per instrument by its in-charge |
| 9 | Is the Group III APAR filled in SURYA or only drafted here | Drafted here (Part I facts, Part II-A, Annexures I and II). Grading stays on the official form until enterprise P4 covers it |
| 10 | Do technical staff in Groups I and II use the same screen | Yes, without the Annexure block if their form differs |

---

## 6. Out of scope

- Any comparison between students, between project staff, or between technical officers.
- The confidential parts of the APAR.
- Replacing CPS, AMS or eHRMS; pay and claims are read from imports.
- Hostel and ID systems; the buttons open a ticket to the right desk.
