-- Technology transfer / licensing records (Part B, Task 14)
CREATE TABLE IF NOT EXISTS public.tech_transfers (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    technology_title   text NOT NULL,
    licensee           text NOT NULL,
    licensee_type      text NOT NULL DEFAULT 'Other'
                       CHECK (licensee_type IN ('Industry','Startup','PSU','Government','Other')),
    agreement_type     text NOT NULL DEFAULT 'License'
                       CHECK (agreement_type IN ('License','Know-how Transfer','Joint Development','Consultancy','Sponsored')),
    agreement_date     date,
    value_lakhs        numeric(12,2) CHECK (value_lakhs >= 0),
    status             text NOT NULL DEFAULT 'Signed'
                       CHECK (status IN ('Under Negotiation','Signed','Active','Completed','Terminated')),
    linked_project_no  text,
    linked_ip_id       text,
    division_code      text,
    remarks            text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tech_transfers_status_idx ON public.tech_transfers(status);
CREATE INDEX IF NOT EXISTS tech_transfers_division_idx ON public.tech_transfers(division_code);

CREATE TRIGGER trg_tech_transfers_updated_at
    BEFORE UPDATE ON public.tech_transfers
    FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

ALTER TABLE public.tech_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tech_transfers_select" ON public.tech_transfers FOR SELECT TO authenticated USING (true);

CREATE POLICY "tech_transfers_write" ON public.tech_transfers FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
