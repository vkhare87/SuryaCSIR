# /new-migration

Generate a new Supabase migration file scaffold for SURYA.

## Usage

```
/new-migration <description>
```

Example: `/new-migration add_calendar_events_table`

## What this does

1. Generates a timestamp (`YYYYMMDDHHMMSS`) for the current moment.
2. Creates `supabase/migrations/<timestamp>_<description>.sql` with:
   - Header comment block (what this migration does, date)
   - Section stubs: table DDL, indexes, triggers, RLS enable, RLS policies
   - Idempotent guards (`CREATE TABLE IF NOT EXISTS`, etc.)
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` pre-filled
   - Placeholder SELECT + write policies using `user_has_role()` helper
3. Opens the file for editing.

## Rules enforced

- Never edits a shipped migration — least of all the 8-file domain baseline
  (`20260712000001`–`20260712000008`). New work is always a new timestamped file
- Timestamp must sort after everything already applied
- RLS must be enabled and at least one policy present
- New tables: snake_case columns, `uuid PK DEFAULT gen_random_uuid()`, `created_at timestamptz NOT NULL DEFAULT now()`
- Tables with mutable data get `updated_at` + `pms_set_updated_at()` trigger
