# Access matrix — who sees which feature

Source of truth: `ACCESS_MAP` in `src/constants/access.ts`. This table is generated from it
(see "Regenerate" below); if they disagree, the code is right and this file is stale.

## Rules

1. **Least privilege.** Each role lists only the pages its job needs.
2. **Extra = a grant.** MasterAdmin can open one more feature for one user at
   `/admin/features` → *Extra features for one user* (`feature_grants` table,
   migration `20261020000003_feature_grants.sql`). A grant follows the person, whatever
   role they are acting as.
3. **Switches still apply.** `feature_controls` can switch a feature off for everyone or per
   role. A grant beats a per-role switch (it names the person) but not a global switch-off.
   MasterAdmin ignores switches.
4. **Pages, not rows.** All of this decides which pages show. Row-level security on the data
   is unchanged: a granted page shows only rows the user's role may already read (for
   example, a Scientist granted Human Capital sees only their own staff row).
5. **One check everywhere.** Sidebar, route guards, the search palette, My Actions chips,
   data loading and the SystemAdmin dashboard all call `canAccess(path)` from
   `FeatureControlContext` → `featureAccessible()` in `src/lib/access/featureControls.ts`.
6. **Detail & role-home routes:** Detail pages (`/staff/:id`, `/projects/:id`,
   `/facilities/:uInsID`) require a verified role (not Guest / DefaultUser); RLS scopes
   the row. Role dashboard aliases (such as `/pme` via `ROLE_ROUTES.PME` for `PME`)
   render the home dashboard covered by `/` in `ACCESS_MAP`. Login, setup and
   change-password are the only unguarded routes — `src/constants/access.test.ts` fails
   if another appears.

## Role profiles

| Role | Profile | Keeps |
|---|---|---|
| Director | Institute head | All institute analytics, HR views, research ops, PMS |
| DivisionHead / HOD | Division manager | Same set as Director; RLS limits rows to their division |
| Scientist | Researcher | Own PMS, projects, proposals, progress reports, PhD supervisees, committees |
| Technician | Instrument operator | Instruments, publication files, committees, lessons learned, helpdesk |
| HRAdmin | HR office | Staff, sanctioned posts, workforce planning, recruitment, data, PMS/AWP administration, proposal/report review |
| FinanceAdmin | Finance office | Projects, proposals, partnerships, portfolio, lessons learned, R&D monitor |
| SystemAdmin | Platform operator | Accounts, access requests, data imports, people links, IRINS sync, RAG, holidays |
| MasterAdmin | Superuser | Every feature (48 of 48), whatever the switches; Feature Controls & CSIR Rules |
| Student / ProjectStaff | Scholar / project hire | Own dashboard, Ask SURYA, My Work, calendar, helpdesk |
| EmpoweredCommittee | PMS final scoring | PMS + committee queue, My Work, My Profile |
| PME | Project monitoring office | Dashboard (`/pme`), Projects, Proposals, Progress Reports, Project Staff, Expertise Finder, Partnerships, R&D Monitor, Project Portfolio, Lessons Learned, Committees. Not an admin: no HR, appraisal or account pages |
| Guest / DefaultUser | Not yet approved | Dashboard (pending view) and helpdesk only |

## Matrix

● = role has it by default · = MasterAdmin grant needed

> **Note on `MasterAdmin`:** In raw `ACCESS_MAP` arrays, `MasterAdmin` is omitted from 4 author/committee-specific entries (`/reports/new`, `/pms/reports/new`, `/pms/committee`, `/pms/awp`), so `scripts/access_matrix.mts` prints `·` on those rows. At runtime, `featureAccessible()` grants `MasterAdmin` access to all **48 of 48** `ACCESS_MAP` routes (matching [role_features.md](role_features.md)).

| Feature | Path | Dir | DivH | HOD | Sci | Tech | HR | Fin | Sys | Mstr | Stu | PStf | Gst | Pend | EC | PME |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Dashboard | `/` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Ask SURYA | `/ask` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | · | · | ● | ● |
| My Work | `/work` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | · | · | ● | ● |
| My Profile | `/me` | ● | ● | ● | ● | ● | ● | ● | ● | ● | · | · | · | · | ● | ● |
| Calendar | `/calendar` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | · | · | ● | ● |
| Intelligence | `/intelligence` | ● | ● | ● | · | · | · | · | · | ● | · | · | · | · | · | · |
| Explore Graph | `/explore` | ● | ● | ● | · | · | · | · | · | ● | · | · | · | · | · | · |
| Human Capital | `/staff` | ● | ● | ● | · | · | ● | · | · | ● | · | · | · | · | · | · |
| Staff Analytics | `/staff/analytics` | ● | ● | ● | · | · | ● | · | · | ● | · | · | · | · | · | · |
| Project Staff | `/staff/project` | ● | ● | ● | · | · | ● | · | · | ● | · | · | · | · | · | ● |
| Sanctioned Posts | `/staff/posts` | ● | ● | ● | · | · | ● | · | · | ● | · | · | · | · | · | · |
| Workforce Planning | `/staff/planning` | ● | ● | ● | · | · | ● | · | · | ● | · | · | · | · | · | · |
| Expertise Finder | `/expertise` | ● | ● | ● | · | · | ● | · | · | ● | · | · | · | · | · | ● |
| Publication Files | `/publication-files` | ● | ● | ● | ● | ● | · | · | · | ● | · | · | · | · | · | · |
| Acting Charges | `/admin/acting` | ● | · | · | · | · | ● | · | · | ● | · | · | · | · | · | · |
| PhD Tracker | `/phd` | ● | ● | ● | ● | · | · | · | · | ● | · | · | · | · | · | · |
| Divisions | `/divisions` | ● | ● | ● | · | · | · | · | · | ● | · | · | · | · | · | · |
| Recruitment | `/recruitment` | · | · | · | · | · | ● | · | · | ● | · | · | · | · | · | · |
| Projects | `/projects` | ● | ● | ● | ● | · | · | ● | · | ● | · | · | · | · | · | ● |
| Proposals | `/proposals` | ● | ● | ● | ● | · | ● | ● | · | ● | · | · | · | · | · | ● |
| Progress Reports | `/reports` | ● | ● | ● | ● | · | ● | · | · | ● | · | · | · | · | · | ● |
| Progress Report Authoring | `/reports/new` | ● | ● | ● | ● | · | · | · | · | · | · | · | · | · | · | · |
| Instruments | `/facilities` | ● | ● | ● | · | ● | · | · | · | ● | · | · | · | · | · | · |
| Partnerships | `/partnerships` | ● | ● | ● | · | · | · | ● | · | ● | · | · | · | · | · | ● |
| R&D Monitor | `/rnd-monitor` | ● | ● | ● | · | · | · | ● | · | ● | · | · | · | · | · | ● |
| Project Portfolio | `/portfolio` | ● | ● | ● | · | · | · | ● | · | ● | · | · | · | · | · | ● |
| Lessons Learned | `/lessons` | ● | ● | ● | ● | ● | · | ● | · | ● | · | · | · | · | · | ● |
| Committees | `/committees` | ● | ● | ● | ● | ● | ● | ● | ● | ● | · | · | · | · | ● | ● |
| Helpdesk | `/helpdesk` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Performance Mgmt | `/pms` | ● | ● | ● | ● | · | ● | · | · | ● | · | · | · | · | ● | · |
| PMS Cycles | `/pms/cycles` | · | · | · | · | · | ● | · | · | ● | · | · | · | · | · | · |
| PMS Evaluation Committees | `/pms/evaluation-committees` | · | · | · | · | · | ● | · | · | ● | · | · | · | · | · | · |
| PMS Report Authoring | `/pms/reports/new` | ● | ● | ● | ● | · | · | · | · | · | · | · | · | · | · | · |
| PMS Evaluator Assignment | `/pms/assign` | · | · | · | · | · | ● | · | · | ● | · | · | · | · | · | · |
| PMS Committee Queue | `/pms/committee` | · | · | · | · | · | · | · | · | · | · | · | · | · | ● | · |
| PMS Audit Log | `/pms/audit` | · | · | · | · | · | ● | · | · | ● | · | · | · | · | · | · |
| My Annual Work Plan | `/pms/awp` | ● | ● | ● | ● | · | · | · | · | · | · | · | · | · | · | · |
| AWP Inbox | `/pms/awp/inbox` | ● | ● | ● | ● | · | ● | · | · | ● | · | · | · | · | · | · |
| AWP Import | `/pms/awp/import` | · | · | · | · | · | ● | · | · | ● | · | · | · | · | · | · |
| AWP Register | `/pms/awp/register` | ● | · | · | · | · | ● | · | · | ● | · | · | · | · | · | · |
| Access Requests | `/admin/access-requests` | · | · | · | · | · | · | · | ● | ● | · | · | · | · | · | · |
| Feature Controls | `/admin/features` | · | · | · | · | · | · | · | · | ● | · | · | · | · | · | · |
| Data Management | `/data` | · | · | · | · | · | ● | · | ● | ● | · | · | · | · | · | · |
| People Links | `/data/links` | ● | · | · | · | · | ● | · | ● | ● | · | · | · | · | · | · |
| CSIR Rules | `/admin/rules` | · | · | · | · | · | · | · | · | ● | · | · | · | · | · | · |
| IRINS Sync | `/irins-sync` | · | · | · | · | · | · | · | ● | ● | · | · | · | · | · | · |
| RAG Ingestion | `/admin/rag` | · | · | · | · | · | · | · | ● | ● | · | · | · | · | · | · |
| Holidays | `/admin/holidays` | · | · | · | · | · | · | · | ● | ● | · | · | · | · | · | · |

## What changed on 2026-10-20

| Role | Removed (grantable) | Why |
|---|---|---|
| Scientist | Intelligence, Explore Graph, Partnerships, R&D Monitor | Institute-level analytics, not a researcher's own work |
| SystemAdmin | Every HR, PMS, research and analytics page | Platform operator, not a business role |
| Student, ProjectStaff | Committees | Not committee staff |
| Guest, DefaultUser | Calendar, Committees | Not yet approved |

Also fixed: PMS sub-pages (`/pms/reports`, `/pms/evaluate`, `/pms/grievance`), proposal
detail/edit and meeting detail had a feature key but **no role check** — any signed-in role
could open them by URL. Every route with an `accessPath` now checks role + grant + switches.

## What changed on 2026-11-10 / 11

`/portfolio` (Project Portfolio) added for Director, Division Head, HOD, FinanceAdmin, PME and
MasterAdmin; the view behind it is row-scoped by RLS, so a division manager sees their division.


| Role | Added | Why |
|---|---|---|
| PME (new) | Projects, Proposals, Progress Reports, Project Staff, Partnerships, R&D Monitor, Project Portfolio | Carries a project file from submission to archive — `docs/roadmap/sources/PROJECT-LIFECYCLE-PLAN.md` §4 |

A `DRAFT` proposal is no longer readable by Director, division managers or admins: RLS
(`proposals_can_read`, 20261110000002) limits it to its PI and named co-PIs.

## What changed on 2026-11-12 / 13 (Enterprise P1–P9 & PL6)

Nine feature paths were added to `ACCESS_MAP` (bringing the total to **48**):

| Path | Who | Purpose |
|---|---|---|
| `/me` | Approved staff (`STAFF`) | Self-service research profile redirect (`/staff/:id`) |
| `/lessons` | Director, DivisionHead, HOD, Scientist, Technician, FinanceAdmin, PME, MasterAdmin | Institute-wide searchable lessons learned from completed projects |
| `/admin/rules` | MasterAdmin | Versioned, effective-dated CSIR institutional rules engine |
| `/data/links` | Director, HRAdmin, SystemAdmin, MasterAdmin | Author/inventor/PI/supervisor/login identity link resolution |
| `/staff/posts` | Director, DivisionHead, HOD, HRAdmin, MasterAdmin | Sanctioned posts register (`desktopOnly`) |
| `/staff/planning` | Director, DivisionHead, HOD, HRAdmin, MasterAdmin | Retirement wave, vacancy & workload planning |
| `/expertise` | Director, DivisionHead, HOD, HRAdmin, PME, MasterAdmin | Expertise finder & vocabulary curation |
| `/publication-files` | Director, DivisionHead, HOD, Scientist, Technician, MasterAdmin | Manuscript ethics/similarity clearance & co-author consent |
| `/admin/acting` | Director, HRAdmin, MasterAdmin | Dated acting-charge assignments (`HOD`, `DivisionHead`, `Director`) |

## Regenerate the matrix

```bash
node --experimental-strip-types scripts/access_matrix.mts
```
