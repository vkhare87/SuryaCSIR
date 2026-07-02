-- Project Progress Reports (Overhaul T2)
-- Periodic structured progress report per project. Fresh PMS-style snake_case.
-- Loose linkage to projects by "ProjectNo" text (projects PK is ProjectID and
-- ProjectNo is non-unique in the HR mirror — no FK, matches app convention).
-- Optional PDF annexure files into the unified documents registry (T1).

-- ---------- Table ----------
create table public.project_reports (
  id                  uuid primary key default gen_random_uuid(),
  project_no          text not null,
  project_name        text not null,
  division_code       text,
  period_type         text not null default 'Q'
                      check (period_type in ('Q','H','Y')),   -- quarter / half / year
  period_label        text not null,                          -- e.g. 'Q2 2026-27'
  due_date            date,
  status              text not null default 'DRAFT'
                      check (status in ('DRAFT','SUBMITTED','UNDER_REVIEW','REVISION_REQUESTED','REVIEWED')),
  objectives_progress text not null default '',
  milestones          text not null default '',
  expenditure_summary text not null default '',
  outcomes            text not null default '',
  remarks             text not null default '',
  review_notes        text,
  reviewed_by         uuid references auth.users(id),
  reviewed_at         timestamptz,
  submitted_by        uuid not null references auth.users(id),
  submitted_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index project_reports_project_idx on public.project_reports (project_no);
create index project_reports_owner_idx   on public.project_reports (submitted_by);
create index project_reports_status_idx  on public.project_reports (status);

-- ---------- Status history ----------
create table public.project_report_history (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.project_reports(id) on delete cascade,
  from_status text,
  to_status   text not null,
  payload     jsonb not null default '{}'::jsonb,
  changed_by  uuid not null references auth.users(id),
  changed_at  timestamptz not null default now()
);

-- ---------- RLS ----------
alter table public.project_reports enable row level security;
alter table public.project_report_history enable row level security;

-- Reviewer roles: HOD/DivisionHead within division, Director + admins anywhere.
create or replace function public.project_reports_can_review(d public.project_reports)
returns boolean
language sql stable
as $$
  select
    public.proposals_caller_has_role('Director')
    or public.proposals_caller_has_role('HRAdmin')
    or public.proposals_caller_has_role('SystemAdmin')
    or public.proposals_caller_has_role('MasterAdmin')
    or ((public.proposals_caller_has_role('HOD')
         or public.proposals_caller_has_role('DivisionHead'))
        and d.division_code is not null
        and d.division_code = public.proposals_caller_division());
$$;

create or replace function public.project_reports_can_read(d public.project_reports)
returns boolean
language sql stable
as $$
  select d.submitted_by = auth.uid() or public.project_reports_can_review(d);
$$;

create policy project_reports_select on public.project_reports
  for select using (public.project_reports_can_read(project_reports));

-- Author creates and edits own report while editable.
create policy project_reports_insert on public.project_reports
  for insert with check (submitted_by = auth.uid());

create policy project_reports_update_owner on public.project_reports
  for update using (submitted_by = auth.uid() and status in ('DRAFT','REVISION_REQUESTED'))
  with check (submitted_by = auth.uid() and status in ('DRAFT','REVISION_REQUESTED'));

create policy project_reports_delete_owner on public.project_reports
  for delete using (submitted_by = auth.uid() and status = 'DRAFT');

create policy project_report_history_select on public.project_report_history
  for select using (
    exists (select 1 from public.project_reports r
            where r.id = project_report_history.report_id
              and public.project_reports_can_read(r))
  );

-- ---------- RPC: submit (author) ----------
create or replace function public.project_report_submit(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_row public.project_reports%rowtype;
begin
  select * into v_row from public.project_reports where id = p_id for update;
  if not found then raise exception 'report_not_found'; end if;
  if v_row.submitted_by <> auth.uid() then raise exception 'not_owner'; end if;
  if v_row.status not in ('DRAFT','REVISION_REQUESTED') then
    raise exception 'invalid_status_transition: % -> SUBMITTED', v_row.status;
  end if;
  if length(trim(v_row.objectives_progress)) = 0 then raise exception 'objectives_progress_required'; end if;

  update public.project_reports
     set status = 'SUBMITTED', submitted_at = coalesce(submitted_at, now()), updated_at = now()
   where id = p_id;

  insert into public.project_report_history(report_id, from_status, to_status, changed_by)
  values (p_id, v_row.status, 'SUBMITTED', auth.uid());
end;
$$;

-- ---------- RPC: review decision (reviewer) ----------
-- p_decision: 'REVIEWED' (accept) or 'REVISION_REQUESTED' (send back).
create or replace function public.project_report_review(p_id uuid, p_decision text, p_notes text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_row public.project_reports%rowtype;
begin
  select * into v_row from public.project_reports where id = p_id for update;
  if not found then raise exception 'report_not_found'; end if;
  if not public.project_reports_can_review(v_row) then raise exception 'not_reviewer'; end if;
  if v_row.status not in ('SUBMITTED','UNDER_REVIEW') then
    raise exception 'invalid_status_transition: % -> %', v_row.status, p_decision;
  end if;
  if p_decision not in ('REVIEWED','REVISION_REQUESTED') then raise exception 'invalid_decision'; end if;
  if p_decision = 'REVISION_REQUESTED' and (p_notes is null or length(trim(p_notes)) = 0) then
    raise exception 'notes_required';
  end if;

  update public.project_reports
     set status = p_decision,
         review_notes = p_notes,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   where id = p_id;

  insert into public.project_report_history(report_id, from_status, to_status, payload, changed_by)
  values (p_id, v_row.status, p_decision, jsonb_build_object('notes', p_notes), auth.uid());
end;
$$;
