# Scientist Home — Implementation Plan

_Proposal, 2026-11-12. Item IDs `SH1`–`SH6`. Indexed from [`../ROADMAP.md`](../ROADMAP.md).
Delivers roadmap `WP-5 E` (role-first home) and `DESIGN.md` risk `R5` (sentence-first
greeting) for the Scientist role. Screen agreed with the owner on 2026-11-12._

**Goal.** One screen a scientist opens each morning that answers, in order: what did my
seniors ask for first, what needs me, what is ready for me, how are my projects, who is
holding my work. Every pending item can be acted on from this screen.

**The complaint it answers.** Scientists say they spend their time on follow-up — bills,
purchase, hiring, compliance reports — and that work arrives in a last-minute rush. So the
screen (a) puts the system, not the scientist, in charge of chasing, (b) offers drafts
before deadlines instead of reminders at them, and (c) shows plainly who is late.

---

## 1. The screen

```
┌ (ring 2/9)  Good morning, Dr. Rao. Seven things are left today. Two come first …        ┐
│ [ Ask or search ………………………………………… ]   [New idea]  [Raise a request]                      │
├ DO FIRST · asked by your seniors                                             2 of 3 ────┤
│  (MK) Send the fund statement for HCP0054   [by Fri 13 Nov]   [Open] [Seen it] [✕date]   │
│       "The monitoring committee meets on Monday…"  · HoD · asked yesterday               │
├ Then, your regular work:  Send the progress report … [Open draft] [Tomorrow] ───────────┤
├ QUICK WINS · clear all in 5 minutes      │ THIS WEEK  M T W [T] F S S · tasks by type ───┤
├ REPORT TIMERS   (6) HCP0054   (18) Self-appraisal   (28) MLP-112   (−4) GAP-207 ────────┤
├ COMMITTEES COMING UP                     │ COMMITTEE TASKS ON ME ────────────────────────┤
├ MY PROJECTS · milestones   ●──●──◐──○──○──○                                             ┤
├ WAITING IN OFFICES · followed for you    │ MY TEAM ──────────────────────────────────────┤
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

| # | Block | Shows | Actions from the block |
|---|---|---|---|
| 1 | Today ring and greeting | Done today against total; one composed sentence (Fraunces); a quiet on-time record | — |
| 2 | Ask and start | Ask SURYA / record search | New idea · Raise a request |
| 3 | **Do first** | Up to three priorities pinned by a senior: who, their one-line reason, wanted-by date, linked task | Open · Seen it · Cannot by then (reason + new date) · Post update · Mark done |
| 4 | Then, your regular work | The single next item, with a time estimate and the honest consequence of delay | Open · Tomorrow |
| 5 | Quick wins | Items of two minutes or less | Sign · Approve · Certify, in place |
| 6 | This week | Seven days with dots (deadline, task, meeting); tasks by type, research against administration | Click a day |
| 7 | Report timers | One countdown ring per pending report; draft state; "N lines left" | Open draft |
| 8 | Committees coming up | Date, time, room, my seat, what I still owe | Read agenda · Declare · Reply |
| 9 | Committee tasks on me | Open tasks, overdue first; closed this quarter | Update · Sign |
| 10 | My projects | A milestone track per project; one status tag | Add proof · Open file |
| 11 | Waiting in offices | Purchase, hiring and bills as stages, with days at the present holder | Details · hand over follow-up |
| 12 | My team | Project staff and students with what is due | Extend · Schedule |

**Layout rules**

- The order above is fixed. Action blocks (3–5, 7) are above status blocks (10–12).
- **One strong button on the screen.** It belongs to the first priority; with no priority,
  to the regular-work card (`DESIGN.md`: terracotta is ceremonial).
- The amber border is used once, on block 3. With no open priority, block 3 is not rendered.
- Red is used only for what the scientist can fix. A delay in an office is tagged with the
  office's name and its days, not shown as the scientist's overdue item.
- Phone: blocks 1, 3, 4, 5 and 7 only, stacked. The rest sit behind "More".
- Rings and dots always carry a number or a word; colour is never the only signal.

---

## 2. Nudges

| Nudge | Rule |
|---|---|
| Do this next | One item. Ranking: open priorities by wanted-by date → overdue items → soonest due; ties go to the shorter estimate |
| Quick wins | An item qualifies when its kind's estimate is ≤ 2 minutes and it can be completed with one confirmation |
| Left to finish | A draft shows what remains ("2 lines left"), not only its due date |
| Honest consequence | The card states what happens on which day, taken from the escalation ladder below. Nothing happens that the card did not say |
| Quiet record | "11 of 12 reports sent on time this year"; "6 closed this quarter". A count of the person's own record |
| Others are ready | "4 of 6 have read the agenda" — a count, never names |
| Tomorrow | Hides an item until the next working day. Not offered on or after the due date, and not on a priority |
| Seen it | The senior sees the time the priority was seen. No reply is needed |

**Escalation ladder (default; question 2).** Draft offered 30 days before a report is due ·
reminder 7 days before · reminder 2 days before · on the due date · **7 days overdue: the
HoD is told.**

**Not used, by decision.** Points, badges, ranking lists. Names of colleagues who are late.
Pop-up windows. Sound.

---

## 3. What exists today (checked 2026-11-12)

| Block | Data today | Gap |
|---|---|---|
| 1, 4, 5, 6 | `deriveMyActions` (`src/lib/dashboard/myActions.ts`) already yields typed items with due dates and links: PMS, proposals, progress reports, project reviews, changes, closure, action items, tickets, contract ends, contribution requests. `MyActions` renders them as one list above `ScientistView` | No grouping, no ranking, no estimates, no "done today" |
| 3 | Nothing. `contribution_requests` is close in shape but its `domain` is limited to seven data domains and its states are about fixing a record | New small table (§4) |
| 7 | Due dates exist: `project_review_slots` (`kind = 'PROGRESS_REPORT'`, `due_date`), PMS cycle deadlines (`src/lib/pms/deadlines.ts`), `pms_awps`, completion reports. Pre-filled appraisal items exist (`pms_report_items`, other session) | No single list of "my pending reports"; progress-report draft not pre-filled |
| 8, 9 | `meetings`, `committee_members`, `action_items`; `deriveOwnMeetings`, `deriveOwnActionItems` | Time, room, "agenda read", declaration, sign — arrive with the committee module `CM1`–`CM5`. `deriveOwnActionItems` matches the assignee **by name**; it must match by staff ID |
| 10 | `project_milestones` (status `PROPOSED / PLANNED / REPORTED / ACHIEVED / DROPPED`), funds, portfolio reading | Not shown on the home page |
| 11 | Nothing for purchase and bills (they live in CPS and AMS). Nothing for hiring (no software exists) | `SH6`; hiring comes with `EH3` |
| 12 | Contract-end items exist; PhD milestones exist | "Extend" has no flow until `EH3` |

`ScientistView.tsx` finds the scientist's staff row by e-mail. Use `caller_staff_id()` /
the linked staff row instead.

---

## 4. Priorities — data model and rules

New table `work_priorities`: `id`, `assignee_user_id`, `asked_by`, `title`,
`reason` (required), `wanted_by date`, `link` (relative app path, same check as
`contribution_requests.link`), `subject_type`, `subject_id`, `status`
(`OPEN`, `DONE`, `WITHDRAWN`), `seen_at`, `pushback_reason`, `pushback_date`, `pushback_at`,
`pushback_answer` (`ACCEPTED`, `KEPT`), `done_at`, `created_at`. RLS: the assignee and the
asker read a row; nobody writes directly.

| RPC | Who | Does |
|---|---|---|
| `priority_pin(p_assignee uuid, p_title text, p_reason text, p_wanted_by date, p_link text, p_subject_type text, p_subject_id text)` | A permitted senior | Creates; notifies the assignee |
| `priority_seen(p_id uuid)` | Assignee | Sets `seen_at`; the asker can see it |
| `priority_push_back(p_id uuid, p_reason text, p_new_date date)` | Assignee | Records it; notifies the asker |
| `priority_answer(p_id uuid, p_accept boolean)` | Asker | `ACCEPTED` moves `wanted_by`; `KEPT` leaves it; notifies the assignee |
| `priority_done(p_id uuid)` | Assignee | Closes; notifies the asker |
| `priority_withdraw(p_id uuid)` | Asker | Closes |

**Rules, enforced in the RPC**

1. **Who may pin.** The HoD or Division Head of the assignee's division; the assignee's
   reporting officer (`staff."ReportingID"`); the PI of a project on which the assignee is
   co-PI or engaged staff; the Director. Nobody pins for themselves.
2. **At most three `OPEN` priorities per person.** The fourth is refused with
   `'<Name> already holds 3 priorities. Withdraw one first.'`
3. **A reason is required** (at least 10 characters).
4. **Clash.** When a new priority has the same `wanted_by` as another open one for the same
   person from a different asker, both askers are notified. The app does not order them.
5. A priority has no "Tomorrow". It leaves the block only by done, withdrawn, or an accepted
   new date.

**The senior's side.** "Pin as priority" on a person's profile page and on any task row the
senior can see; a "Priorities I asked" list showing seen / pushed back / done.

---

## 5. Phases

Effort as in the roadmap (`S` half a day · `M` 1–2 days · `L` 3+ days · `XL` multi-week).

| ID | Phase | Contents | Effort | Needs | Done when |
|---|---|---|---|---|---|
| `SH1` | The screen on today's data | New `ScientistView`: greeting sentence, today ring, regular-work card, quick wins, week strip, committees and committee tasks (as far as today's data goes), project milestone tracks, team. `src/lib/home/`: `classify.ts` (kind → group `research` / `admin` / `committee`, minutes estimate), `doNext.ts` (ranking), `today.ts` (done-today count), `greeting.ts`. `MyActions` is not rendered above this view. Staff matched by ID, not name or e-mail | L | — | A scientist with no priorities sees one next item with the strong button; closing a quick win moves the ring; an account with no linked staff row gets a plain fallback sentence, not an error |
| `SH2` | Report timers | `my_report_timers() RETURNS TABLE(kind, subject, due_date, state, draft_ready, lines_left, link)` — invoker — over progress-report slots, the self-appraisal, the work plan and completion reports. Ring = share of a 30-day window used. Overdue shows a negative number | M | — | A report nobody started shows on the ring with the right days; the same function answers "which of my reports are due" in Ask SURYA |
| `SH3` | Priorities | §4: table, six RPCs, the Do-first block, the senior's pin form and list, notifications | L | — | The four rules each have a DB test; a pushed-back priority shows its new date only after the asker accepts |
| `SH4` | Nudges | Consequence lines from the escalation ladder, enforced by the server sweep; on-time record (`my_on_time_record()`); Tomorrow (`home_snoozes(user_id, item_key, until)`); HoD told at 7 days overdue | M | `SH2` | No consequence line names an event that the sweep does not perform (one table-driven test covers both) |
| `SH5` | Blocks that wait on other work | Drafts "ready for you" as each source lands; committee time, room, agenda-read, declaration and sign; hiring line and "Extend" | M, in pieces | `CM1`–`CM5`; enterprise P5 (`EH3`), P7 (`EV8`) | Each block shows its real action the day its source ships, and a plain "not connected yet" line until then |
| `SH6` | Office tracker and administrative tasks | Import of CPS (indents), AMS (bills) and eHRMS (leave to approve) exports, joined to projects; days at the present holder; hand-over of follow-up; stuck items offered to the Lab Strategic Group agenda | L–XL | **Sample export files with a project number on each row** | An indent raised in CPS appears on the scientist's screen with its present stage and days, with nobody typing it into SURYA |

**Order.** `SH1` first; it changes no data and can ship at once. `SH2` and `SH3` are
independent of each other. `SH4` after `SH2`. `SH5` follows other plans. `SH6` waits on the
files.

**Not loaded at login.** The home screen reads through a `HomeContext` on demand
(the pattern `ProfileContext` uses), so it does not add to the tables `DataContext` loads
for every role.

### Verification, every phase

- `npm run build`, `npm run lint`, `npm test`, `python scripts/check_security_definer.py`.
- Unit tests for `src/lib/home/*` (ranking, grouping, greeting, done-today) — pure functions.
- `scripts/db/home.db.test.ts` for `SH2`–`SH4`.
- Checked in the running app at desktop and phone width, light and dark.
- UI follows `DESIGN.md`: Fraunces sentence, IBM Plex Mono for codes, dates and counts,
  semantic tokens only.

---

## 6. Open questions

| # | Question | Default if unanswered |
|---|---|---|
| 1 | Two seniors pin for the same day | Show both; tell both seniors |
| 2 | Who is told when a report is overdue, and when | The HoD, at 7 days |
| 3 | How many priorities may one person hold | 3 |
| 4 | Who may pin | §4 rule 1 |
| 5 | Where do time estimates come from | A fixed table per task kind in `classify.ts`; revised from real completion times later |
| 6 | Is "tasks by type" worth showing when it counts tasks, not hours | Yes, labelled "by type" |
| 7 | Does the HoD see a scientist's home screen | No. The HoD sees priorities they asked and the overdue notices only |

---

## 7. Out of scope

- Home screens for PhD students, project staff and technical staff. The blocks and
  `src/lib/home/` are written to be reused; each role gets its own plan.
- Replacing CPS, AMS or eHRMS. `SH6` reads their exports.
- Measuring hours worked.
- Any ranking of people.
