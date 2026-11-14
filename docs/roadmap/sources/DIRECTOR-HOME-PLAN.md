# Director Home and Delegation — Implementation Plan

_Proposal, 2026-11-13. Item IDs `DH1`–`DH8`. Indexed from [`../ROADMAP.md`](../ROADMAP.md).
Delivers roadmap `WP-5 E` (role-first home) for the `Director` role. Builds on
[`HOD-HOME-PLAN.md`](HOD-HOME-PLAN.md) (`HH1`–`HH8`) and
[`SCIENTIST-HOME-PLAN.md`](SCIENTIST-HOME-PLAN.md) (`SH1`–`SH6`)._

**Goal.** One screen the Director opens each morning that answers, in order: what does
Headquarters want first, what must I decide myself, what did my heads decide in my name,
which division needs me, which office is holding the institute up, what do I owe upward,
and what is my week.

**The fact this plan is built on.** By rule, almost every approval in a CSIR laboratory is
the Director's. How much of it the Director passes down is a personal choice. One Director
lets heads run their divisions. Another reads every indent. Both are right. So the app must
not fix the answer. It gives the Director a **delegation dial**, and the dial — not the
code — decides what reaches the Director's desk.

**Three promises of the dial.**

1. **The Director stays the authority.** A delegated decision is recorded as made *under
   the Director's order*, with the order number on it.
2. **Nothing is hidden.** A hands-off Director still sees every delegated decision in a
   digest, with flags, and can call any of it back.
3. **A new Director starts clean.** A delegation order belongs to one Director. It ends
   when that Director's term ends. The next Director sets their own.

---

## 1. The delegation dial

### 1.1 What the Director sets

For each **kind of decision**, one of three modes:

| Mode | Meaning | What the Director sees |
|---|---|---|
| `SELF` | I decide | The item in "Waiting on your decision", with the head's advice |
| `HEAD_TELL` | The head decides; tell me | The decision in the digest the same day |
| `HEAD_FLAGS` | The head decides; show me only flags | Only decisions that trip a flag (§1.4), plus the sample |

Each line may also carry:

- **A money limit.** "Indents up to ₹5 lakh." Above the limit the item comes to the Director.
- **A division.** "For CMD only." A Director may trust one head more than another. Default: all divisions.
- **A sample rate.** "Show me 1 in 10." Default 1 in 10 for `HEAD_FLAGS`, none otherwise.

Three **presets** fill every line at once: *Hands-on* (all `SELF`), *Balanced*, *Hands-off*.
A preset is a starting point; the Director can then change single lines.

### 1.2 Kinds of decision (first list)

| Kind | Delegable | Balanced preset |
|---|---|---|
| Leave and tour of scientists | Yes | `HEAD_FLAGS` |
| Project staff: hiring request, extension | Yes | `HEAD_TELL` |
| Purchase indent, by amount | Yes, to the limit the rules allow | `HEAD_TELL` to ₹5 lakh |
| Progress report to funder / PME | Yes | `HEAD_TELL` |
| New proposal | Yes | `SELF` |
| Project change (time, money, people) | Yes, within §6.4 overrun limits | `SELF` |
| Instrument hours to other divisions | Yes | `HEAD_FLAGS` |
| Selection committee result | **No** | — |
| Final appraisal grade; representation | **No** | — |
| MoU / agreement signing | **No** | — |
| Purchase above the Director's own power | **No** — goes to Headquarters | — |
| Constituting a committee | **No** | — |

The "No" rows are the **floor**. They come from `csir_rule()` (enterprise P1,
key `delegation.floor.<kind>`), not from code, so a change in CSIR's delegation of powers
is a data change. The dial shows floor rows with a lock and the rule's reference.
**The exact floor needs the CSIR Delegation of Financial Powers text** (question 1).

### 1.3 Every change is an order

A change to the dial does not edit a setting. It **issues a delegation order**: number,
date, effective-from, the full set of lines, signed by in-app attest (the method the
committee module uses). The order renders as a one-page PDF office order that can be
circulated. Old orders are kept. Each decision stores the order it was made under, so an
audit five years later can answer "under what authority did the head approve this?"

### 1.4 Safeguards that do not depend on the mode

| Safeguard | Rule |
|---|---|
| Flags | A delegated decision is flagged when a pre-check (`HH3`) has a finding, or one of: split purchase (same vendor, same division, within 30 days, sum over the limit); extension with under 6 months left to the cap; approval within 5 minutes of the request on an item over ₹1 lakh; the head is a party (own project, own leave) |
| No self-approval | A head never decides an item where the head is the requester or the PI. It goes up, whatever the mode |
| Send up | A head may send any single item to the Director, with a reason |
| Call back | The Director may call back one decision (within 7 days, if not yet acted on downstream) or pull one kind back to `SELF` at once |
| Sample | Unflagged decisions picked at the sample rate appear in the digest for a look |
| Acting | An acting Director (`acting_assignments`, role `Director`) works under the same order and cannot change the dial |
| Vacuum | When a head is on leave with no acting head, that division's delegated kinds fall back to `SELF` until one is named. The screen says so |

### 1.5 The other side

- **The head's screen** (`HH2`) shows, on each row, "you decide · order DO/2026/14" or
  "your advice goes to the Director". The head always knows which it is.
- **The requester** sees who holds the item now and under what order.
- **In `SELF` mode the head still gives advice first.** The Director sees
  "Head AMD advises: approve" and the pre-check line. A hands-on Director decides
  everything but types nothing twice.

---

## 2. The screen

> The final page order is in §8 ("One page"). The blocks below are unchanged; their order
> and the removal of block 11 are set there.

```
┌ (ring 7)  Good morning, Dr. Srivastava. Seven decisions need you. Your heads decided … ┐
│ [ Ask or search ……………………………… ]  [Pin a priority]            prepared by your office 08:40 │
├ HOW MUCH REACHES ME · [Hands-on] [Balanced] [Hands-off]        order DO/2026/14 ─────────┤
├ DO FIRST · from CSIR Headquarters ───────────────────────────────────────────────────────┤
├ WAITING ON YOUR DECISION · with the head's advice     reaching you 7 · decided by heads 19┤
├ DECIDED IN YOUR NAME · flags, sample                              [Call back] [Ask head] ─┤
├ DIVISIONS · by exception                 │ STUCK IN OFFICES · only you can move these ────┤
├ OWED UPWARD · replies and reports        │ MY WEEK · chair, sign, meet ───────────────────┤
├ INSTITUTE AT A GLANCE · four numbers, each opens its list ───────────────────────────────┤
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

| # | Block | Shows | Actions from the block |
|---|---|---|---|
| 1 | Greeting | Decisions that need the Director; decisions made in the Director's name this week; flags. Time the Director's office last prepared the desk | — |
| 2 | Ask and start | Ask SURYA institute-wide: "who has worked on X", "which projects end this quarter", "what did we tell the Research Council about Y" | Pin a priority (to a head, or to an office head) |
| 3 | Delegation dial | Present order; presets; one line per kind. Collapsed to one line after first use: "Balanced · 4 kinds with heads · order DO/2026/14" | Change a line → preview "this moves N open items" → issue order |
| 4 | **Do first** | Items from Headquarters with a deadline: Parliament questions, DG review inputs, audit paras, letters. Logged by the Director's office | Open draft · Assign to a head (becomes a pinned priority) · Mark sent |
| 5 | **Waiting on your decision** | What the dial leaves with the Director, oldest first: head's advice, pre-check line, days waiting | Approve · Return (reason) · Ask · Approve all (quick, no finding) |
| 6 | Decided in your name | Count this week; flagged decisions; the sample | Call back · Ask head · Fine |
| 7 | Divisions | One row per division, by exception: projects late, items waiting on the head, the head's median answer time, vacant posts. A line when a head is away with no acting head | Open the division (the head's own screen, read-only) · Pin · Name acting head |
| 8 | Stuck in offices | Purchase, Accounts, Recruitment, Administration: count over the norm, oldest item, days at stage | Pin to the office head · Fix a date · Put on the Management Council agenda |
| 9 | Owed upward | Timers: Management Council and Research Council papers, action-taken notes, CPD status (15 Apr / 15 Sep), annual report, audit replies | Open · Read · Sign and send |
| 10 | My week | Meetings the Director chairs; minutes to sign; selection results; visitors; agreements to sign — each with a brief | Sign · Read brief · Declare |
| 11 | Institute at a glance | Four numbers only: outside money against target, budget used, posts filled against sanction, technologies at TRL 6+. Each opens its list | Open list |

**Layout rules**

- Order fixed. Decisions (4–6) above status (7–11).
- **One strong button**, on the first Headquarters item; else on the oldest decision.
- Amber border once, on block 4.
- Block 11 is last on purpose. Today's Director page is six counts; counts do not need a
  decision, so they do not lead the screen.
- A hands-on Director with a long block 5 gets it **grouped by kind** with a count per
  group and "Approve all with no finding" per group. Volume must not punish the choice.
- The app never tells the Director to delegate more. It may state one fact, once a week at
  most: "38 items waited more than 5 days for you last month." No advice follows it.
- Phone: blocks 1, 4, 5, 6.

**The Director's office.** A new permission `DirectorOffice` (the personal secretary).
It may: log Headquarters items, attach papers, prepare drafts, order the day. It may not:
approve, return, change the dial, or see confidential appraisal content. Every row it
prepared is marked "prepared by your office".

---

## 3. What the Director can do from this screen alone

| Area | Actions |
|---|---|
| Set the style of work | Choose a preset; change one line; set a limit; trust one division more; issue the order |
| Decide | Approve, return, ask — with the head's advice and the pre-check in view |
| Oversee without deciding | Read flags and the sample; call back; ask the head why |
| Direct heads and offices | Pin a priority (max 3 per person, reason required — `SH3`); answer a push-back; name an acting head |
| Unblock the institute | Pin a stuck purchase or bill to the office head; put it on the Management Council agenda |
| Answer upward | Open a drafted reply with its sources; assign it; sign and send |
| Chair and sign | Sign minutes; read a selection result; declare a conflict; build an agenda from stuck items |
| Find people | "Who can represent us on hydrogen storage on Tuesday?" — expertise search (enterprise P6) |
| Look | Open any division as its head sees it; open any number to its list |

---

## 4. What exists today (checked 2026-11-13)

| Part | Today | Gap |
|---|---|---|
| Screen | `DirectorView.tsx` (168 lines): six counts and a division table. Raw colours, upper-case headings | Replace |
| Who is Director | `caller_is_director()`; `acting_assignments` with role `Director`; `caller_acting_as()` | Use both everywhere the dial is read |
| Delegation | Nothing. Each module's approve RPC names its approver in code | §5 |
| Decision queue | Planned as `my_decisions()` in `HH2` | Must ask the dial who decides |
| Pre-checks, Ask | Planned in `HH3` | Reused as is |
| Priorities | Planned in `SH3`; the Director may already pin | Office heads must be valid assignees |
| Divisions block | `divisions`, projects, `sanctioned_posts`; answer time planned in `HH2` | Roll-up function |
| Offices block | Nothing in SURYA (CPS, AMS) | `SH6` imports |
| Owed upward | CPD dates known; committee papers arrive with `CM2`–`CM5` | Headquarters items table |
| Glance | `projects`, `sanctioned_posts`, `tech_transfers`, `mous`; `metric_value` planned (enterprise P7) | Outside-money target is not stored |

---

## 5. Data model

```
delegation_orders   id, order_no (unique), director_user_id, issued_at, effective_from,
                    ended_at, preset, signature_id, document_id
delegation_lines    order_id, kind, mode ('SELF','HEAD_TELL','HEAD_FLAGS'),
                    amount_limit numeric NULL, division_code NULL (= all), sample_rate smallint
decision_log        id, kind, subject_type, subject_id, division_code, amount,
                    decided_by, decided_as ('DIRECTOR','ACTING_DIRECTOR','HEAD_UNDER_ORDER'),
                    order_id NULL, outcome, flags text[], sampled boolean,
                    called_back_at, called_back_by, decided_at
hq_items            id, kind ('PARLIAMENT','DG_REVIEW','AUDIT','LETTER','OTHER'), title,
                    received_on, due_at, assigned_to, status, document_id, logged_by
```

RLS: `delegation_orders` and `delegation_lines` — every staff member reads the order in
force (it is a public office order); only the Director writes, only through the RPC.
`decision_log` — the Director reads all; a head reads their division; the requester reads
their own item; nobody writes directly. `hq_items` — Director, `DirectorOffice`, assignee.

| Function | Who | Does |
|---|---|---|
| `delegation_issue(p_preset text, p_lines jsonb, p_effective_from date)` | Director only (not acting) | Checks every line against the floor; closes the order in force; creates the new one; needs attest; notifies heads |
| `delegation_preview(p_lines jsonb)` | Director | Returns how many open items would move, by kind. Changes nothing |
| `decision_authority(p_kind text, p_division text, p_amount numeric, p_requester uuid)` | Any module RPC | Returns `('DIRECTOR' or 'HEAD', order_id)`. Applies floor, limit, division, no-self-approval, the vacuum rule. **The one place the rule lives** |
| `decision_record(...)` | Called inside each module's approve RPC | Writes `decision_log`, computes flags and the sample |
| `decision_send_up(p_subject_type, p_subject_id, p_reason)` | Head | Marks one item for the Director |
| `decision_call_back(p_log_id uuid, p_reason text)` | Director | Reverses through the module's own "return" path when the module allows it; otherwise refuses and says why |
| `my_delegated_digest(p_from date, p_to date)` | Director | Flags, sample, counts for block 6 |
| `hq_item_log(...)`, `hq_item_assign(...)`, `hq_item_close(...)` | Director's office / Director | Block 4 |

**The honest cost.** Today each module decides its approver in its own RPC. For the dial to
be real on the server, each approve RPC must call `decision_authority()` instead of testing
a role, and `decision_record()` after it acts. That is one small change per module, done
module by module (`DH3`). Until a module is converted, its kind shows on the dial as
"not connected yet" and behaves as it does today. The dial never shows a mode the server
does not enforce.

Default when no order exists: every kind behaves as the module behaves today. Shipping
`DH2` changes nothing until a Director issues the first order.

---

## 6. Phases

Effort as in the roadmap (`S` half a day · `M` 1–2 days · `L` 3+ days · `XL` multi-week).

| ID | Phase | Contents | Effort | Needs | Done when |
|---|---|---|---|---|---|
| `DH1` | The screen on today's data | New `DirectorView`: greeting, divisions by exception (`division_rollup()`), my week from meetings, the four numbers with drill-down, Ask box. No dial yet | L | `SH1`, `HH1` | The six counts are gone; each of the four numbers opens the list that produced it; an acting Director sees the screen for the acting period only |
| `DH2` | Delegation core | §5 tables; `delegation_issue`, `delegation_preview`, `decision_authority`, `decision_record`; floor keys in `csir_rules`; the dial UI with presets; the order PDF | L | Enterprise P1 (`csir_rule`); committee `signatures` (or password attest alone until then) | A line below the floor is refused with the rule's reference; an acting Director cannot issue; a second order closes the first; a DB test covers limit, division, self-approval and vacuum |
| `DH3` | Modules obey the dial | Convert approve RPCs to `decision_authority()` + `decision_record()`: project staff hiring and extension, progress reports, proposals, project changes, leave/tour as available. `my_decisions()` (`HH2`) reads the same function | L, one module at a time | `DH2`, `HH2` | For each converted module: the same request goes to the head under one order and to the Director under another, with no code change; the audit row carries the order number |
| `DH4` | Oversight | Flags, sample, digest block, call back, send up, "Ask head" | M | `DH3`, `HH3` | A split purchase is flagged; a called-back decision returns to the requester's module state with the reason; a call back that the module cannot undo is refused in words |
| `DH5` | Headquarters desk | `hq_items`, `DirectorOffice` permission, block 4, assign-as-priority, reply drafts with sources from the RAG service (cite or refuse) | M–L | `SH3` | A logged Parliament question shows a countdown; its draft lists the files it used; the office account cannot approve anything (DB test) |
| `DH6` | Stuck in offices | Block 8 from the CPS / AMS imports; norms per stage; pin to office head; offer to Management Council agenda | M | `SH6` | An indent over the norm appears with its stage and days without anyone typing it |
| `DH7` | Owed upward and my week, in full | Committee papers, action-taken notes, sign-all-read, selection results, visit and agreement briefs | M, in pieces | `CM2`–`CM5`, `HH4`, `HH6` | Each row shows its real action the day its source ships |
| `DH8` | Hand-over | When a Director's term ends: orders end; a hand-over note is built (open decisions, open priorities, Headquarters items, flags not answered); the new Director's first login offers the three presets | S–M | `DH2` | No order of a past Director is ever in force for the next one |

**Order.** `DH1` can ship at once. `DH2` then `DH3` are the heart; `DH3` goes module by
module, hiring and progress reports first (highest volume). `DH4` right after the first two
modules. `DH5` is independent and may go any time after `DH1`. `DH6`, `DH7` follow other
plans. `DH8` before the first change of Director.

### Verification, every phase

- `npm run build`, `npm run lint`, `npm test`, `python scripts/check_security_definer.py`.
- `scripts/db/delegation.db.test.ts`: a matrix of (mode × limit × division × requester is
  head × head on leave) against `decision_authority()`; floor refusal; order succession;
  acting Director; `DirectorOffice` cannot decide.
- One test per converted module: same request, two orders, two approvers.
- Checked in the running app as Director, acting Director, head, requester and office
  account; desktop and phone; light and dark.

---

## 7. Open questions

| # | Question | Default if unanswered |
|---|---|---|
| 1 | What may a Director not delegate (CSIR Delegation of Powers) | The "No" rows in §1.2. **I need the rule text to set the floor correctly** |
| 2 | May the Director delegate differently per division | Yes |
| 3 | May the Director delegate to a named person, not only "the head" | Not in the first version. Head or acting head only |
| 4 | Is the delegation order visible to all staff | Yes. It is an office order |
| 5 | How long may a decision be called back | 7 days, and only if nothing downstream has acted on it |
| 6 | Who logs Headquarters items | The Director's office (`DirectorOffice`), also the Director |
| 7 | Does the DG / Headquarters get a view | Not in this plan. `decision_log` and the roll-ups are built so a wider scope can read them later |
| 8 | Are office heads (Purchase, Accounts, Administration) assignable for priorities | Yes — needs their staff rows linked to logins |
| 9 | What is the yearly outside-money target and who sets it | Stored per year by PME; shown only when set |
| 10 | Default preset for a new Director | None. The first login asks; until then modules behave as today |

---

## 8. Administration, funds and planning ahead

_Added 2026-11-13. The Director is also the administrative head. Sections 1–7 cover the
day's decisions. This section covers money, and the months ahead._

**One page, decided 2026-11-13.** There is no Today / Plan-ahead switch. The blocks of §2
and of this section sit on one page, in five bands. This order replaces the order in §2:

| Band | Blocks, in order |
|---|---|
| Top | Greeting (decisions, delegated count, flags, **free money and money that may lapse**, source dates) · Ask box · Pin a priority · the dial as one button ("Balanced · order DO/2026/14") that opens the dial in place · jump links to the bands |
| **Briefing** | Briefing · critical matters · My watch list (§8.7) |
| **Decide** | Do first (Headquarters) · Waiting on your decision — science and administration in one list, plus one row for what is decided in AMS / eHRMS (was P7) · Decided in your name |
| **Money** | Fund status by head (P2; carries outside money against target and project money) · Purchase plan (P4) beside Stuck in offices |
| **Ahead** | The next 12 months (P3) · People plan (P5) beside Infrastructure (P6) |
| **Institute** | Divisions by exception beside Owed upward and my week (one block; audit, court and RTI replies are rows in it) |

What the merge changed:

- "Institute at a glance" (§2 block 11) is removed. Its four numbers now sit where they
  mean something: outside money and budget in Fund status, posts in People plan,
  technologies in the divisions drill-down.
- Administrative kinds that SURYA can decide join the dial and the one decision list:
  service-contract renewal, room allotment. Write-off is locked by rule.
- A purchase decision row shows the free money in its budget head in the pre-check line.
  The Director does not scroll to Money to decide.
- The dial is closed by default after the first order. The page stays short.
- Phone: Top and Decide only, then the first sentence of Money. The rest sits behind "More".

### 8.1 Fund status — one meaning, used everywhere

| Word | Meaning | Comes from |
|---|---|---|
| Sanctioned | What Headquarters approved for the year, by head | Sanction letter (entered once a year) |
| Received | What has been released to the institute | AMS |
| Committed | Orders placed and salaries due, not yet paid | CPS (orders), AMS (pay) |
| Spent | Paid | AMS |
| **Free** | Received − committed − spent | Computed |
| May lapse | Free money on a lapsing head that cannot be ordered and paid by 31 March at the institute's own measured speed | Computed (§8.3) |

Two purses, never mixed on screen: **institute money** (CSIR grant, by head: salaries,
equipment, works, consumables, travel and other; and the Lab Reserve Fund, which does not
lapse) and **project money** (per project, per head — already in SURYA's project files).

Every figure shows its date: "Accounts as of 12 Nov, 18:00". A figure older than 7 days is
tagged "old". SURYA never shows a fund figure without its source and date.

### 8.2 Plan-ahead blocks

| # | Block | Shows | Actions |
|---|---|---|---|
| P1 | One sentence | Free to plan with; what may lapse and by when orders must go | — |
| P2 | Fund status by head | One bar per head: spent, committed, free. Tag: on course / may lapse / short by (month). Release asked from Headquarters and its age. Project money in one line with overspent projects | Open a head → its lines · Remind Headquarters · Move within the rules (re-appropriation note) |
| P3 | The next 12 months | A grid, one row per kind of event, one cell per month: retirements, contracts ending, projects ending, service contracts ending, big payments. Heavy months stand out | Click a cell → its list |
| P4 | Purchase plan | This year: lines ordered / in tender / not started; large lines not started with the last safe start date; indents that were not in the plan. Next year: asks from divisions, with duplicates found | Open plan · Approve / cut / merge lines · Pin a late line |
| P5 | People plan | Posts filled against sanction by group; retirements with no successor; sole experts; hiring drive stage and days; posts that can be advertised now; assessments due and their pay effect | Start a drive · Name a successor / understudy · Open list |
| P6 | Infrastructure | Works register: paid against built, due date, agency. Estimates waiting at Headquarters. Service contracts ending with renewal cost and use. Rooms free and asked for | Open · Remind · Renew / drop a service contract · Allot space |
| P7 | Administrative matters | Counts of what waits for the Director in AMS and eHRMS (bills above the head's limit, service matters), audit paras, court and RTI replies, write-off lists | Open in AMS / eHRMS (deep link) · Read · Assign |

**P7 is honest about where the decision is made.** Bills and service matters are approved
in AMS and eHRMS. SURYA shows the count, the age and the oldest item, and opens the other
system. It does not copy the approval. When those systems give a way to write back, the
kinds join the delegation dial (§1.2) like any other.

### 8.3 Planning rules (pure functions, each with a test)

| Rule | How |
|---|---|
| Last safe start date | 31 March minus the institute's own median days from indent to payment for that size of purchase (from CPS history; default 110 days over ₹25 lakh until history exists) |
| May lapse | For each lapsing head: free money minus what the not-started plan lines can still spend before their last safe start |
| Short by (month) | Spend rate of the last 3 months carried forward against free money |
| No successor | A retirement within 12 months where no other person holds the same charge (instrument in-charge, section charge, committee seat) |
| Sole expert | One person only is recorded for a skill or instrument that had use in the last year (profile facts, enterprise P2/P6) |
| Duplicate ask | Two next-year asks with the same instrument class; or an ask where the institute owns one used under 40% |
| Off plan | An indent with no purchase-plan line |
| Paid ahead of built | A work where the paid share exceeds the built share by more than 15 points |

No rule uses a language model. Ask SURYA may *explain* a figure, and must cite the rows.

### 8.4 New data

```
budget_heads        code, name, purse ('INSTITUTE','LRF'), lapses boolean
budget_year_lines   fin_year, head_code, sanctioned, received, committed, spent,
                    as_of timestamptz, source ('AMS','MANUAL'), import_id
purchase_plan_lines id, fin_year, division_code, title, instrument_class, est_cost,
                    head_code, quarter, priority, justification, status
                    ('ASKED','APPROVED','CUT','MERGED','INDENTED','ORDERED','PAID'),
                    merged_into, indent_ref, decided_by, decided_at
infra_works         id, title, kind ('CIVIL','ELECTRICAL','IT','UTILITY'), agency,
                    est_cost, head_code, stage, paid_pct, built_pct, due_on, hq_ref
service_contracts   id, equipment_id NULL, title, vendor, from_on, to_on, yearly_cost
space_units         id, building, room, area_sqm, holder_division, holder_project,
                    free_from
succession_notes    post_or_charge, holder_staff_id, understudy_staff_id, noted_by, noted_on
admin_pending       source ('AMS','EHRMS'), kind, count, total_amount, oldest_on, as_of
audit_items         id, kind ('AUDIT_PARA','COURT','RTI'), title, due_on, assigned_to, status
```

RLS: fund and plan tables — Director, `FinanceAdmin`, PME read all; a head reads their
division's plan lines and writes only `ASKED` lines; Purchase and Works desks update
status. `succession_notes` — Director and HR only. People data stays behind the existing
personnel rules.

Reused, not new: `sanctioned_posts`, recruitment drives, `project_engagements`,
`staff` (date of retirement), `equipment`, `equipment_usage_log`, project fund tables,
the CPS / AMS / eHRMS import pipeline of `SH6`.

### 8.5 Phases

| ID | Phase | Contents | Effort | Needs | Done when |
|---|---|---|---|---|---|
| `DH9` | Twelve months and people plan | Block P3 and P5 from data SURYA already holds: retirements, contracts, projects ending, posts, drives, assessments due; `succession_notes`; rules "no successor" and "sole expert" | M–L | `DH1`; enterprise P5; P2/P6 for sole expert | The grid for a known month matches a hand count; a retirement with no successor shows until a name is given |
| `DH10` | Fund status | `budget_heads`, `budget_year_lines`; AMS import; manual entry screen for Accounts until the import exists; block P2 and the Today line; "short by" rule | L | **AMS sample export** (manual entry works without it) | Every figure shows source and date; the sum of heads equals the Accounts statement for the same day |
| `DH11` | Purchase plan | `purchase_plan_lines`; heads ask, Director decides the plan; link indent → plan line; rules last safe start, may lapse, off plan, duplicate ask; block P4 | L | `DH10`; CPS import (`SH6`) for live stages — status can be set by hand before that | An unplanned indent is tagged; "may lapse" changes when a late line is ordered |
| `DH12` | Infrastructure and administrative matters | `infra_works`, `service_contracts`, `space_units`, `admin_pending`, `audit_items`; blocks P6, P7; deep links to AMS and eHRMS | L, in pieces | eHRMS / AMS exports for P7 counts | A service contract shows 90 days before its end with its instrument's use; P7 counts match the other systems on the import date |

**Order.** `DH9` first: it needs no outside file. `DH10` next, with manual entry so it does
not wait on the AMS file. `DH11` after `DH10`. `DH12` in pieces.

### 8.6 More open questions

| # | Question | Default if unanswered |
|---|---|---|
| 11 | Which budget heads does the institute use, and which lapse | The six in the mockup; all lapse except the Lab Reserve Fund. **Accounts must confirm** |
| 12 | Who keeps fund figures until the AMS import exists | `FinanceAdmin`, weekly |
| 13 | Does the institute make a yearly purchase plan today | Assumed yes, on paper or a sheet. SURYA takes it over |
| 14 | Who keeps the works register | A new desk permission for the Works / Engineering section |
| 15 | Is the succession note visible to the person named | No. Director and HR only |
| 16 | May SURYA deep-link into AMS and eHRMS | Assumed yes (a plain URL). To be checked with the vendors |

### 8.7 Briefing and watch list

_Added 2026-11-13._ A new band, **Briefing**, sits between Top and Decide. It has two
blocks.

**Block B1 — Briefing · critical matters.** A summary of the last few days.

- Window: *Since I last looked* (default), *7 days*, *14 days*.
- One short paragraph (Fraunces), then at most **seven** lines. Each line: a tag
  (money, purchase, people, project, upward, committee, safety, closed), one sentence, its
  source record, and two buttons: **Watch** and **Open**.
- Closed matters are shown too ("restarted after your note"). The Director must see that
  an action had an effect.
- Footer: "9 lesser matters are not shown · See all" and "Send this briefing to my office".

**Block B2 — My watch list.** Matters the Director chose to follow.

- Added by **Watch** on any briefing line, decision row, project, purchase line, work, or
  person's task. At most 10. Private to the Director.
- Each row: the present state in one line, and a strip of 7 day-marks (moved / not moved;
  red when not moved and past the norm).
- Actions: Pin to head (makes a priority, `SH3`) · Stop watching.
- A watched matter that moves, or that passes its norm, always appears in the next
  briefing, whatever its rank.
- A watched matter that closes leaves the list by itself, after one last line in the briefing.

**What is "critical" — a fixed rule list, not a model's opinion.**

| Tag | A matter is critical when |
|---|---|
| money | A head gets "may lapse" or "short by"; a project overspends a head; a release is unanswered for 10 days |
| purchase | A plan line or indent over ₹25 lakh passes twice the stage norm; a flagged split purchase |
| people | A project loses its only staff member; a retirement inside 6 months with no successor; a hiring step past its norm |
| project | A project turns "behind" within 30 days of a sponsor review; a sponsor or Headquarters letter is unanswered past its date |
| upward | A Headquarters item inside 3 days of its time; an audit, court or RTI reply inside 7 days |
| committee | A statutory committee has not met within its period; minutes unsigned past the 7-day rule |
| safety | An instrument down over 7 days; any recorded safety incident |
| decisions | A decision waiting on one person for over 7 days; a call back; a flag not looked at for 3 days |
| closed | Any matter that was critical in an earlier briefing and is now resolved |

Thresholds live in `csir_rules` / a settings table, so the institute can change them
without code. Lines are ranked: watched first, then by days past the norm, then by money.

**How the words are written.**

1. Rules pick and rank the matters. This is plain SQL over recorded events.
2. Each line is a fixed sentence pattern filled from the record. No model is needed.
3. Only the opening paragraph may be written by the language model (`rag/`), from the
   picked lines alone. It must not add a fact that is not in a line. If the model is not
   available, the paragraph is a fixed pattern: "N matters became critical and M closed."
4. Every line carries its source record. A line with no source is not shown.

**Data.**

```
briefing_matters   id, tag, subject_type, subject_id, division_code, opened_at,
                   closed_at, rule_key, severity, last_event_at, amount
watch_items        user_id, subject_type, subject_id, added_at, note   (max 10 per user)
briefing_views     user_id, seen_at                                     ("since I last looked")
```

`briefing_matters` is filled by a nightly sweep (`pg_cron`) and on the events that open or
close a matter. It reads the event log of enterprise P1 (`entity_timeline`), the
`decision_log`, fund lines, plan lines, works and committee events. RLS: Director and
acting Director read all; `DirectorOffice` reads all except `people` and `decisions` tags;
`watch_items` — the owner only.

| Function | Does |
|---|---|
| `director_briefing(p_since timestamptz)` | Ranked matters opened, moved or closed since the time; marks watched ones |
| `watch_add(p_subject_type, p_subject_id, p_note)` / `watch_remove(...)` | Owner only; refuses the 11th |
| `my_watch_list()` | Present state and 7 day-marks per item |

The same `briefing_matters` rows, with a division filter, give the head a division
briefing later (`HH` plan) at no extra cost.

**Phase.**

| ID | Phase | Contents | Effort | Needs | Done when |
|---|---|---|---|---|---|
| `DH13` | Briefing and watch list | Tables, sweep, the three functions, blocks B1 and B2, Watch button on rows across the page, fixed-pattern paragraph; model-written paragraph behind a setting | L | `DH1`; enterprise P1 (`entity_timeline`). Each tag switches on when its source exists (`money` after `DH10`, `purchase` after `DH11`, `decisions` after `DH4`) | Every briefing line opens the record that caused it; a watched matter that moves is in the next briefing; a table-driven test covers each rule with an open and a close case; the paragraph never names a matter that is not in the list |

**Order.** `DH13` may start right after `DH1` with the tags that need no outside file:
people, project, committee, upward.

### 8.8 Questions for the briefing

| # | Question | Default if unanswered |
|---|---|---|
| 17 | How many lines | 7, then "See all" |
| 18 | May the language model write the paragraph | Off at first; fixed pattern. On by a setting when the RAG host is live |
| 19 | Is the briefing also sent by e-mail each morning | No. On screen, and to the Director's office on request |
| 20 | May the Director's office add a line by hand | Yes, tagged "from your office", with a document attached |
| 21 | Are the thresholds right (10, 7, 3 days; ₹25 lakh) | As in the table; the institute sets them |

---

## 9. Out of scope

- Any score, grade or advice about the Director's style.
- Automatic approval. Under every mode a person decides.
- Delegation below the head (head → scientist). Possible later with the same tables.
- Replacing CPS, AMS, eHRMS, or the paper file where a rule still requires one.
- The DG's and Headquarters' screens.
