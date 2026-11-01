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
6. **Detail pages** (`/staff/:id`, `/projects/:id`, `/facilities/:uInsID`) need a verified
   role (not Guest / DefaultUser); RLS scopes the row. Login, setup and change-password are
   the only unguarded routes — `src/constants/access.test.ts` fails if another appears.

## Role profiles

| Role | Profile | Keeps |
|---|---|---|
| Director | Institute head | All institute analytics, HR views, research ops, PMS |
| DivisionHead / HOD | Division manager | Same set as Director; RLS limits rows to their division |
| Scientist | Researcher | Own PMS, projects, proposals, progress reports, PhD supervisees, committees |
| Technician | Instrument operator | Instruments, committees, helpdesk |
| HRAdmin | HR office | Staff, recruitment, data, PMS administration, proposal/report review |
| FinanceAdmin | Finance office | Projects, proposals, partnerships, R&D monitor |
| SystemAdmin | Platform operator | Accounts, access requests, data imports, IRINS sync, RAG, holidays |
| MasterAdmin | Superuser | Every feature (38 of 38), whatever the switches; Feature Controls |
| Student / ProjectStaff | Scholar / project hire | Own dashboard, Ask, calendar, helpdesk |
| EmpoweredCommittee | PMS final scoring | PMS + committee queue |
| Guest / DefaultUser | Not yet approved | Dashboard (pending view) and helpdesk only |

## Matrix

● = role has it by default · = MasterAdmin grant needed

| Feature | Path | Dir | DivH | HOD | Sci | Tech | HR | Fin | Sys | Mstr | Stu | PStf | Gst | Pend | EC |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Dashboard | `/` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Ask SURYA | `/ask` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | · | · | ● |
| My Work | `/work` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | · | · | ● |
| Calendar | `/calendar` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | · | · | ● |
| Intelligence | `/intelligence` | ● | ● | ● | · | · | · | · | · | ● | · | · | · | · | · |
| Explore Graph | `/explore` | ● | ● | ● | · | · | · | · | · | ● | · | · | · | · | · |
| Human Capital | `/staff` | ● | ● | ● | · | · | ● | · | · | ● | · | · | · | · | · |
| Staff Analytics | `/staff/analytics` | ● | ● | ● | · | · | ● | · | · | ● | · | · | · | · | · |
| Project Staff | `/staff/project` | ● | ● | ● | · | · | ● | · | · | ● | · | · | · | · | · |
| PhD Tracker | `/phd` | ● | ● | ● | ● | · | · | · | · | ● | · | · | · | · | · |
| Divisions | `/divisions` | ● | ● | ● | · | · | · | · | · | ● | · | · | · | · | · |
| Recruitment | `/recruitment` | · | · | · | · | · | ● | · | · | ● | · | · | · | · | · |
| Projects | `/projects` | ● | ● | ● | ● | · | · | ● | · | ● | · | · | · | · | · |
| Proposals | `/proposals` | ● | ● | ● | ● | · | ● | ● | · | ● | · | · | · | · | · |
| Progress Reports | `/reports` | ● | ● | ● | ● | · | ● | · | · | ● | · | · | · | · | · |
| Progress Report Authoring | `/reports/new` | ● | ● | ● | ● | · | · | · | · | · | · | · | · | · | · |
| Instruments | `/facilities` | ● | ● | ● | · | ● | · | · | · | ● | · | · | · | · | · |
| Partnerships | `/partnerships` | ● | ● | ● | · | · | · | ● | · | ● | · | · | · | · | · |
| R&D Monitor | `/rnd-monitor` | ● | ● | ● | · | · | · | ● | · | ● | · | · | · | · | · |
| Committees | `/committees` | ● | ● | ● | ● | ● | ● | ● | ● | ● | · | · | · | · | ● |
| Helpdesk | `/helpdesk` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Performance Mgmt | `/pms` | ● | ● | ● | ● | · | ● | · | · | ● | · | · | · | · | ● |
| PMS Cycles | `/pms/cycles` | · | · | · | · | · | ● | · | · | ● | · | · | · | · | · |
| PMS Evaluation Committees | `/pms/evaluation-committees` | · | · | · | · | · | ● | · | · | ● | · | · | · | · | · |
| PMS Report Authoring | `/pms/reports/new` | ● | ● | ● | ● | · | · | · | · | · | · | · | · | · | · |
| PMS Evaluator Assignment | `/pms/assign` | · | · | · | · | · | ● | · | · | ● | · | · | · | · | · |
| PMS Committee Queue | `/pms/committee` | · | · | · | · | · | · | · | · | · | · | · | · | · | ● |
| PMS Audit Log | `/pms/audit` | · | · | · | · | · | ● | · | · | ● | · | · | · | · | · |
| My Annual Work Plan | `/pms/awp` | ● | ● | ● | ● | · | · | · | · | · | · | · | · | · | · |
| AWP Inbox | `/pms/awp/inbox` | ● | ● | ● | ● | · | ● | · | · | ● | · | · | · | · | · |
| AWP Import | `/pms/awp/import` | · | · | · | · | · | ● | · | · | ● | · | · | · | · | · |
| AWP Register | `/pms/awp/register` | ● | · | · | · | · | ● | · | · | ● | · | · | · | · | · |
| Access Requests | `/admin/access-requests` | · | · | · | · | · | · | · | ● | ● | · | · | · | · | · |
| Feature Controls | `/admin/features` | · | · | · | · | · | · | · | · | ● | · | · | · | · | · |
| Data Management | `/data` | · | · | · | · | · | ● | · | ● | ● | · | · | · | · | · |
| IRINS Sync | `/irins-sync` | · | · | · | · | · | · | · | ● | ● | · | · | · | · | · |
| RAG Ingestion | `/admin/rag` | · | · | · | · | · | · | · | ● | ● | · | · | · | · | · |
| Holidays | `/admin/holidays` | · | · | · | · | · | · | · | ● | ● | · | · | · | · | · |

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

## Regenerate the matrix

```bash
node --experimental-strip-types scripts/access_matrix.mts
```
