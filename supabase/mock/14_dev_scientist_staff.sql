\set ON_ERROR_STOP on
-- DEV ONLY (SEC-18). Refuses to run unless the session opts in, and the line
-- above stops psql at that refusal instead of running the rest of the file:
--   PGOPTIONS='-c surya.allow_mock=on' psql "<LOCAL db url>" -f <this file>
DO $$
BEGIN
    IF current_setting('surya.allow_mock', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'supabase/mock is dev-only: set surya.allow_mock=on, for a LOCAL database only';
    END IF;
END $$;

-- 20260521130000_dev_scientist_staff.sql
-- ⚠ DEV ONLY — synthetic staff record so the dev user can view the Scientist
-- dashboard (which links staff to the logged-in account by Email). Research
-- widgets will be empty (no project_staff / phd / proposal links). Idempotent.

INSERT INTO public.staff ("ID", "Name", "Designation", "Division", "Email", "EmployeeType", "Group")
VALUES ('DEV-VK-001', 'Vivek Khare (Dev)', 'Scientist', 'DEV', 'vivek.khare@csir.res.in', 'Permanent', 'Scientist')
ON CONFLICT ("ID") DO UPDATE SET "Email" = EXCLUDED."Email";
