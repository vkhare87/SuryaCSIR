# The Common Desk — Implementation Plan

_Proposal, 2026-11-13. Item IDs `CD0`–`CD17`. Indexed from [`../ROADMAP.md`](../ROADMAP.md).
Companion to the role home plans: [`SCIENTIST-HOME-PLAN.md`](SCIENTIST-HOME-PLAN.md),
[`HOD-HOME-PLAN.md`](HOD-HOME-PLAN.md), [`DIRECTOR-HOME-PLAN.md`](DIRECTOR-HOME-PLAN.md),
[`OTHER-ROLES-HOME-PLAN.md`](OTHER-ROLES-HOME-PLAN.md). Layout decided with the owner on
2026-11-13: **option A** — top bar and right column._

**The idea.** Every home page has two halves.

- **The role half** changes with the role. The four role plans own it.
- **The common half — the Common Desk —** is the same for everyone. It holds what any
  person in any organisation needs each day: my day, my requests, notices, people, and one
  door to ask for anything. This plan owns it.

**Goal.** A person who joins tomorrow, in any role, can do the day-to-day business of the
institute from one page without asking a colleague "where do I go for this?".

---

## 1. The page

```
┌ TOP BAR (common)   [ Search and ask …………… ]   [+ Raise a request]   (bell)   (me) ┐
├───────────────────────────────────────────────┬──────────────────────────────────────┤
│                                               │ MY DAY        calendar · meetings    │
│                                               │ MY REQUESTS   where each ask waits   │
│   ROLE HALF                                   │ NOTICES       office orders · read   │
│   (scientist / head / Director / student /    │ PEOPLE        away today · acting    │
│    project staff / technical staff)           │ ┄┄ shown only when you have some ┄┄  │
│                                               │ WAITING ON ME · MY COMMITTEES ·      │
│                                               │ LETTERS TO ANSWER · MY BOOKINGS      │
└───────────────────────────────────────────────┴──────────────────────────────────────┘
```

### 1.1 Blocks

| Block | Kind | Shows | Actions |
|---|---|---|---|
| Search and ask | Always | One box: people, projects, files, rules, forms; a question goes to Ask SURYA | Open result |
| Raise a request | Always | One door. A short catalogue ("leave", "letter", "repair", "IT", "room", "complaint", "safety", "something else") | Fill the short form for that kind |
| Notifications | Always | The bell; unread count | Open · Mark read |
| **My day** | Always | Today and tomorrow: meetings (time, room, link), due dates, bookings, holidays, my leave. A 7-day strip | Open · Join · Find a time · Full calendar |
| **My requests** | Always | Every ask I made, of any kind, with **who holds it now and for how many days**, against the normal time | Open · Remind (after the norm) · Withdraw |
| **Notices** | Always | Office orders and circulars, newest first; those that need "I have read it" on top | Read · Acknowledge |
| **People** | Always | Who is away today in my division (and whom I work with); who is acting for whom; search the directory | Open profile · Call / mail |
| Waiting on me | When not empty | Approvals and answers that sit with me (count + oldest three) | Open the queue |
| My committees | When not empty | Next meeting per seat; what I owe (read, declare, sign) | Open |
| Letters to answer | When not empty | Inward letters marked to me, with due dates | Open · Reply |
| My bookings | When not empty | Rooms, instruments, vehicle, guest house I booked | Change · Cancel |

### 1.2 Layout rules

1. **A common block is the same on every role's page** — same place, same shape, same
   words. A person who changes role learns nothing again.
2. **One item, one place.** When the role half shows an item (a scientist's "Do first"
   task, a head's decision row), the common half does not repeat it. `HomeContext` keeps a
   set of claimed item keys; common blocks leave those out and show "+2 on the left".
3. **Empty means hidden** for the four conditional blocks. The four always-blocks show a
   plain line when empty ("No notices this week").
4. **The common half is quiet.** No strong button, no amber border. Those belong to the
   role half.
5. **Width.** Right column 320 px. Under 1100 px it moves below the role half. Phone order:
   role half's first three blocks → My day → My requests → Notices → the rest.
6. Each block shows at most five rows and a "See all" link to its full page.
7. The right column may be collapsed to icons with counts; the choice is remembered per
   user (`localStorage`, a view preference only).
8. `DESIGN.md` holds: Inter for body, IBM Plex Mono for dates, counts and reference
   numbers, semantic tokens only.

### 1.3 Roles the common half adds nothing new for

`Guest` and `DefaultUser` (not yet verified) see Notices marked public and nothing else.

---

## 2. The one design decision: four feeds, not twenty integrations

Each block reads **one SQL function**. Each module adds **one `SELECT`** to a function to
appear in a block. No module is rewritten; no block knows about modules.

| Feed function (invoker rights) | Block | A row is |
|---|---|---|
| `my_day(p_from date, p_to date)` | My day, Calendar page | `(at, until, kind, title, place, link, subject_type, subject_id)` |
| `my_requests()` | My requests | `(kind, title, asked_at, holder_label, holder_since, norm_days, state, link)` |
| `my_decisions()` | Waiting on me — **the same function as `HH2`** | as defined there |
| `notifications` table (exists) | Bell, daily digest | as today |

Because the feeds are invoker-rights unions over tables that already have RLS, a person can
only ever see rows they may already read. The feeds add no new access.

The same four feeds answer Ask SURYA ("what is on my day", "where is my leave request")
through the whitelisted catalog in `rag/` — one more reason to keep them as functions.

---

## 3. What exists today (checked 2026-11-13)

| Need | Today | Gap |
|---|---|---|
| Calendar | `calendar_events` (kinds `Custom`, `Pamphlet`, `Announcement`; visibility org / division / personal), `holidays`, `/calendar` page (512 lines) | Meetings, review slots, due dates, bookings and leave are not on it; no time of day (`event_date` only) |
| Meetings | Committee `meetings` only | No ordinary meeting (a PI calls the team); no "find a time" |
| Requests | `tickets` with 8 fixed categories, `helpdesk_routing`, `ticket_events` | No catalogue of request kinds; leave, letters, bookings are separate or missing; no one tracker |
| My work | `/work` page (`MyWork.tsx`, 440 lines) over `deriveMyActions` | Lists things I must do, not things I asked for |
| Notifications | `notifications` (rule / agent source, dedupe key), bell | No e-mail; no digest |
| Notices | `calendar_events` kind `Announcement` | No office-order record, audience, or read receipt |
| People | Staff directory pages; `acting_assignments` | No "away today"; permanent-staff leave lives in eHRMS |
| Letters | Nothing | Inward / outward register |
| Forms and rules | Ask SURYA over indexed documents | No shelf of blank forms and templates |
| Bookings | Nothing (rooms planned in the committee plan; instruments in `TS2`) | — |
| Shell | `Layout.tsx` + `Sidebar.tsx`; `Dashboard.tsx` picks a role view | No right column |

---

## 4. Items and scores

Scored with the method of [`ENTERPRISE-AI-NATIVE-PLAN.md`](ENTERPRISE-AI-NATIVE-PLAN.md) §3:
V value ×3, U usability ×2, C CSIR compliance ×2, L longevity ×2, F feasibility ×2,
R readiness ×1; each 1–5; **Score = (3V + 2U + 2C + 2L + 2F + R) ÷ 60 × 100**.
`Now` ≥ 80 · `Next` 70–79 · `Later` < 70.

| ID | Item | V | U | C | L | F | R | Score | Tier |
|---|---|---|---|---|---|---|---|---|---|
| `CD0` | The shell: two halves, right column, hide-when-empty, one-item-one-place, phone order | 4 | 5 | 2 | 5 | 5 | 5 | **85** | Now |
| `CD2` | My requests tracker (`my_requests()`), norms, Remind | 5 | 5 | 2 | 5 | 4 | 4 | **85** | Now |
| `CD4` | Notices and office orders with audience and read receipt | 4 | 4 | 4 | 4 | 5 | 5 | **85** | Now |
| `CD6` | Waiting on me (`my_decisions()`, shared with `HH2`) | 5 | 5 | 3 | 5 | 3 | 4 | **85** | Now |
| `CD8` | Letters in and out (diary register), marked-to, due dates, reply chain | 4 | 4 | 5 | 4 | 4 | 4 | **83** | Now |
| `CD3` | Raise a request: one door and a catalogue of kinds | 4 | 5 | 2 | 4 | 5 | 5 | **82** | Now |
| `CD1` | My day (`my_day()`), calendar fed by every module, time of day | 4 | 5 | 2 | 4 | 4 | 5 | **78** | Next |
| `CD16` | Safety incident report (a request kind with its own desk and register) | 3 | 3 | 4 | 4 | 5 | 5 | **77** | Next |
| `CD10` | Meeting schedule for ordinary meetings; find a time; room in one step | 4 | 4 | 2 | 4 | 4 | 5 | **75** | Next |
| `CD11` | Substitute rule: no item waits on an absent person | 4 | 3 | 4 | 5 | 3 | 3 | **75** | Next |
| `CD9` | Forms, rules and templates shelf | 3 | 4 | 4 | 4 | 4 | 3 | **73** | Next |
| `CD12` | Joining and leaving checklists; no-dues clearance | 3 | 4 | 5 | 4 | 3 | 3 | **73** | Next |
| `CD7` | Notifications by e-mail; daily and weekly digest; per-person settings | 4 | 4 | 2 | 4 | 4 | 3 | **72** | Next |
| `CD5` | People today: away, acting, directory card | 4 | 4 | 3 | 4 | 3 | 2 | **70** | Next |
| `CD14` | Every record prints as its official form (number, signature, verify code) | 3 | 3 | 4 | 4 | 4 | 3 | **70** | Next |
| `CD13` | Hindi and English | 3 | 3 | 5 | 4 | 2 | 3 | **67** | Later |
| `CD15` | Bookings beyond rooms and instruments: vehicle, guest house | 3 | 4 | 2 | 3 | 4 | 4 | **65** | Later |
| `CD17` | Visitor entry and gate pass | 2 | 3 | 2 | 3 | 4 | 4 | **57** | Later |

**Read low scores with care.** `CD13` scores low on feasibility, not on need: a government
office must work in Hindi and English. It is `Later` because translating every screen is
large; §5.11 gives a cheap first step.

**Not built, by decision.** Chat (people have e-mail and messaging; large build, small
gain). Attendance (eHRMS and the biometric system own it). A second task manager (the role
half and `/work` are the task list).

---

## 5. Item details

### 5.1 `CD0` — the shell

`src/components/home/CommonDesk.tsx` (the right column) and one small component per block
in `src/components/home/common/`. `Dashboard.tsx` renders `<RoleView/>` beside
`<CommonDesk/>`. Data through `HomeContext` (`SH1`), loaded on demand, not at login.
Claimed-key set for rule 2. The top bar's "Raise a request" replaces the scattered
"new ticket" entry points; the old routes stay and redirect.
**Done when:** all six role views render with the same column; a block with no rows is
absent from the DOM; an item shown on the left is not on the right (unit test on the
claimed-key filter).

### 5.2 `CD1` — My day

`my_day()` unions: `calendar_events`, `holidays`, committee `meetings`, ordinary meetings
(`CD10`), `project_review_slots`, report due dates (`my_report_timers()`, `SH2`), PMS
deadlines, bookings (`TS2`, rooms), own leave, contract end, priorities' wanted-by dates.
New migration adds `starts_at timestamptz` / `ends_at` to `calendar_events` (nullable;
`event_date` stays). The `/calendar` page reads the same function, so the page and the
block cannot disagree. Export: a personal `.ics` link with a revocable token
(`calendar_tokens`), read-only, so the day shows on a phone's own calendar.
**Done when:** a review slot, a committee meeting and a holiday appear with no one adding
them to the calendar by hand; revoking the token kills the link.

### 5.3 `CD2` — My requests

`my_requests()` unions everything "I asked for": tickets, leave requests (`PJ2`), letter
requests (`PJ3`), bookings, hiring requests, contribution requests I raised, proposals and
reports I submitted, priorities I pushed back, indents and bills (from `SH6` imports).
Each row names the **holder** (a person or a desk) and the days there.
`request_norms(kind, norm_days)` — a settings table the institute edits. "Remind" is
offered only after the norm, sends one notification, and can be used once per 3 working
days. A request past twice its norm is tagged "late" and feeds the head's and Director's
"stuck" lines. Nothing here ranks people; a desk is named, not an officer, when the holder
is an office.
**Done when:** every kind a person can ask for in SURYA appears; the holder shown equals
the module's own state (one test per kind).

### 5.4 `CD3` — Raise a request

`request_catalog(key, label, label_hi, group, desk, norm_days, form_schema jsonb,
handler)` — `handler` is `'ticket'` (default) or the name of a module flow (`'leave'`,
`'letter'`, `'booking'`, `'hiring'`). The door shows the catalogue as a searchable list
with the six most-used kinds for the person's role first. A ticket-handled kind creates a
`tickets` row; a new migration adds `tickets.request_key` and keeps the 8-value `category`
for routing (the catalogue maps each key to a category, so `helpdesk_routing` still works).
A **complaint** is a kind with two special rules: it may be marked confidential (readable
only by the grievance desk — the same RLS rule as the student's private route, `ST4`), and
it cannot be routed to the person it names.
**Done when:** a new request kind is added by one catalogue row, with no code change; a
confidential complaint is unreadable by the named person and their reporting line (DB test).

### 5.5 `CD4` — Notices and office orders

```
notices        id, notice_no (unique), kind ('OFFICE_ORDER','CIRCULAR','NOTICE','EVENT'),
               title, body, issued_by, issued_on, audience jsonb, must_ack boolean,
               ack_by date, valid_to date, document_id, supersedes
notice_reads   notice_id, user_id, read_at, acked_at
```
`audience` = all / divisions / roles / named people. RLS follows the audience. Writers: a
new desk permission (Administration), heads for their division, the Director. Issued
through `notice_issue(...)`, which also writes one notification per reader. The issuer
sees "read by 118 of 142" and, for `must_ack`, the list of who has not — this one list of
names is allowed because acknowledging an order is a duty. The Director's delegation
order (`DH2`) and committee constitution orders (`CM0`) are issued as notices, so there is
one register of orders. Each notice goes to the RAG ingest queue (`documents` registry) so
Ask SURYA can answer "what did the circular on tour claims say".
**Done when:** a division notice is invisible to other divisions; superseding an order
marks the old one; a `must_ack` notice past its date shows in the reader's "Do next".

### 5.6 `CD5` — People today

`staff_away(staff_id, from_on, to_on, kind 'LEAVE'|'TOUR'|'TRAINING', source)` filled from:
the eHRMS leave export (`SH6` pipeline), `project_staff_leave`, approved tour requests.
The block shows names and "back on" dates only — **never the kind of leave**. Acting
charges from `acting_assignments`. A directory card: room, extension, e-mail, division,
charge held, "ask me about" (top profile topics, enterprise P2/P6).
**Needs the eHRMS file.** Until then the block shows project staff and acting charges and
says "permanent staff leave not connected yet".
**Done when:** the kind of leave is not selectable by any role other than HR (DB test).

### 5.7 `CD6` — Waiting on me

No new backend. The block is a count and the three oldest rows of `my_decisions()`
(`HH2`), honouring the delegation order (`DH2`). Hidden for people with no rows. For
scientists and heads the role half already shows these; rule 2 then leaves the block as a
one-line count.

### 5.8 `CD7` — Notifications, e-mail and digests

`notification_prefs(user_id, kind, in_app, email, digest 'OFF'|'DAILY'|'WEEKLY')`.
A daily digest at 08:00 on working days (`holidays` respected): my day, what waits on me,
what moved in my requests, new notices. One e-mail, plain text plus simple HTML, each line
a link. Sent by a scheduled job through the institute's mail relay.
**Needs:** an SMTP relay account from the institute's IT section. **Rules:** no personal
or confidential content in the e-mail body — titles and links only; a `critical`
notification may bypass the digest; nothing is ever sent to a non-institute address.
**Done when:** a person with the digest on gets one mail on a working day and none on a
holiday; the mail holds no field marked confidential (test on the renderer).

### 5.9 `CD8` — Letters in and out

The register every office keeps by hand today.

```
correspondence   id, direction ('IN','OUT'), diary_no (unique per year, auto),
                 their_ref, party, party_kind, subject, dated_on, received_on, sent_on,
                 mode ('POST','EMAIL','HAND','EOFFICE'), marked_to, marked_by, due_on,
                 status ('OPEN','REPLIED','FILED','NO_ACTION'), reply_to, document_id,
                 subject_type, subject_id, confidential boolean
correspondence_events  id, correspondence_id, at, actor, kind, note
```
A desk permission (`Diarist`) enters and marks. The marked person sees it under "Letters to
answer", may re-mark it with a note, and replies by creating the `OUT` row linked with
`reply_to`. Outward numbers come from one sequence, so two sections never issue the same
number. Linked to a project, a person, a committee or an outside thread (`HH6`). The
Director's Headquarters items (`hq_items`, `DH5`) and audit / RTI / court items
(`audit_items`, `DH12`) become **views over this table** with a kind — one register, not
three; those two plans are narrowed accordingly when built.
**Done when:** an inward letter can be followed from receipt to reply in one screen; a
confidential letter is readable only by the marked chain.

### 5.10 `CD9` — Forms, rules and templates shelf

`shelf_items(id, kind 'FORM'|'RULE'|'TEMPLATE'|'GUIDE', title, title_hi, owner_desk,
document_id, valid_from, superseded_by, request_key)`. A form that SURYA handles links to
its request kind ("do this online") instead of offering a download. Every item is indexed
for Ask SURYA. An owner desk reviews each item yearly; an item past review is tagged
"check date". **Needs:** the offices to supply current forms.

### 5.11 `CD10`–`CD17` in brief

| ID | Contents | Notes |
|---|---|---|
| `CD10` | `meetings_general(id, title, organiser, starts_at, ends_at, room_id, link, agenda, notes)` + invitees with reply (yes / no / maybe); "find a time" over `my_day()` of the invitees (free / busy only, never titles); room in the same step. Notes may hold action items that reuse `action_items` | The committee module keeps formal meetings. A general meeting can be promoted to none of that — it stays light |
| `CD11` | `delegates(user_id, delegate_user_id, from_on, to_on, scope)`; when a person is in `staff_away` and has a delegate, `my_decisions()` shows their rows to the delegate, tagged "for <name>"; without a delegate, rows older than 2 working days go to the reporting officer. Heads and the Director use `acting_assignments` as today | The decision is recorded as made by the delegate, for the principal. Confidential kinds never delegate |
| `CD12` | `checklists(kind 'JOINING'|'LEAVING'|'TRANSFER')`, steps per desk; **no-dues clearance**: each desk (library, stores, hostel, accounts, IT, the division's instruments) confirms in one click; the person sees who is left; the final certificate uses the letter engine (`PJ3`) | Covers permanent staff, project staff and students. Feeds the hand-over note |
| `CD13` | Step 1 (cheap): `label_hi` on catalogue, notices, shelf, letter templates; bilingual printed letters and orders. Step 2 (large): screen text through a message table | Step 1 only is planned here |
| `CD14` | One print layout per record kind built with `@react-pdf/renderer`: letterhead, record number, signatures, `/verify/:code`. Starts with notices, letters, certificates, minutes | Shares the hash-chain of the committee module's signatures |
| `CD15` | The committee plan's `rooms` / `room_bookings` gain a `kind` (`ROOM`, `VEHICLE`, `GUEST_HOUSE`) rather than new tables; one booking page | Change to be made in the committee plan when `CM1` is written |
| `CD16` | Request kind `safety`: who, where, what, photo; goes to the Safety Officer desk at once and to the head; a register with closure and lesson; emergency contacts card in People | Small. An incident on an instrument opens an `equipment_faults` row (`TS3`) |
| `CD17` | `visitors(id, name, org, host_staff_id, purpose, expected_at, in_at, out_at)`; host pre-registers; the gate sees today's list | Only if Security wants it |

---

## 6. Phases

Effort as in the roadmap (`S` half a day · `M` 1–2 days · `L` 3+ days · `XL` multi-week).

| Phase | Items | Effort | Needs | Done when |
|---|---|---|---|---|
| **A — the desk on today's data** | `CD0`; `CD1` with today's sources; `CD3` door over `tickets` + `request_catalog`; `CD2` over tickets, proposals, reports, contribution requests; bell as is | L | `SH1` (`HomeContext`) | Every role sees the same right column; a ticket raised from the door appears in My requests with its holder |
| **B — orders and decisions** | `CD4` notices; `CD6` block; `CD10` general meetings | L | `HH2` for `CD6` | The first office order is issued, read and acknowledged in the app |
| **C — the registers** | `CD8` letters; `CD9` shelf; `CD16` safety; `CD14` print for notices and letters | L | A `Diarist` desk account; forms from offices | One month of inward letters is diarised in SURYA only |
| **D — nobody waits on an absent person** | `CD5` people today; `CD11` substitutes; `CD7` e-mail digest | L | eHRMS export; SMTP relay | A decision row moves to the delegate the morning the principal is away |
| **E — the long tail** | `CD12` checklists and no-dues; `CD13` step 1; `CD15`; `CD17` | M each | Offices' step lists | A leaving person's no-dues completes without a paper form |

**Order.** A → B → C are free of outside dependencies and go first. D waits on two things
from the institute. E in any order, on demand.

**Each new module after this plan owes four things** (add to the PR checklist in
`docs/engineering/development_guide.md`): its rows in `my_day()`, `my_requests()`,
`my_decisions()`; its notification kinds; a catalogue row if a person can ask for it.

### Verification, every phase

- `npm run build`, `npm run lint`, `npm test`, `python scripts/check_security_definer.py`.
- `scripts/db/commonDesk.db.test.ts`: each feed returns only the caller's rows, as each
  role; notice audience; confidential complaint and letter; leave kind hidden; delegate
  routing; diary numbers unique under concurrent inserts.
- Unit tests: claimed-key filter, hide-when-empty, digest renderer.
- Checked in the running app as each of the six roles and as `DefaultUser`; desktop,
  1024 px and phone; light and dark.

---

## 7. Open questions

| # | Question | Default if unanswered |
|---|---|---|
| 1 | Who may issue an institute-wide notice | Director, Administration desk; heads for their division |
| 2 | Is the list of who has not acknowledged an order visible to the issuer | Yes, for `must_ack` orders only |
| 3 | Who is the grievance desk for confidential complaints | The existing grievance / internal committee; never the reporting line |
| 4 | Normal days per request kind | From `helpdesk_routing` where set; else 5 working days; the institute edits |
| 5 | May SURYA send e-mail, and through which relay | Yes, institute relay, titles and links only |
| 6 | Does the institute use eOffice for files and letters | If yes, `CD8` records the eOffice number and does not duplicate the file; if no, `CD8` is the register |
| 7 | Who keeps the diary register | Central diary for the Director's office; each section for its own |
| 8 | May a person see colleagues' free / busy time | Yes, free / busy only, institute-wide |
| 9 | May a non-head name a delegate | Yes, with the reporting officer's approval, for at most 30 days |
| 10 | Hindi: which printed outputs are required in both languages | Office orders, notices, certificates, letters to government bodies |
| 11 | Right column: open or collapsed by default | Open on desktop, below the role half on small screens |

---

## 8. Out of scope

- Chat, attendance, a second task manager (see §4).
- Replacing eHRMS, CPS, AMS or eOffice. The desk reads from them and links to them.
- Translating every screen (only `CD13` step 1).
- Any block that ranks or compares people.
