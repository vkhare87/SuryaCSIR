-- PhD scholar lifecycle milestones (Part B, Task 18)
CREATE TABLE IF NOT EXISTS public.phd_milestones (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_no   text NOT NULL,
    milestone       text NOT NULL CHECK (milestone IN (
                        'Joining','Coursework','Comprehensive Exam','Registration',
                        'Synopsis Submission','Thesis Submission','Viva Voce','Degree Awarded')),
    due_date        date,
    completed_date  date,
    remarks         text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (enrollment_no, milestone)
);

CREATE INDEX IF NOT EXISTS phd_milestones_enrollment_idx ON public.phd_milestones(enrollment_no);

ALTER TABLE public.phd_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phd_milestones_select" ON public.phd_milestones FOR SELECT TO authenticated USING (true);

CREATE POLICY "phd_milestones_write" ON public.phd_milestones FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
