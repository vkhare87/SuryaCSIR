-- 20260521130000_dev_scientist_staff.sql
-- ⚠ DEV ONLY — synthetic staff record so the dev user can view the Scientist
-- dashboard (which links staff to the logged-in account by Email). Research
-- widgets will be empty (no project_staff / phd / proposal links). Idempotent.

INSERT INTO public.staff ("ID", "Name", "Designation", "Division", "Email", "EmployeeType", "Group")
VALUES ('DEV-VK-001', 'Vivek Khare (Dev)', 'Scientist', 'DEV', 'vivek.khare@csir.res.in', 'Permanent', 'Scientist')
ON CONFLICT ("ID") DO UPDATE SET "Email" = EXCLUDED."Email";
