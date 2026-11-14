-- ============================================================
-- 20261112000006_hr_typed_dates
-- Enterprise P1 / EA2 — a typed date beside each HR text date.
--
-- The text columns mirror the Excel source and stay as they are. Each gets a
-- date twin, filled on every write by try_parse_date(). A value that does not
-- parse leaves the twin NULL — "date missing" to every later check, never a
-- zero or a guess.
-- Tests: scripts/db/identity.db.test.ts (typed dates block).
-- ============================================================
BEGIN;

ALTER TABLE public.staff
    ADD COLUMN IF NOT EXISTS doj_date   date,
    ADD COLUMN IF NOT EXISTS dob_date   date,
    ADD COLUMN IF NOT EXISTS doapp_date date;
ALTER TABLE public.project_staff
    ADD COLUMN IF NOT EXISTS joined_on       date,
    ADD COLUMN IF NOT EXISTS project_ends_on date;
ALTER TABLE public.contract_staff
    ADD COLUMN IF NOT EXISTS joined_on date,
    ADD COLUMN IF NOT EXISTS ends_on   date,
    ADD COLUMN IF NOT EXISTS born_on   date;

-- Recomputed from the text on every write, so the twin cannot drift.
CREATE OR REPLACE FUNCTION public.hr_sync_typed_dates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF TG_TABLE_NAME = 'staff' THEN
        NEW.doj_date   := public.try_parse_date(NEW."DOJ");
        NEW.dob_date   := public.try_parse_date(NEW."DOB");
        NEW.doapp_date := public.try_parse_date(NEW."DoAPP");
    ELSIF TG_TABLE_NAME = 'project_staff' THEN
        NEW.joined_on       := public.try_parse_date(NEW."DateOfJoining");
        NEW.project_ends_on := public.try_parse_date(NEW."DateOfProjectDuration");
    ELSE
        NEW.joined_on := public.try_parse_date(NEW."DateOfJoining");
        NEW.ends_on   := public.try_parse_date(NEW."ContractEndDate");
        NEW.born_on   := public.try_parse_date(NEW."DateOfBirth");
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.hr_sync_typed_dates() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_staff_typed_dates ON public.staff;
CREATE TRIGGER trg_staff_typed_dates BEFORE INSERT OR UPDATE ON public.staff
    FOR EACH ROW EXECUTE FUNCTION public.hr_sync_typed_dates();
DROP TRIGGER IF EXISTS trg_project_staff_typed_dates ON public.project_staff;
CREATE TRIGGER trg_project_staff_typed_dates BEFORE INSERT OR UPDATE ON public.project_staff
    FOR EACH ROW EXECUTE FUNCTION public.hr_sync_typed_dates();
DROP TRIGGER IF EXISTS trg_contract_staff_typed_dates ON public.contract_staff;
CREATE TRIGGER trg_contract_staff_typed_dates BEFORE INSERT OR UPDATE ON public.contract_staff
    FOR EACH ROW EXECUTE FUNCTION public.hr_sync_typed_dates();

UPDATE public.staff SET doj_date = public.try_parse_date("DOJ"), dob_date = public.try_parse_date("DOB"),
                        doapp_date = public.try_parse_date("DoAPP");
UPDATE public.project_staff SET joined_on = public.try_parse_date("DateOfJoining"),
                                project_ends_on = public.try_parse_date("DateOfProjectDuration");
UPDATE public.contract_staff SET joined_on = public.try_parse_date("DateOfJoining"),
                                 ends_on = public.try_parse_date("ContractEndDate"),
                                 born_on = public.try_parse_date("DateOfBirth");

COMMIT;
