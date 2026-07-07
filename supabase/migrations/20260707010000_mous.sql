-- MOUs with external organisations (Part B, Task 13)
CREATE TABLE IF NOT EXISTS public.mous (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_name       text NOT NULL,
    partner_type       text NOT NULL DEFAULT 'Other'
                       CHECK (partner_type IN ('Academic','Industry','Government','International','Other')),
    purpose            text NOT NULL DEFAULT '',
    signed_date        date,
    valid_until        date,
    status             text NOT NULL DEFAULT 'Active'
                       CHECK (status IN ('Active','Expired','Under Renewal','Terminated')),
    division_code      text,
    linked_project_no  text,
    remarks            text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mous_status_idx ON public.mous(status);
CREATE INDEX IF NOT EXISTS mous_valid_until_idx ON public.mous(valid_until);

CREATE TRIGGER trg_mous_updated_at
    BEFORE UPDATE ON public.mous
    FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

ALTER TABLE public.mous ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mous_select" ON public.mous FOR SELECT TO authenticated USING (true);

CREATE POLICY "mous_write" ON public.mous FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
