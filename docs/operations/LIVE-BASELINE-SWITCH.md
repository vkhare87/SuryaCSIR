# Live baseline switch (2026-11-22)

PR #35 replaced the 102-file migration history with the 2026-11-21 baseline
(`20261121000001`–`08`) plus Stages 0–6 (`09`–`15`). The live project
(`zorujjeeigrkiitkdely`) still records the old 102 files. If you run
`supabase db push` as it is now, it fails, or it tries to build the schema a second time.

This runbook moves live onto the new history **without rebuilding anything**.

## What the comparison found (read only, 2026-11-22)

Live was compared object by object with a PGlite build of the repo
(tables and columns, views, functions, policies, indexes, triggers,
constraints, grants and function EXECUTE rights).

| Live compared with | Result |
|---|---|
| Baseline `01`–`08` + `20261122000002`–`04` | **Same**, except for the items below |
| PR #32 home objects | On live only. The 7 tables are **empty**. Stages 3/4 replace them |
| 13 proposal / project-report functions | Same code. Only letter case and comments differ |

So live already **is** the baseline. Only the history table is out of date.

Stages 3 and 4 use `CREATE TABLE IF NOT EXISTS work_priorities` (and the
same for `notices` and `general_meetings`). On live, PR #32's tables with
those names already exist, so the stages would skip them and keep the wrong
shape. The first block of `20261121000009_stage0_hardening.sql` now drops
the PR #32 objects. It stops with an error if any of those tables has rows.
On a fresh database the block does nothing.

`scripts/db/liveSwitch.db.test.ts` rebuilds a live-shaped database and runs
the switch on it. The result must match a fresh build object for object.

## Steps

The person who runs these steps needs the Supabase CLI and the database password. Each step can be undone; see **Undo**.

### 0. Get ready

```powershell
scoop install supabase
```

```powershell
supabase login
```

```powershell
supabase link --project-ref zorujjeeigrkiitkdely
```

Every database command below carries `--linked`. Without it, CLI v3 runs
`db` and `migration` commands against the **local** stack, not live. `--linked`
reaches the linked project on v2 and v3 (v3 prints a warning that suggests `--remote`; that is fine).

Pick a quiet time and tell users the app is down for about 30 minutes. If you
have to restore, anything written after the backup is lost. Keep users out
until step 6 passes or the undo is done.

The scheduled jobs write too. On live (2026-11-22) they all run between 00:30 and 02:00 UTC
(06:00–07:30 IST): `metric-snapshot` (00:30 on the 1st), `pms-timeline-sweep`,
`notifications-sweep`, `ai-suggest-sweep`, `contribution-requests-sweep`,
`home-overdue-sweep`, `ask-scope-sweep`, and on Mondays `metric-digest` and
`profile-consistency-sweep` (02:00). Start after 02:00 UTC and finish before
00:30 UTC the next day, and no job writes during the switch. Check the list first; it
only reads:

```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY 1;
```

If the list has a job outside that window, pick a window that misses it.

Right before the backup, check that no job is still running. It only reads, and
it must return no rows:

```sql
SELECT j.jobname, d.start_time FROM cron.job_run_details d JOIN cron.job j USING (jobid) WHERE d.status = 'running';
```

If the switch runs past 00:30 UTC, the jobs write as usual. That is fine for
every path under **Undo**, because none of them reloads the backup into live.

Take a backup first. The free plan has no point-in-time restore. The third file saves the
migration history, which the first two do not include.

```powershell
supabase db dump --linked --schema public -f backup-2026-11-22-schema.sql
```

```powershell
supabase db dump --linked --data-only --schema public -f backup-2026-11-22-data.sql
```

```powershell
supabase db dump --linked --data-only --schema supabase_migrations -f backup-2026-11-22-history.sql
```

Open the history file and check it lists the 102 old versions. If it is empty,
run `SELECT version FROM supabase_migrations.schema_migrations ORDER BY 1;` in
the SQL editor (it only reads) and save the result instead.

### 1. Check the PR #32 tables are still empty

Run this in the SQL editor (it only reads). Every count must be 0. If one
is not 0, stop: those rows must be moved first.

```sql
SELECT (SELECT count(*) FROM work_priorities) wp, (SELECT count(*) FROM notices) n,
       (SELECT count(*) FROM notice_reads) nr, (SELECT count(*) FROM general_meetings) gm,
       (SELECT count(*) FROM general_meeting_invitees) gmi, (SELECT count(*) FROM delegation_orders) dor,
       (SELECT count(*) FROM delegation_lines) dl,
       (SELECT count(*) FROM project_staff_persons WHERE user_id IS NOT NULL) psp;
```

### 2. Remove the old history rows

This changes only `supabase_migrations.schema_migrations`, not the schema.

```powershell
supabase migration repair --linked --status reverted 20260712000001 20260712000002 20260712000003 20260712000004 20260712000005 20260712000006 20260712000007 20260712000008 20260712000009 20260714000001 20260714000002 20260718000001 20260718000002 20260718000003 20260718000004 20260718000005 20260718000006 20260718000007 20260719000001 20260719000002 20260719000003 20260725000001 20260725000002 20260725000003 20260725000004 20260725000005 20260726000001 20260726000003 20260726000004 20260726000005 20260726000006 20261020000001 20261020000002 20261020000003 20261021000001 20261021000002 20261101000001 20261101000002 20261102000001 20261102000002 20261102000003 20261102000004 20261102000005 20261102000006 20261102000007 20261102000008 20261102000009 20261110000001 20261110000002 20261110000003 20261111000001 20261111000002 20261111000003 20261112000001 20261112000002 20261112000003 20261112000004 20261112000005 20261112000006 20261112000007 20261112000008 20261112000009 20261112000010 20261112000011 20261112000012 20261112000013 20261112000014 20261112000015 20261112000016 20261112000017 20261112000018 20261112000019 20261112000020 20261112000021 20261112000022 20261112000023 20261112000024 20261113000001 20261113000002 20261113000003 20261113000004 20261113000005 20261113000006 20261113000007 20261113000008 20261113000009 20261113000010 20261113000011 20261113000012 20261114000001 20261114000002 20261114000003 20261114000004 20261114120001 20261114120002 20261114120003 20261114120004 20261114120005 20261114120006 20261114120007 20261115000001 20261116000001
```

### 3. Record the baseline as applied

Live already has this schema, so nothing runs.

```powershell
supabase migration repair --linked --status applied 20261121000001 20261121000002 20261121000003 20261121000004 20261121000005 20261121000006 20261121000007 20261121000008
```

### 4. Look before you push

```powershell
supabase migration list --linked
```

Remote must show `20261121000001`–`08` only. Local must also show `09`–`15`
and `20261122000001`–`05` as not applied yet.

```powershell
supabase db push --linked --dry-run
```

It must list exactly these 12 files, in this order: `20261121000009` …
`20261121000015`, then `20261122000001` … `20261122000005`. The last one restores the
`priority_answer` check that the asker answers the date they saw.

### 5. Push

```powershell
supabase db push --linked
```

Each file runs in its own transaction. If one fails, that file rolls back and
the files before it stay applied. Fix the cause, then push again.

### 6. Check

- `supabase migration list --linked`: local and remote match.
- In the SQL editor: `SELECT jobname FROM cron.job ORDER BY 1;` must also list `amc-expiry-sweep`.
- Ask Claude to compare live with the repo again (read only). Only the
  "Not fixed by the switch" items below should remain.
- Open the app. Sign in, open Home, Ask SURYA and a project page.

### Undo

`repair --status applied` reads each version's file from `supabase/migrations`
(CLI v2). The old 102 files are in `supabase/migrations_archive/2026-11-21`, so copy
them in for the repair, then take them out again:

```powershell
Copy-Item supabase/migrations_archive/2026-11-21/*.sql supabase/migrations/
```

Run the repair commands for your case (below). Then remove the copies:

```powershell
Get-ChildItem supabase/migrations_archive/2026-11-21/*.sql | ForEach-Object { Remove-Item (Join-Path supabase/migrations $_.Name) }
```

```powershell
git status supabase/migrations
```

`git status` must show nothing changed.

**Before step 5** (nothing pushed yet): the schema is untouched, so only the history needs undoing.

1. `supabase migration repair --linked --status reverted 20261121000001 20261121000002 20261121000003 20261121000004 20261121000005 20261121000006 20261121000007 20261121000008`
2. `supabase migration repair --linked --status applied <the step 2 list>`
3. `supabase migration list --linked` must show only the old 102 versions on the remote.

**After step 5, if a file failed:** fix forward. The failed file rolled back.
The files before it are applied, and `liveSwitch.db.test.ts` shows they leave
the right schema. Fix the cause in a new commit, then run `supabase db push --linked` again.

**After step 5, back to the old state (last resort).** Do not reload the
backup into live. Clearing `public` there also removes objects that the backups do not hold, such as the storage
file rules and the sign-up trigger on `auth.users`. Instead:

1. Make a new Supabase project.
2. Load the backups into it: the schema, then the data, then the history.
3. Check it there, and ask Claude to compare it with the backup (read only).
4. Point the app at it: change `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

On a paid plan, Dashboard → Database → Backups can restore the whole project
in place instead.

## Not fixed by the switch (follow-ups)

These were already on live before PR #35. The switch does not touch them.

1. **`anon` table rights (security).** On live, `anon` has DELETE, INSERT, SELECT and UPDATE on
   `irins_profiles`, `pms_evaluation_committee_members` and `project_staff`. It also has DELETE, INSERT and SELECT on
   `query_log`. The repo gives `anon` no table rights. RLS still applies, but
   this should be a migration that revokes them.
2. **Vacancy IDs.** On live, `vacancy_advertisements.id`, `vacancy_posts.id`, their
   `advertisement_id` / `post_id` columns and `recruitment_events.advt_id` are
   `uuid`. The repo has `text`. Live has 5 adverts and 5 posts. `recruitment_advance(p_advt_id text)`
   compares text with a uuid column, so it may fail on live.
3. **Two policies.** On live, `pms_audit_logs.audit_logs_select` uses `pms_is_admin()`. The repo lists
   HRAdmin/SystemAdmin/MasterAdmin. On live, `vacancy_advertisements_update` has no
   SystemAdmin.
4. **Old names.** Indexes and constraints on `pms_evaluation_committees*` still
   have their `pms_collegium*` names from a table rename. This is harmless, but a future
   migration that drops them by the new name will fail on live.
5. **Extra on live only.** The column `user_roles.last_seen_at` (unused) and the index
   `documents_title_trgm_idx`.
