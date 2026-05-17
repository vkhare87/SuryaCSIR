-- =============================================================
-- 20260516120000_proposals.sql
-- Project Proposals tracking module.
-- See docs/superpowers/specs/2026-05-16-project-proposals-design.md
-- =============================================================

-- ---------- Helper: current user's roles (read-only) ----------
-- Reuses existing user_roles + user_profiles tables.
create or replace function public.proposals_caller_has_role(p_role text)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = p_role
  );
$$;

create or replace function public.proposals_caller_division()
returns text
language sql stable
as $$
  -- division_code lives on user_roles, scoped by the user's active_role.
  select ur.division_code
    from public.user_roles ur
    join public.user_profiles up on up.user_id = ur.user_id
   where ur.user_id = auth.uid()
     and ur.role = up.active_role
   limit 1;
$$;

-- ---------- Table: proposals ----------
create table public.proposals (
  id                          uuid primary key default gen_random_uuid(),
  proposal_code               text unique not null,

  title                       text not null,
  acronym                     text,
  domain_theme                text not null,
  fund_type                   text not null,
  sponsor_type                text not null,
  sponsor_name                text not null,
  project_category            text not null,
  proposed_start_date         date not null,
  proposed_duration_months    int  not null check (proposed_duration_months > 0),
  requested_budget            numeric(14,2) not null check (requested_budget >= 0),
  pi_user_id                  uuid not null references auth.users(id),
  pi_name                     text not null,
  division_code               text not null,
  abstract                    text not null,
  problem_statement           text not null,
  objectives                  text not null,
  expected_outcomes           text not null,
  current_trl                 smallint check (current_trl between 1 and 9),
  target_trl                  smallint check (target_trl between 1 and 9),

  status                      text not null default 'DRAFT'
                              check (status in (
                                'DRAFT','SUBMITTED','UNDER_REVIEW',
                                'REVISION_REQUESTED','REJECTED','RECOMMENDED',
                                'APPROVED','OM_ISSUED','ARCHIVED','LINKED'
                              )),

  review_body                 text,
  review_sent_date            date,
  revision_notes              text,
  rejection_reason            text,
  sanctioned_amount           numeric(14,2),
  sanction_date               date,
  om_number                   text,
  om_date                     date,

  -- No FK on linked_project_no: ProjectInfo may not exist yet in fresh
  -- deployments. proposal_link_project RPC validates existence at runtime.
  linked_project_no           text,
  archived                    boolean default false,

  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now(),
  submitted_at                timestamptz,
  created_by                  uuid not null references auth.users(id),
  last_status_change_by       uuid references auth.users(id),
  last_status_change_at       timestamptz
);

create index proposals_pi_user_id_idx       on public.proposals(pi_user_id);
create index proposals_division_code_idx    on public.proposals(division_code);
create index proposals_status_idx           on public.proposals(status);
create index proposals_created_at_idx       on public.proposals(created_at desc);

-- ---------- proposal_code generator (per-year NNNN reset) ----------
create or replace function public.proposals_set_code()
returns trigger
language plpgsql
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_num  int;
begin
  if new.proposal_code is null or new.proposal_code = '' then
    -- xact-scoped advisory lock per year prevents two concurrent inserts
    -- from picking the same NNNN.
    perform pg_advisory_xact_lock(hashtext('proposal_code_' || v_year));
    select coalesce(
             max((substring(proposal_code from 'PROP-' || v_year || '-(\d+)$'))::int),
             0
           ) + 1
      into v_num
      from public.proposals
     where proposal_code like 'PROP-' || v_year || '-%';
    new.proposal_code := 'PROP-' || v_year || '-' || lpad(v_num::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger proposals_set_code_trg
before insert on public.proposals
for each row execute function public.proposals_set_code();

-- ---------- Table: proposal_copis ----------
create table public.proposal_copis (
  proposal_id uuid references public.proposals(id) on delete cascade,
  staff_id    text not null,
  staff_name  text not null,
  primary key (proposal_id, staff_id)
);

-- ---------- Table: proposal_documents ----------
create table public.proposal_documents (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid not null references public.proposals(id) on delete cascade,
  doc_type      text not null check (doc_type in ('signed_proposal','om_document')),
  storage_path  text not null,
  file_name     text not null,
  file_size     int,
  uploaded_at   timestamptz default now(),
  uploaded_by   uuid not null references auth.users(id)
);

create index proposal_documents_proposal_id_idx on public.proposal_documents(proposal_id);

-- ---------- Table: proposal_status_history ----------
create table public.proposal_status_history (
  id            bigserial primary key,
  proposal_id   uuid not null references public.proposals(id) on delete cascade,
  from_status   text,
  to_status     text not null,
  payload       jsonb,
  changed_by    uuid not null references auth.users(id),
  changed_at    timestamptz default now()
);

create index proposal_status_history_proposal_id_idx
  on public.proposal_status_history(proposal_id);

-- ---------- RLS ----------
alter table public.proposals               enable row level security;
alter table public.proposal_copis          enable row level security;
alter table public.proposal_documents      enable row level security;
alter table public.proposal_status_history enable row level security;

-- Helper: caller can read a given proposal row
create or replace function public.proposals_can_read(p_row public.proposals)
returns boolean
language sql stable
as $$
  select
    p_row.pi_user_id  = auth.uid()
    or p_row.created_by = auth.uid()
    or (
      (public.proposals_caller_has_role('HOD')
       or public.proposals_caller_has_role('DivisionHead'))
      and p_row.division_code = public.proposals_caller_division()
    )
    or public.proposals_caller_has_role('Director')
    or public.proposals_caller_has_role('HRAdmin')
    or public.proposals_caller_has_role('SystemAdmin')
    or public.proposals_caller_has_role('MasterAdmin');
$$;

-- proposals: SELECT
create policy proposals_select on public.proposals
  for select using (public.proposals_can_read(proposals));

-- proposals: INSERT (scientist on own row)
create policy proposals_insert on public.proposals
  for insert with check (
    pi_user_id  = auth.uid()
    and created_by = auth.uid()
    and public.proposals_caller_has_role('Scientist')
  );

-- proposals: UPDATE (owner while editable)
create policy proposals_update_owner on public.proposals
  for update using (
    created_by = auth.uid()
    and status in ('DRAFT','REVISION_REQUESTED')
  )
  with check (
    created_by = auth.uid()
    and status in ('DRAFT','REVISION_REQUESTED')
  );

-- proposals: DELETE disabled (no policy → blocked)

-- proposal_copis: inherit visibility via parent
create policy proposal_copis_select on public.proposal_copis
  for select using (
    exists (select 1 from public.proposals p
            where p.id = proposal_copis.proposal_id
              and public.proposals_can_read(p))
  );

create policy proposal_copis_write on public.proposal_copis
  for all using (
    exists (select 1 from public.proposals p
            where p.id = proposal_copis.proposal_id
              and p.created_by = auth.uid()
              and p.status in ('DRAFT','REVISION_REQUESTED'))
  )
  with check (
    exists (select 1 from public.proposals p
            where p.id = proposal_copis.proposal_id
              and p.created_by = auth.uid()
              and p.status in ('DRAFT','REVISION_REQUESTED'))
  );

-- proposal_documents: SELECT inherits visibility
create policy proposal_documents_select on public.proposal_documents
  for select using (
    exists (select 1 from public.proposals p
            where p.id = proposal_documents.proposal_id
              and public.proposals_can_read(p))
  );

-- proposal_documents: INSERT — owner for signed_proposal; admin for om_document
create policy proposal_documents_insert on public.proposal_documents
  for insert with check (
    (
      doc_type = 'signed_proposal'
      and exists (select 1 from public.proposals p
                  where p.id = proposal_documents.proposal_id
                    and p.created_by = auth.uid()
                    and p.status in ('DRAFT','REVISION_REQUESTED'))
    )
    or (
      doc_type = 'om_document'
      and (public.proposals_caller_has_role('HRAdmin')
           or public.proposals_caller_has_role('SystemAdmin')
           or public.proposals_caller_has_role('MasterAdmin'))
    )
  );

-- proposal_status_history: SELECT inherits; INSERT only via RPCs (SECURITY DEFINER)
create policy proposal_status_history_select on public.proposal_status_history
  for select using (
    exists (select 1 from public.proposals p
            where p.id = proposal_status_history.proposal_id
              and public.proposals_can_read(p))
  );

-- ---------- Admin guard ----------
create or replace function public.proposals_caller_is_admin()
returns boolean
language sql stable
as $$
  select public.proposals_caller_has_role('HRAdmin')
      or public.proposals_caller_has_role('SystemAdmin')
      or public.proposals_caller_has_role('MasterAdmin');
$$;

-- ---------- RPC: proposal_submit ----------
create or replace function public.proposal_submit(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.proposals%rowtype;
  v_from text;
begin
  select * into v_row from public.proposals where id = p_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_row.created_by <> auth.uid() then raise exception 'not_owner'; end if;
  if v_row.status not in ('DRAFT','REVISION_REQUESTED') then
    raise exception 'invalid_status_transition: % -> SUBMITTED', v_row.status;
  end if;

  -- require at least one signed_proposal document
  if not exists (select 1 from public.proposal_documents
                 where proposal_id = p_id and doc_type = 'signed_proposal') then
    raise exception 'signed_proposal_required';
  end if;

  v_from := v_row.status;
  update public.proposals
     set status                = 'SUBMITTED',
         submitted_at          = coalesce(submitted_at, now()),
         pi_name               = coalesce(pi_name, v_row.pi_name),
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   where id = p_id;

  insert into public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  values (p_id, v_from, 'SUBMITTED', '{}'::jsonb, auth.uid());
end;
$$;

-- ---------- RPC: proposal_set_under_review ----------
create or replace function public.proposal_set_under_review(
  p_id uuid, p_body text, p_sent_date date
) returns void
language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  if not public.proposals_caller_is_admin() then raise exception 'not_admin'; end if;
  if p_body is null or length(trim(p_body)) = 0 then raise exception 'review_body_required'; end if;
  if p_sent_date is null then raise exception 'review_sent_date_required'; end if;

  select status into v_status from public.proposals where id = p_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_status <> 'SUBMITTED' then
    raise exception 'invalid_status_transition: % -> UNDER_REVIEW', v_status;
  end if;

  update public.proposals
     set status                = 'UNDER_REVIEW',
         review_body           = p_body,
         review_sent_date      = p_sent_date,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   where id = p_id;

  insert into public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  values (p_id, 'SUBMITTED', 'UNDER_REVIEW',
          jsonb_build_object('review_body', p_body, 'review_sent_date', p_sent_date),
          auth.uid());
end;
$$;

-- ---------- RPC: proposal_request_revision ----------
create or replace function public.proposal_request_revision(p_id uuid, p_notes text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  if not public.proposals_caller_is_admin() then raise exception 'not_admin'; end if;
  if p_notes is null or length(trim(p_notes)) = 0 then raise exception 'notes_required'; end if;

  select status into v_status from public.proposals where id = p_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_status <> 'UNDER_REVIEW' then
    raise exception 'invalid_status_transition: % -> REVISION_REQUESTED', v_status;
  end if;

  update public.proposals
     set status                = 'REVISION_REQUESTED',
         revision_notes        = p_notes,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   where id = p_id;

  insert into public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  values (p_id, 'UNDER_REVIEW', 'REVISION_REQUESTED',
          jsonb_build_object('revision_notes', p_notes), auth.uid());
end;
$$;

-- ---------- RPC: proposal_reject ----------
create or replace function public.proposal_reject(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  if not public.proposals_caller_is_admin() then raise exception 'not_admin'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'reason_required'; end if;

  select status into v_status from public.proposals where id = p_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_status <> 'UNDER_REVIEW' then
    raise exception 'invalid_status_transition: % -> REJECTED', v_status;
  end if;

  update public.proposals
     set status                = 'REJECTED',
         rejection_reason      = p_reason,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   where id = p_id;

  insert into public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  values (p_id, 'UNDER_REVIEW', 'REJECTED',
          jsonb_build_object('rejection_reason', p_reason), auth.uid());
end;
$$;

-- ---------- RPC: proposal_recommend ----------
create or replace function public.proposal_recommend(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  if not public.proposals_caller_is_admin() then raise exception 'not_admin'; end if;
  select status into v_status from public.proposals where id = p_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_status <> 'UNDER_REVIEW' then
    raise exception 'invalid_status_transition: % -> RECOMMENDED', v_status;
  end if;

  update public.proposals
     set status                = 'RECOMMENDED',
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   where id = p_id;

  insert into public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  values (p_id, 'UNDER_REVIEW', 'RECOMMENDED', '{}'::jsonb, auth.uid());
end;
$$;

-- ---------- RPC: proposal_approve ----------
create or replace function public.proposal_approve(
  p_id uuid, p_amount numeric, p_date date
) returns void
language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  if not public.proposals_caller_is_admin() then raise exception 'not_admin'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'amount_required'; end if;
  if p_date is null then raise exception 'sanction_date_required'; end if;

  select status into v_status from public.proposals where id = p_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_status <> 'RECOMMENDED' then
    raise exception 'invalid_status_transition: % -> APPROVED', v_status;
  end if;

  update public.proposals
     set status                = 'APPROVED',
         sanctioned_amount     = p_amount,
         sanction_date         = p_date,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   where id = p_id;

  insert into public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  values (p_id, 'RECOMMENDED', 'APPROVED',
          jsonb_build_object('sanctioned_amount', p_amount, 'sanction_date', p_date),
          auth.uid());
end;
$$;

-- ---------- RPC: proposal_issue_om ----------
create or replace function public.proposal_issue_om(
  p_id uuid, p_om_no text, p_om_date date, p_doc_id uuid
) returns void
language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  if not public.proposals_caller_is_admin() then raise exception 'not_admin'; end if;
  if p_om_no is null or length(trim(p_om_no)) = 0 then raise exception 'om_number_required'; end if;
  if p_om_date is null then raise exception 'om_date_required'; end if;
  if p_doc_id is null then raise exception 'om_document_required'; end if;

  if not exists (
    select 1 from public.proposal_documents
    where id = p_doc_id and proposal_id = p_id and doc_type = 'om_document'
  ) then
    raise exception 'om_document_not_found';
  end if;

  select status into v_status from public.proposals where id = p_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_status <> 'APPROVED' then
    raise exception 'invalid_status_transition: % -> OM_ISSUED', v_status;
  end if;

  update public.proposals
     set status                = 'OM_ISSUED',
         om_number             = p_om_no,
         om_date               = p_om_date,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   where id = p_id;

  insert into public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  values (p_id, 'APPROVED', 'OM_ISSUED',
          jsonb_build_object('om_number', p_om_no, 'om_date', p_om_date, 'om_doc_id', p_doc_id),
          auth.uid());
end;
$$;

-- ---------- RPC: proposal_archive ----------
create or replace function public.proposal_archive(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  if not public.proposals_caller_is_admin() then raise exception 'not_admin'; end if;
  select status into v_status from public.proposals where id = p_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_status <> 'OM_ISSUED' then
    raise exception 'invalid_status_transition: % -> ARCHIVED', v_status;
  end if;

  update public.proposals
     set status                = 'ARCHIVED',
         archived              = true,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   where id = p_id;

  insert into public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  values (p_id, 'OM_ISSUED', 'ARCHIVED', '{}'::jsonb, auth.uid());
end;
$$;

-- ---------- RPC: proposal_link_project ----------
create or replace function public.proposal_link_project(p_id uuid, p_project_no text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_status text;
  v_exists boolean;
begin
  if not public.proposals_caller_is_admin() then raise exception 'not_admin'; end if;
  if p_project_no is null or length(trim(p_project_no)) = 0 then
    raise exception 'project_no_required';
  end if;
  -- Only validate against ProjectInfo if that table exists (init.sql applied).
  if to_regclass('public."ProjectInfo"') is not null then
    execute 'select exists (select 1 from public."ProjectInfo" where "ProjectNo" = $1)'
      into v_exists using p_project_no;
    if not v_exists then
      raise exception 'project_not_found';
    end if;
  end if;

  select status into v_status from public.proposals where id = p_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_status <> 'OM_ISSUED' then
    raise exception 'invalid_status_transition: % -> LINKED', v_status;
  end if;

  update public.proposals
     set status                = 'LINKED',
         linked_project_no     = p_project_no,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   where id = p_id;

  insert into public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  values (p_id, 'OM_ISSUED', 'LINKED',
          jsonb_build_object('linked_project_no', p_project_no), auth.uid());
end;
$$;

-- ---------- Storage bucket: proposal-documents ----------
insert into storage.buckets (id, name, public)
values ('proposal-documents', 'proposal-documents', false)
on conflict (id) do nothing;

-- Storage RLS: SELECT — caller can read if they can read the parent proposal.
-- Object name layout: {proposal_id}/{doc_type}/{epoch_ms}_{filename}
create policy proposal_docs_storage_select on storage.objects
  for select using (
    bucket_id = 'proposal-documents'
    and exists (
      select 1 from public.proposals p
      where p.id::text = split_part(name, '/', 1)
        and public.proposals_can_read(p)
    )
  );

-- Storage RLS: INSERT — owner uploads signed_proposal; admin uploads om_document.
create policy proposal_docs_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'proposal-documents'
    and (
      (
        split_part(name, '/', 2) = 'signed_proposal'
        and exists (
          select 1 from public.proposals p
          where p.id::text = split_part(name, '/', 1)
            and p.created_by = auth.uid()
            and p.status in ('DRAFT','REVISION_REQUESTED')
        )
      )
      or (
        split_part(name, '/', 2) = 'om_document'
        and public.proposals_caller_is_admin()
      )
    )
  );
