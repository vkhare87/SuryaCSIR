-- =============================================================
-- SURYA — Instruments Extension
-- Adds: labs table, 9 new columns on equipment, RLS, indexes
-- =============================================================

-- 1. Labs table
CREATE TABLE IF NOT EXISTS public.labs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_code   text UNIQUE NOT NULL,
  lab_name   text NOT NULL,
  div_code   text REFERENCES public."DivisionInfo"("divCode"),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.labs ENABLE ROW LEVEL SECURITY;

CREATE POLICY labs_read_authenticated ON public.labs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY labs_admin_write ON public.labs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('SystemAdmin', 'MasterAdmin')
    )
  );

-- 2. Extend equipment with 9 new columns
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS instrument_code     text,
  ADD COLUMN IF NOT EXISTS serial_number       text,
  ADD COLUMN IF NOT EXISTS manufacturer        text,
  ADD COLUMN IF NOT EXISTS year_of_manufacture integer,
  ADD COLUMN IF NOT EXISTS lab_id              uuid REFERENCES public.labs(id),
  ADD COLUMN IF NOT EXISTS owner_user_id       uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS amc_end_date        date,
  ADD COLUMN IF NOT EXISTS purchase_cost       numeric(14, 2),
  ADD COLUMN IF NOT EXISTS procurement_date    date;

-- 3. RLS write policy for admin add/edit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'equipment' AND policyname = 'equipment_admin_write'
  ) THEN
    CREATE POLICY equipment_admin_write ON public.equipment
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid()
            AND role IN ('SystemAdmin', 'MasterAdmin', 'HRAdmin')
        )
      );
  END IF;
END$$;

-- 4. Performance indexes
CREATE INDEX IF NOT EXISTS equipment_owner_idx ON public.equipment(owner_user_id);
CREATE INDEX IF NOT EXISTS equipment_lab_idx   ON public.equipment(lab_id);
CREATE INDEX IF NOT EXISTS equipment_amc_idx   ON public.equipment(amc_end_date);
