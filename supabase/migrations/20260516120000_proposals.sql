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
  select division_code from public.user_profiles where user_id = auth.uid();
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

  linked_project_no           text references public."ProjectInfo"("ProjectNo"),
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

-- ---------- proposal_code generator ----------
create sequence if not exists public.proposal_code_seq;

create or replace function public.proposals_set_code()
returns trigger
language plpgsql
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_num  int  := nextval('public.proposal_code_seq');
begin
  if new.proposal_code is null or new.proposal_code = '' then
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
