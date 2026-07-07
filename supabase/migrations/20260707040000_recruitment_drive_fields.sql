-- Recruitment drive tracking fields (Part B, Task 19)
ALTER TABLE public.vacancy_advertisements
    ADD COLUMN IF NOT EXISTS staff_category text NOT NULL DEFAULT 'Permanent'
        CHECK (staff_category IN ('Permanent','Project')),
    ADD COLUMN IF NOT EXISTS drive_stage text NOT NULL DEFAULT 'Advertised'
        CHECK (drive_stage IN ('Advertised','Applications Closed','Screening',
                               'Interviews','Selection','Offers Issued','Joined','Closed'));
