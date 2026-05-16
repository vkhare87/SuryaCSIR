# Project Proposals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tracking-only project proposals module: scientists submit proposals with structured fields + signed PDF; admins (HRAdmin/SystemAdmin/MasterAdmin) update status through a defined state machine; role-scoped read access via RLS.

**Architecture:** Mirror the existing PMS module. New snake_case tables (`proposals`, `proposal_copis`, `proposal_documents`, `proposal_status_history`) live in a single new timestamped migration. All status writes go through SECURITY DEFINER RPCs. A dedicated `ProposalsContext` loads role-scoped data. Three pages (`Proposals`, `ProposalForm`, `ProposalDetail`) and one admin modal (`StatusUpdateModal`) form the UI. File storage uses a private Supabase Storage bucket `proposal-documents` with RLS-mirrored object policies.

**Tech Stack:** React 19, TypeScript 5.9 (`verbatimModuleSyntax`), Vite 8, Tailwind CSS 4, React Router 7 (`HashRouter`), `@supabase/supabase-js`, `zod`, `vitest` + `@testing-library/react`, `lucide-react`, `framer-motion`, existing UI primitives in `src/components/ui/`.

**Spec:** `docs/superpowers/specs/2026-05-16-project-proposals-design.md`

---

## File Map

### Created
- `supabase/migrations/20260516120000_proposals.sql` — tables, indexes, RLS, RPCs, storage bucket + policies
- `src/types/proposal.ts` — TypeScript types matching DB rows
- `src/lib/proposals/constants.ts` — status enum, Domain/Theme, Project Category, FundType, SponsorType values, status transition table
- `src/lib/proposals/permissions.ts` — `canCreateProposal`, `canEditProposal`, `canUpdateStatus`, `nextAllowedTransitions`
- `src/lib/proposals/permissions.test.ts` — vitest unit tests
- `src/lib/proposals/validation.ts` — zod schemas (draft + submit)
- `src/lib/proposals/validation.test.ts` — vitest unit tests
- `src/lib/proposals/api.ts` — thin wrappers around `supabase.rpc(...)`
- `src/lib/proposals/storage.ts` — `uploadProposalDoc`, `getDownloadUrl`
- `src/utils/proposalMappers.ts` — DB row → TS object mappers
- `src/contexts/ProposalsContext.tsx` — provider + `useProposals()` hook
- `src/pages/proposals/Proposals.tsx` — list page
- `src/pages/proposals/ProposalForm.tsx` — create/edit form
- `src/pages/proposals/ProposalDetail.tsx` — read + admin panel
- `src/components/proposals/StatusUpdateModal.tsx` — admin per-status form

### Modified
- `src/App.tsx` — add lazy routes for `/proposals`, `/proposals/new`, `/proposals/:id`, `/proposals/:id/edit`; wrap with `ProposalsProvider`
- `src/main.tsx` — mount `ProposalsProvider` inside the existing provider tree
- `src/components/layout/Layout.tsx` — add nav entry under "Research Ops" section

---

## Conventions Recap (from CLAUDE.md)

- `import type { ... }` for all type-only imports (`verbatimModuleSyntax`).
- Function components only. Pages `export default`; primitives/hooks/contexts named export.
- Wrap derived data in `useMemo`. Lazy `useState(() => ...)` initializer for persisted state.
- Pages call `useProposals()` / `useData()`; **never** call Supabase directly from a page.
- Semantic Tailwind tokens (`bg-surface`, `text-text-muted`, `border-border`) — never raw `bg-white` etc.
- Quoted CamelCase for HR tables (`"ProjectInfo"."ProjectNo"`); snake_case for fresh PMS/proposals tables.
- Status transitions only via SECURITY DEFINER RPCs.
- Path imports always relative.

---

## Task 1: Migration — Tables, Indexes, RLS

**Files:**
- Create: `supabase/migrations/20260516120000_proposals.sql`

- [ ] **Step 1.1: Create the migration file with tables, indexes, RLS enable**

Create `supabase/migrations/20260516120000_proposals.sql` with the following content (this step lays down schema only; RPCs come in Task 2):

```sql
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
```

- [ ] **Step 1.2: Verify migration syntax**

Run against a local Supabase or paste into Studio SQL Editor as `postgres`:

```bash
# If supabase CLI is available locally
npx supabase db reset
```

Expected: no error. All four tables created. If `supabase` CLI is not configured, paste the file into Supabase Studio → SQL Editor → Run.

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/20260516120000_proposals.sql
git commit -m "feat(proposals): add tables, indexes, RLS for project proposals module"
```

---

## Task 2: Migration — RPCs & Storage

**Files:**
- Modify: `supabase/migrations/20260516120000_proposals.sql` (append RPCs + storage bucket)

- [ ] **Step 2.1: Append admin-only guard + RPCs**

Append to the end of `supabase/migrations/20260516120000_proposals.sql`:

```sql
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
declare v_status text;
begin
  if not public.proposals_caller_is_admin() then raise exception 'not_admin'; end if;
  if p_project_no is null or length(trim(p_project_no)) = 0 then
    raise exception 'project_no_required';
  end if;
  if not exists (select 1 from public."ProjectInfo" where "ProjectNo" = p_project_no) then
    raise exception 'project_not_found';
  end if;

  select status into v_status from public.proposals where id = p_id for update;
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
```

- [ ] **Step 2.2: Re-run migration**

Run via `npx supabase db reset` or paste into Studio. Expected: no errors. The 9 RPCs are now callable. Storage bucket `proposal-documents` exists.

- [ ] **Step 2.3: Commit**

```bash
git add supabase/migrations/20260516120000_proposals.sql
git commit -m "feat(proposals): add SECURITY DEFINER RPCs and storage bucket policies"
```

---

## Task 3: TypeScript Types

**Files:**
- Create: `src/types/proposal.ts`

- [ ] **Step 3.1: Create the types file**

Create `src/types/proposal.ts`:

```typescript
export type ProposalStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'REVISION_REQUESTED'
  | 'REJECTED'
  | 'RECOMMENDED'
  | 'APPROVED'
  | 'OM_ISSUED'
  | 'ARCHIVED'
  | 'LINKED';

export type ProposalDocType = 'signed_proposal' | 'om_document';

export interface ProposalCoPI {
  staffId: string;
  staffName: string;
}

export interface ProposalDocument {
  id: string;
  proposalId: string;
  docType: ProposalDocType;
  storagePath: string;
  fileName: string;
  fileSize: number | null;
  uploadedAt: string;
  uploadedBy: string;
}

export interface ProposalStatusEntry {
  id: number;
  proposalId: string;
  fromStatus: ProposalStatus | null;
  toStatus: ProposalStatus;
  payload: Record<string, unknown> | null;
  changedBy: string;
  changedAt: string;
}

export interface Proposal {
  id: string;
  proposalCode: string;

  title: string;
  acronym: string | null;
  domainTheme: string;
  fundType: string;
  sponsorType: string;
  sponsorName: string;
  projectCategory: string;
  proposedStartDate: string;
  proposedDurationMonths: number;
  requestedBudget: number;
  piUserId: string;
  piName: string;
  divisionCode: string;
  abstract: string;
  problemStatement: string;
  objectives: string;
  expectedOutcomes: string;
  currentTrl: number | null;
  targetTrl: number | null;

  status: ProposalStatus;

  reviewBody: string | null;
  reviewSentDate: string | null;
  revisionNotes: string | null;
  rejectionReason: string | null;
  sanctionedAmount: number | null;
  sanctionDate: string | null;
  omNumber: string | null;
  omDate: string | null;

  linkedProjectNo: string | null;
  archived: boolean;

  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  createdBy: string;
  lastStatusChangeBy: string | null;
  lastStatusChangeAt: string | null;

  // Eager-loaded children (populated by mappers when present)
  coPIs?: ProposalCoPI[];
  documents?: ProposalDocument[];
  history?: ProposalStatusEntry[];
}
```

- [ ] **Step 3.2: Verify it typechecks**

```bash
npx tsc --noEmit
```

Expected: PASS (no new errors).

- [ ] **Step 3.3: Commit**

```bash
git add src/types/proposal.ts
git commit -m "feat(proposals): add TypeScript types"
```

---

## Task 4: Constants

**Files:**
- Create: `src/lib/proposals/constants.ts`

- [ ] **Step 4.1: Create the constants file**

Create `src/lib/proposals/constants.ts`:

```typescript
import type { ProposalStatus } from '../../types/proposal';

export const PROPOSAL_STATUSES: ProposalStatus[] = [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW',
  'REVISION_REQUESTED', 'REJECTED', 'RECOMMENDED',
  'APPROVED', 'OM_ISSUED', 'ARCHIVED', 'LINKED',
];

export const TERMINAL_STATUSES: ProposalStatus[] = ['REJECTED', 'ARCHIVED', 'LINKED'];

export const EDITABLE_STATUSES: ProposalStatus[] = ['DRAFT', 'REVISION_REQUESTED'];

// Allowed next statuses for admin transitions (from current status).
// DRAFT and REVISION_REQUESTED transitions are scientist-driven via proposal_submit.
export const NEXT_ADMIN_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  DRAFT: [],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['REVISION_REQUESTED', 'REJECTED', 'RECOMMENDED'],
  REVISION_REQUESTED: [],
  REJECTED: [],
  RECOMMENDED: ['APPROVED'],
  APPROVED: ['OM_ISSUED'],
  OM_ISSUED: ['ARCHIVED', 'LINKED'],
  ARCHIVED: [],
  LINKED: [],
};

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  REVISION_REQUESTED: 'Revision Requested',
  REJECTED: 'Rejected',
  RECOMMENDED: 'Recommended',
  APPROVED: 'Approved',
  OM_ISSUED: 'OM Issued',
  ARCHIVED: 'Archived',
  LINKED: 'Linked to Project',
};

// Tailwind semantic token classes for Badge color
export const STATUS_BADGE_VARIANT: Record<ProposalStatus, 'gray' | 'blue' | 'amber' | 'green' | 'red'> = {
  DRAFT: 'gray',
  SUBMITTED: 'blue',
  UNDER_REVIEW: 'blue',
  REVISION_REQUESTED: 'amber',
  REJECTED: 'red',
  RECOMMENDED: 'blue',
  APPROVED: 'green',
  OM_ISSUED: 'green',
  ARCHIVED: 'gray',
  LINKED: 'green',
};

export const FUND_TYPES = ['Internal', 'External'] as const;

export const SPONSOR_TYPES = [
  'Government',
  'Industry',
  'International',
  'CSIR-Internal',
  'Other',
] as const;

// Starter list — admin can request additions; promote to DB-backed lookup later.
export const PROJECT_CATEGORIES = [
  'Basic Research',
  'Applied Research',
  'Product Development',
  'Process Development',
  'Consultancy',
  'Sponsored Project',
  'Mission Mode',
  'Other',
] as const;

export const DOMAIN_THEMES = [
  'Advanced Materials',
  'Functional Materials',
  'Structural Materials',
  'Nano Materials',
  'Biomaterials',
  'Energy Materials',
  'Environment & Sustainability',
  'Process Engineering',
  'Other',
] as const;

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const ALLOWED_MIME_TYPES = ['application/pdf'] as const;
```

- [ ] **Step 4.2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4.3: Commit**

```bash
git add src/lib/proposals/constants.ts
git commit -m "feat(proposals): add module constants and status maps"
```

---

## Task 5: Permissions — Tests First

**Files:**
- Create: `src/lib/proposals/permissions.test.ts`
- Create: `src/lib/proposals/permissions.ts`

- [ ] **Step 5.1: Write the failing tests**

Create `src/lib/proposals/permissions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  canCreateProposal,
  canEditProposal,
  canUpdateStatus,
  nextAllowedTransitions,
} from './permissions';
import type { UserAccount } from '../../types';
import type { Proposal } from '../../types/proposal';

function makeUser(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: 'U001',
    email: 'test@ampri.res.in',
    roles: ['Scientist'],
    activeRole: 'Scientist',
    divisionCode: null,
    mustChangePassword: false,
    fullName: 'Test User',
    ...overrides,
  } as UserAccount;
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'P001',
    proposalCode: 'PROP-2026-0001',
    title: 't',
    acronym: null,
    domainTheme: 'Advanced Materials',
    fundType: 'Internal',
    sponsorType: 'CSIR-Internal',
    sponsorName: 's',
    projectCategory: 'Basic Research',
    proposedStartDate: '2026-06-01',
    proposedDurationMonths: 12,
    requestedBudget: 100000,
    piUserId: 'U001',
    piName: 'Test User',
    divisionCode: 'AMD',
    abstract: 'a',
    problemStatement: 'p',
    objectives: 'o',
    expectedOutcomes: 'e',
    currentTrl: null,
    targetTrl: null,
    status: 'DRAFT',
    reviewBody: null,
    reviewSentDate: null,
    revisionNotes: null,
    rejectionReason: null,
    sanctionedAmount: null,
    sanctionDate: null,
    omNumber: null,
    omDate: null,
    linkedProjectNo: null,
    archived: false,
    createdAt: '2026-05-16T00:00:00Z',
    updatedAt: '2026-05-16T00:00:00Z',
    submittedAt: null,
    createdBy: 'U001',
    lastStatusChangeBy: null,
    lastStatusChangeAt: null,
    ...overrides,
  };
}

describe('canCreateProposal', () => {
  it('allows Scientist', () => {
    expect(canCreateProposal(makeUser({ roles: ['Scientist'] }))).toBe(true);
  });
  it('rejects non-Scientist', () => {
    expect(canCreateProposal(makeUser({ roles: ['Director'] }))).toBe(false);
  });
});

describe('canEditProposal', () => {
  const owner = makeUser({ id: 'U001' });
  const other = makeUser({ id: 'U002' });

  it('owner can edit DRAFT', () => {
    expect(canEditProposal(owner, makeProposal({ status: 'DRAFT' }))).toBe(true);
  });
  it('owner can edit REVISION_REQUESTED', () => {
    expect(canEditProposal(owner, makeProposal({ status: 'REVISION_REQUESTED' }))).toBe(true);
  });
  it('owner cannot edit SUBMITTED', () => {
    expect(canEditProposal(owner, makeProposal({ status: 'SUBMITTED' }))).toBe(false);
  });
  it('non-owner cannot edit', () => {
    expect(canEditProposal(other, makeProposal({ status: 'DRAFT' }))).toBe(false);
  });
});

describe('canUpdateStatus', () => {
  it('allows HRAdmin', () => {
    expect(canUpdateStatus(makeUser({ roles: ['HRAdmin'] }))).toBe(true);
  });
  it('allows SystemAdmin', () => {
    expect(canUpdateStatus(makeUser({ roles: ['SystemAdmin'] }))).toBe(true);
  });
  it('allows MasterAdmin', () => {
    expect(canUpdateStatus(makeUser({ roles: ['MasterAdmin'] }))).toBe(true);
  });
  it('rejects Scientist', () => {
    expect(canUpdateStatus(makeUser({ roles: ['Scientist'] }))).toBe(false);
  });
});

describe('nextAllowedTransitions', () => {
  it('returns admin transitions from SUBMITTED', () => {
    expect(nextAllowedTransitions('SUBMITTED')).toEqual(['UNDER_REVIEW']);
  });
  it('returns three options from UNDER_REVIEW', () => {
    expect(nextAllowedTransitions('UNDER_REVIEW')).toEqual([
      'REVISION_REQUESTED', 'REJECTED', 'RECOMMENDED',
    ]);
  });
  it('returns empty for terminal LINKED', () => {
    expect(nextAllowedTransitions('LINKED')).toEqual([]);
  });
  it('returns empty for REVISION_REQUESTED (scientist-driven)', () => {
    expect(nextAllowedTransitions('REVISION_REQUESTED')).toEqual([]);
  });
});
```

- [ ] **Step 5.2: Run test, expect fail**

```bash
npm test -- src/lib/proposals/permissions.test.ts
```

Expected: FAIL — "Cannot find module './permissions'".

- [ ] **Step 5.3: Write the implementation**

Create `src/lib/proposals/permissions.ts`:

```typescript
import type { UserAccount } from '../../types';
import type { Proposal, ProposalStatus } from '../../types/proposal';
import { EDITABLE_STATUSES, NEXT_ADMIN_TRANSITIONS } from './constants';

const ADMIN_ROLES = ['HRAdmin', 'SystemAdmin', 'MasterAdmin'] as const;

function hasAny(user: UserAccount, roles: readonly string[]): boolean {
  return user.roles.some((r) => roles.includes(r));
}

export function canCreateProposal(user: UserAccount): boolean {
  return user.roles.includes('Scientist');
}

export function canEditProposal(user: UserAccount, proposal: Proposal): boolean {
  return proposal.createdBy === user.id && EDITABLE_STATUSES.includes(proposal.status);
}

export function canUpdateStatus(user: UserAccount): boolean {
  return hasAny(user, ADMIN_ROLES);
}

export function nextAllowedTransitions(status: ProposalStatus): ProposalStatus[] {
  return NEXT_ADMIN_TRANSITIONS[status] ?? [];
}
```

- [ ] **Step 5.4: Run test, expect pass**

```bash
npm test -- src/lib/proposals/permissions.test.ts
```

Expected: PASS (all 11 tests).

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/proposals/permissions.ts src/lib/proposals/permissions.test.ts
git commit -m "feat(proposals): permissions helpers with role + status matrix"
```

---

## Task 6: Validation — Tests First

**Files:**
- Create: `src/lib/proposals/validation.test.ts`
- Create: `src/lib/proposals/validation.ts`

- [ ] **Step 6.1: Write the failing tests**

Create `src/lib/proposals/validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { draftSchema, submitSchema } from './validation';

const validBase = {
  title: 'Novel battery cathode',
  acronym: 'NBC',
  domainTheme: 'Energy Materials',
  fundType: 'External',
  sponsorType: 'Government',
  sponsorName: 'DST',
  projectCategory: 'Applied Research',
  proposedStartDate: '2026-08-01',
  proposedDurationMonths: 24,
  requestedBudget: 5000000,
  divisionCode: 'AMD',
  abstract: 'abc',
  problemStatement: 'p',
  objectives: 'o',
  expectedOutcomes: 'e',
  currentTrl: 3,
  targetTrl: 6,
  coPIs: [{ staffId: 'S1', staffName: 'Co-PI' }],
};

describe('draftSchema', () => {
  it('accepts a row with only title', () => {
    expect(draftSchema.safeParse({ title: 'wip' }).success).toBe(true);
  });
  it('rejects missing title', () => {
    expect(draftSchema.safeParse({}).success).toBe(false);
  });
});

describe('submitSchema', () => {
  it('accepts full valid object', () => {
    expect(submitSchema.safeParse(validBase).success).toBe(true);
  });
  it('rejects missing required text', () => {
    const bad = { ...validBase, abstract: '' };
    expect(submitSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects duration <= 0', () => {
    const bad = { ...validBase, proposedDurationMonths: 0 };
    expect(submitSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects budget < 0', () => {
    const bad = { ...validBase, requestedBudget: -1 };
    expect(submitSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects TRL out of range', () => {
    const bad = { ...validBase, currentTrl: 12 };
    expect(submitSchema.safeParse(bad).success).toBe(false);
  });
  it('accepts null TRL fields', () => {
    const ok = { ...validBase, currentTrl: null, targetTrl: null };
    expect(submitSchema.safeParse(ok).success).toBe(true);
  });
  it('rejects unknown fund type', () => {
    const bad = { ...validBase, fundType: 'Bitcoin' };
    expect(submitSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 6.2: Run, expect fail**

```bash
npm test -- src/lib/proposals/validation.test.ts
```

Expected: FAIL — "Cannot find module './validation'".

- [ ] **Step 6.3: Write the implementation**

Create `src/lib/proposals/validation.ts`:

```typescript
import { z } from 'zod';
import {
  FUND_TYPES,
  SPONSOR_TYPES,
  PROJECT_CATEGORIES,
  DOMAIN_THEMES,
} from './constants';

export const coPISchema = z.object({
  staffId: z.string().min(1),
  staffName: z.string().min(1),
});

const trlSchema = z.number().int().min(1).max(9).nullable();

export const draftSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  acronym: z.string().nullish(),
  domainTheme: z.enum(DOMAIN_THEMES).nullish(),
  fundType: z.enum(FUND_TYPES).nullish(),
  sponsorType: z.enum(SPONSOR_TYPES).nullish(),
  sponsorName: z.string().nullish(),
  projectCategory: z.enum(PROJECT_CATEGORIES).nullish(),
  proposedStartDate: z.string().nullish(),
  proposedDurationMonths: z.number().int().positive().nullish(),
  requestedBudget: z.number().nonnegative().nullish(),
  divisionCode: z.string().nullish(),
  abstract: z.string().nullish(),
  problemStatement: z.string().nullish(),
  objectives: z.string().nullish(),
  expectedOutcomes: z.string().nullish(),
  currentTrl: trlSchema.optional(),
  targetTrl: trlSchema.optional(),
  coPIs: z.array(coPISchema).optional(),
});

export const submitSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  acronym: z.string().nullish(),
  domainTheme: z.enum(DOMAIN_THEMES),
  fundType: z.enum(FUND_TYPES),
  sponsorType: z.enum(SPONSOR_TYPES),
  sponsorName: z.string().min(1),
  projectCategory: z.enum(PROJECT_CATEGORIES),
  proposedStartDate: z.string().min(1),
  proposedDurationMonths: z.number().int().positive(),
  requestedBudget: z.number().nonnegative(),
  divisionCode: z.string().min(1),
  abstract: z.string().min(1),
  problemStatement: z.string().min(1),
  objectives: z.string().min(1),
  expectedOutcomes: z.string().min(1),
  currentTrl: trlSchema,
  targetTrl: trlSchema,
  coPIs: z.array(coPISchema).optional(),
});

export type DraftInput = z.infer<typeof draftSchema>;
export type SubmitInput = z.infer<typeof submitSchema>;
```

- [ ] **Step 6.4: Run, expect pass**

```bash
npm test -- src/lib/proposals/validation.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 6.5: Commit**

```bash
git add src/lib/proposals/validation.ts src/lib/proposals/validation.test.ts
git commit -m "feat(proposals): zod validation schemas for draft and submit"
```

---

## Task 7: Row Mappers

**Files:**
- Create: `src/utils/proposalMappers.ts`

- [ ] **Step 7.1: Create the mapper**

Create `src/utils/proposalMappers.ts`:

```typescript
import type {
  Proposal,
  ProposalCoPI,
  ProposalDocument,
  ProposalStatusEntry,
  ProposalStatus,
  ProposalDocType,
} from '../types/proposal';

/* eslint-disable @typescript-eslint/no-explicit-any */
// `any` is acceptable here per CLAUDE.md (mapper / migration boundary layers).

export function mapProposalRow(row: any): Proposal {
  return {
    id: row.id,
    proposalCode: row.proposal_code,
    title: row.title,
    acronym: row.acronym,
    domainTheme: row.domain_theme,
    fundType: row.fund_type,
    sponsorType: row.sponsor_type,
    sponsorName: row.sponsor_name,
    projectCategory: row.project_category,
    proposedStartDate: row.proposed_start_date,
    proposedDurationMonths: row.proposed_duration_months,
    requestedBudget: Number(row.requested_budget),
    piUserId: row.pi_user_id,
    piName: row.pi_name,
    divisionCode: row.division_code,
    abstract: row.abstract,
    problemStatement: row.problem_statement,
    objectives: row.objectives,
    expectedOutcomes: row.expected_outcomes,
    currentTrl: row.current_trl,
    targetTrl: row.target_trl,
    status: row.status as ProposalStatus,
    reviewBody: row.review_body,
    reviewSentDate: row.review_sent_date,
    revisionNotes: row.revision_notes,
    rejectionReason: row.rejection_reason,
    sanctionedAmount: row.sanctioned_amount === null ? null : Number(row.sanctioned_amount),
    sanctionDate: row.sanction_date,
    omNumber: row.om_number,
    omDate: row.om_date,
    linkedProjectNo: row.linked_project_no,
    archived: !!row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
    createdBy: row.created_by,
    lastStatusChangeBy: row.last_status_change_by,
    lastStatusChangeAt: row.last_status_change_at,
  };
}

export function mapCoPIRow(row: any): ProposalCoPI {
  return { staffId: row.staff_id, staffName: row.staff_name };
}

export function mapDocumentRow(row: any): ProposalDocument {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    docType: row.doc_type as ProposalDocType,
    storagePath: row.storage_path,
    fileName: row.file_name,
    fileSize: row.file_size,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
  };
}

export function mapHistoryRow(row: any): ProposalStatusEntry {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    payload: row.payload,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  };
}
```

- [ ] **Step 7.2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7.3: Commit**

```bash
git add src/utils/proposalMappers.ts
git commit -m "feat(proposals): row mappers for DB-to-TS conversion"
```

---

## Task 8: API Layer — RPC Wrappers

**Files:**
- Create: `src/lib/proposals/api.ts`

- [ ] **Step 8.1: Create the API wrappers**

Create `src/lib/proposals/api.ts`:

```typescript
import { supabase } from '../../utils/supabaseClient';

export type RpcResult = { ok: true } | { ok: false, error: string };

async function callRpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.rpc(name, args);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function submitProposal(id: string) {
  return callRpc('proposal_submit', { p_id: id });
}

export function setUnderReview(id: string, reviewBody: string, sentDate: string) {
  return callRpc('proposal_set_under_review', {
    p_id: id, p_body: reviewBody, p_sent_date: sentDate,
  });
}

export function requestRevision(id: string, notes: string) {
  return callRpc('proposal_request_revision', { p_id: id, p_notes: notes });
}

export function rejectProposal(id: string, reason: string) {
  return callRpc('proposal_reject', { p_id: id, p_reason: reason });
}

export function recommendProposal(id: string) {
  return callRpc('proposal_recommend', { p_id: id });
}

export function approveProposal(id: string, amount: number, sanctionDate: string) {
  return callRpc('proposal_approve', {
    p_id: id, p_amount: amount, p_date: sanctionDate,
  });
}

export function issueOM(
  id: string, omNumber: string, omDate: string, docId: string,
) {
  return callRpc('proposal_issue_om', {
    p_id: id, p_om_no: omNumber, p_om_date: omDate, p_doc_id: docId,
  });
}

export function archiveProposal(id: string) {
  return callRpc('proposal_archive', { p_id: id });
}

export function linkProject(id: string, projectNo: string) {
  return callRpc('proposal_link_project', { p_id: id, p_project_no: projectNo });
}
```

- [ ] **Step 8.2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8.3: Commit**

```bash
git add src/lib/proposals/api.ts
git commit -m "feat(proposals): RPC wrapper layer"
```

---

## Task 9: Storage Helpers

**Files:**
- Create: `src/lib/proposals/storage.ts`

- [ ] **Step 9.1: Create the storage helpers**

Create `src/lib/proposals/storage.ts`:

```typescript
import { supabase } from '../../utils/supabaseClient';
import type { ProposalDocType, ProposalDocument } from '../../types/proposal';
import { mapDocumentRow } from '../../utils/proposalMappers';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from './constants';

const BUCKET = 'proposal-documents';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export async function uploadProposalDoc(
  proposalId: string,
  docType: ProposalDocType,
  file: File,
): Promise<{ ok: true, document: ProposalDocument } | { ok: false, error: string }> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };

  if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
    return { ok: false, error: 'Only PDF files are allowed' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: 'File exceeds 25 MB' };
  }

  const safe = sanitizeFilename(file.name);
  const path = `${proposalId}/${docType}/${Date.now()}_${safe}`;

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) return { ok: false, error: uploadErr.message };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: 'Not authenticated' };
  }

  const { data, error: insertErr } = await supabase
    .from('proposal_documents')
    .insert({
      proposal_id: proposalId,
      doc_type: docType,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (insertErr || !data) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: insertErr?.message ?? 'Insert failed' };
  }

  return { ok: true, document: mapDocumentRow(data) };
}

export async function getDownloadUrl(storagePath: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}
```

- [ ] **Step 9.2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9.3: Commit**

```bash
git add src/lib/proposals/storage.ts
git commit -m "feat(proposals): storage helpers for upload and signed URL"
```

---

## Task 10: ProposalsContext

**Files:**
- Create: `src/contexts/ProposalsContext.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 10.1: Create the context**

Create `src/contexts/ProposalsContext.tsx`:

```typescript
/* eslint-disable react-refresh/only-export-components */
import {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode,
} from 'react';
import { supabase, isProvisioned } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';
import {
  mapProposalRow, mapCoPIRow, mapDocumentRow, mapHistoryRow,
} from '../utils/proposalMappers';
import type { Proposal, ProposalCoPI } from '../types/proposal';

interface ProposalsContextType {
  proposals: Proposal[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getProposal: (id: string) => Promise<Proposal>;
  createDraft: (input: Partial<Proposal> & { title: string }, coPIs: ProposalCoPI[]) => Promise<Proposal>;
  updateDraft: (id: string, input: Partial<Proposal>, coPIs: ProposalCoPI[]) => Promise<void>;
}

const ProposalsContext = createContext<ProposalsContextType | undefined>(undefined);

export function useProposals() {
  const ctx = useContext(ProposalsContext);
  if (ctx === undefined) throw new Error('useProposals must be used within a ProposalsProvider');
  return ctx;
}

export function ProposalsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const provisioned = isProvisioned();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!provisioned || !supabase || !user) {
      setProposals([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('proposals')
        .select('*')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setProposals((data ?? []).map(mapProposalRow));
    } catch (e) {
      console.error('[proposals] refresh failed', e);
      setError((e as Error).message);
      setProposals([]);
    } finally {
      setIsLoading(false);
    }
  }, [provisioned, user]);

  useEffect(() => { refresh(); }, [refresh]);

  const getProposal = useCallback(async (id: string): Promise<Proposal> => {
    if (!supabase) throw new Error('Database not provisioned');
    const [pRes, cRes, dRes, hRes] = await Promise.all([
      supabase.from('proposals').select('*').eq('id', id).single(),
      supabase.from('proposal_copis').select('*').eq('proposal_id', id),
      supabase.from('proposal_documents').select('*').eq('proposal_id', id)
        .order('uploaded_at', { ascending: false }),
      supabase.from('proposal_status_history').select('*').eq('proposal_id', id)
        .order('changed_at', { ascending: true }),
    ]);
    if (pRes.error) throw pRes.error;
    const proposal = mapProposalRow(pRes.data);
    proposal.coPIs     = (cRes.data ?? []).map(mapCoPIRow);
    proposal.documents = (dRes.data ?? []).map(mapDocumentRow);
    proposal.history   = (hRes.data ?? []).map(mapHistoryRow);
    return proposal;
  }, []);

  const createDraft = useCallback(
    async (input: Partial<Proposal> & { title: string }, coPIs: ProposalCoPI[]) => {
      if (!supabase || !user) throw new Error('Not authenticated');
      const insertRow = {
        title: input.title,
        acronym: input.acronym ?? null,
        domain_theme: input.domainTheme ?? '',
        fund_type: input.fundType ?? '',
        sponsor_type: input.sponsorType ?? '',
        sponsor_name: input.sponsorName ?? '',
        project_category: input.projectCategory ?? '',
        proposed_start_date: input.proposedStartDate ?? new Date().toISOString().slice(0, 10),
        proposed_duration_months: input.proposedDurationMonths ?? 1,
        requested_budget: input.requestedBudget ?? 0,
        pi_user_id: user.id,
        pi_name: input.piName ?? user.fullName ?? user.email,
        division_code: input.divisionCode ?? user.divisionCode ?? '',
        abstract: input.abstract ?? '',
        problem_statement: input.problemStatement ?? '',
        objectives: input.objectives ?? '',
        expected_outcomes: input.expectedOutcomes ?? '',
        current_trl: input.currentTrl ?? null,
        target_trl: input.targetTrl ?? null,
        status: 'DRAFT' as const,
        created_by: user.id,
      };
      const { data, error: err } = await supabase
        .from('proposals')
        .insert(insertRow)
        .select()
        .single();
      if (err || !data) throw err ?? new Error('Insert failed');
      const proposal = mapProposalRow(data);

      if (coPIs.length > 0) {
        const { error: copErr } = await supabase
          .from('proposal_copis')
          .insert(coPIs.map((c) => ({
            proposal_id: proposal.id, staff_id: c.staffId, staff_name: c.staffName,
          })));
        if (copErr) throw copErr;
      }
      await refresh();
      return proposal;
    },
    [user, refresh],
  );

  const updateDraft = useCallback(
    async (id: string, input: Partial<Proposal>, coPIs: ProposalCoPI[]) => {
      if (!supabase) throw new Error('Database not provisioned');
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.title !== undefined)                  patch.title = input.title;
      if (input.acronym !== undefined)                patch.acronym = input.acronym;
      if (input.domainTheme !== undefined)            patch.domain_theme = input.domainTheme;
      if (input.fundType !== undefined)               patch.fund_type = input.fundType;
      if (input.sponsorType !== undefined)            patch.sponsor_type = input.sponsorType;
      if (input.sponsorName !== undefined)            patch.sponsor_name = input.sponsorName;
      if (input.projectCategory !== undefined)        patch.project_category = input.projectCategory;
      if (input.proposedStartDate !== undefined)      patch.proposed_start_date = input.proposedStartDate;
      if (input.proposedDurationMonths !== undefined) patch.proposed_duration_months = input.proposedDurationMonths;
      if (input.requestedBudget !== undefined)        patch.requested_budget = input.requestedBudget;
      if (input.divisionCode !== undefined)           patch.division_code = input.divisionCode;
      if (input.abstract !== undefined)               patch.abstract = input.abstract;
      if (input.problemStatement !== undefined)       patch.problem_statement = input.problemStatement;
      if (input.objectives !== undefined)             patch.objectives = input.objectives;
      if (input.expectedOutcomes !== undefined)       patch.expected_outcomes = input.expectedOutcomes;
      if (input.currentTrl !== undefined)             patch.current_trl = input.currentTrl;
      if (input.targetTrl !== undefined)              patch.target_trl = input.targetTrl;

      const { error: err } = await supabase.from('proposals').update(patch).eq('id', id);
      if (err) throw err;

      // Re-sync co-PIs (simple delete + reinsert)
      const { error: delErr } = await supabase.from('proposal_copis').delete().eq('proposal_id', id);
      if (delErr) throw delErr;
      if (coPIs.length > 0) {
        const { error: insErr } = await supabase
          .from('proposal_copis')
          .insert(coPIs.map((c) => ({
            proposal_id: id, staff_id: c.staffId, staff_name: c.staffName,
          })));
        if (insErr) throw insErr;
      }
      await refresh();
    },
    [refresh],
  );

  return (
    <ProposalsContext.Provider value={{
      proposals, isLoading, error, refresh, getProposal, createDraft, updateDraft,
    }}>
      {children}
    </ProposalsContext.Provider>
  );
}
```

- [ ] **Step 10.2: Mount provider in `main.tsx`**

Open `src/main.tsx`. Find the existing provider stack. Add `ProposalsProvider` import at the top with the other context imports:

```typescript
import { ProposalsProvider } from './contexts/ProposalsContext';
```

Wrap `<App />` so that `ProposalsProvider` sits inside `AuthProvider` (it needs `useAuth`) and inside `DataProvider` if there is one. Example placement — replace whatever currently wraps `<App />` with the same tree plus `ProposalsProvider`:

```tsx
<AuthProvider>
  <DataProvider>
    <PMSProvider>
      <ProposalsProvider>
        <App />
      </ProposalsProvider>
    </PMSProvider>
  </DataProvider>
</AuthProvider>
```

If the current ordering differs, keep `ProposalsProvider` as a sibling of `PMSProvider` directly under `DataProvider`.

- [ ] **Step 10.3: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 10.4: Commit**

```bash
git add src/contexts/ProposalsContext.tsx src/main.tsx
git commit -m "feat(proposals): context provider with load + draft mutations"
```

---

## Task 11: List Page — `Proposals.tsx`

**Files:**
- Create: `src/pages/proposals/Proposals.tsx`

- [ ] **Step 11.1: Create the page**

Create `src/pages/proposals/Proposals.tsx`:

```typescript
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Search } from 'lucide-react';
import { useProposals } from '../../contexts/ProposalsContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card, StatCard, Badge } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { canCreateProposal } from '../../lib/proposals/permissions';
import { PROPOSAL_STATUSES, STATUS_LABELS, STATUS_BADGE_VARIANT } from '../../lib/proposals/constants';
import type { Proposal, ProposalStatus } from '../../types/proposal';

export default function Proposals() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { proposals, isLoading } = useProposals();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProposalStatus>('ALL');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return proposals.filter((p) => {
      const matchesSearch =
        p.title.toLowerCase().includes(q) ||
        (p.acronym ?? '').toLowerCase().includes(q) ||
        p.proposalCode.toLowerCase().includes(q) ||
        p.piName.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [proposals, search, statusFilter]);

  const counts = useMemo(() => {
    const myDrafts = user
      ? proposals.filter((p) => p.createdBy === user.id && p.status === 'DRAFT').length
      : 0;
    const underReview = proposals.filter((p) => p.status === 'UNDER_REVIEW').length;
    const approved    = proposals.filter((p) => p.status === 'APPROVED').length;
    const omIssued    = proposals.filter((p) => p.status === 'OM_ISSUED').length;
    return { myDrafts, underReview, approved, omIssued };
  }, [proposals, user]);

  const showCreate = user ? canCreateProposal(user) : false;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Project Proposals</h1>
          <p className="text-text-muted text-sm">Track scientist-submitted project proposals.</p>
        </div>
        {showCreate && (
          <Button onClick={() => navigate('/proposals/new')}>
            <Plus className="w-4 h-4 mr-1" /> New Proposal
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Drafts"    value={counts.myDrafts} />
        <StatCard label="Under Review" value={counts.underReview} />
        <StatCard label="Approved"     value={counts.approved} />
        <StatCard label="OM Issued"    value={counts.omIssued} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, acronym, code, PI"
              className="w-full pl-10 pr-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | ProposalStatus)}
            className="px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text"
          >
            <option value="ALL">All statuses</option>
            {PROPOSAL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-8 text-center text-text-muted">Loading…</Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No proposals found"
          message={proposals.length === 0
            ? 'No proposals have been created yet.'
            : 'No proposals match the current filters.'}
        />
      ) : (
        <DataTable<Proposal>
          data={filtered}
          getRowKey={(p) => p.id}
          onRowClick={(p) => navigate(`/proposals/${p.id}`)}
          columns={[
            { header: 'Code',   accessor: (p) => p.proposalCode },
            { header: 'Title',  accessor: (p) => p.title },
            { header: 'PI',     accessor: (p) => p.piName },
            { header: 'Status', accessor: (p) => (
              <Badge variant={STATUS_BADGE_VARIANT[p.status]}>{STATUS_LABELS[p.status]}</Badge>
            ) },
            { header: 'Budget', accessor: (p) => `₹${p.requestedBudget.toLocaleString('en-IN')}` },
            { header: 'Created', accessor: (p) => new Date(p.createdAt).toLocaleDateString('en-IN') },
          ]}
        />
      )}
    </div>
  );
}
```

> **Note:** This task assumes `Card`, `StatCard`, `Badge`, `Button`, `DataTable`, `EmptyState` already exist with the props used. If `Badge` does not accept a `variant` prop matching `STATUS_BADGE_VARIANT` values, adjust the import or fall back to a plain `<span>` styled with semantic tokens. Read `src/components/ui/Cards.tsx` and `src/components/ui/Button.tsx` before this step if signatures are uncertain.

- [ ] **Step 11.2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS. If `Badge` variant prop differs from `STATUS_BADGE_VARIANT`, update either the constant or the JSX so the union matches.

- [ ] **Step 11.3: Commit**

```bash
git add src/pages/proposals/Proposals.tsx
git commit -m "feat(proposals): list page with filters and stats"
```

---

## Task 12: Form Page — `ProposalForm.tsx`

**Files:**
- Create: `src/pages/proposals/ProposalForm.tsx`

- [ ] **Step 12.1: Create the form page**

Create `src/pages/proposals/ProposalForm.tsx`:

```typescript
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useProposals } from '../../contexts/ProposalsContext';
import { useData } from '../../contexts/DataContext';
import { Card } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { submitSchema } from '../../lib/proposals/validation';
import { submitProposal } from '../../lib/proposals/api';
import { uploadProposalDoc } from '../../lib/proposals/storage';
import {
  FUND_TYPES, SPONSOR_TYPES, PROJECT_CATEGORIES, DOMAIN_THEMES,
} from '../../lib/proposals/constants';
import { canEditProposal } from '../../lib/proposals/permissions';
import type { Proposal, ProposalCoPI } from '../../types/proposal';

interface FormState {
  title: string;
  acronym: string;
  domainTheme: string;
  fundType: string;
  sponsorType: string;
  sponsorName: string;
  projectCategory: string;
  proposedStartDate: string;
  proposedDurationMonths: number;
  requestedBudget: number;
  divisionCode: string;
  abstract: string;
  problemStatement: string;
  objectives: string;
  expectedOutcomes: string;
  currentTrl: number | null;
  targetTrl: number | null;
  coPIs: ProposalCoPI[];
}

const emptyState = (defaultDivision: string): FormState => ({
  title: '',
  acronym: '',
  domainTheme: '',
  fundType: '',
  sponsorType: '',
  sponsorName: '',
  projectCategory: '',
  proposedStartDate: '',
  proposedDurationMonths: 12,
  requestedBudget: 0,
  divisionCode: defaultDivision,
  abstract: '',
  problemStatement: '',
  objectives: '',
  expectedOutcomes: '',
  currentTrl: null,
  targetTrl: null,
  coPIs: [],
});

export default function ProposalForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const { user } = useAuth();
  const { staff } = useData();
  const { getProposal, createDraft, updateDraft } = useProposals();

  const [state, setState] = useState<FormState>(() => emptyState(user?.divisionCode ?? ''));
  const [loaded, setLoaded] = useState<Proposal | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit || !id || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await getProposal(id);
        if (cancelled) return;
        if (!canEditProposal(user, p)) {
          setError('You do not have permission to edit this proposal.');
          return;
        }
        setLoaded(p);
        setState({
          title: p.title,
          acronym: p.acronym ?? '',
          domainTheme: p.domainTheme,
          fundType: p.fundType,
          sponsorType: p.sponsorType,
          sponsorName: p.sponsorName,
          projectCategory: p.projectCategory,
          proposedStartDate: p.proposedStartDate,
          proposedDurationMonths: p.proposedDurationMonths,
          requestedBudget: p.requestedBudget,
          divisionCode: p.divisionCode,
          abstract: p.abstract,
          problemStatement: p.problemStatement,
          objectives: p.objectives,
          expectedOutcomes: p.expectedOutcomes,
          currentTrl: p.currentTrl,
          targetTrl: p.targetTrl,
          coPIs: p.coPIs ?? [],
        });
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isEdit, user, getProposal]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  const hasSignedDoc = useMemo(
    () => !!loaded?.documents?.some((d) => d.docType === 'signed_proposal'),
    [loaded],
  );

  const handleSave = async (mode: 'draft' | 'submit') => {
    setError('');
    setSaving(true);
    try {
      let proposalId = loaded?.id;
      const payload: Partial<Proposal> = {
        title: state.title,
        acronym: state.acronym || null,
        domainTheme: state.domainTheme,
        fundType: state.fundType,
        sponsorType: state.sponsorType,
        sponsorName: state.sponsorName,
        projectCategory: state.projectCategory,
        proposedStartDate: state.proposedStartDate,
        proposedDurationMonths: state.proposedDurationMonths,
        requestedBudget: state.requestedBudget,
        divisionCode: state.divisionCode,
        abstract: state.abstract,
        problemStatement: state.problemStatement,
        objectives: state.objectives,
        expectedOutcomes: state.expectedOutcomes,
        currentTrl: state.currentTrl,
        targetTrl: state.targetTrl,
      };

      if (mode === 'submit') {
        const parsed = submitSchema.safeParse({ ...state });
        if (!parsed.success) {
          throw new Error(parsed.error.issues.map((i) => i.message).join('; '));
        }
      }

      if (proposalId) {
        await updateDraft(proposalId, payload, state.coPIs);
      } else {
        if (!state.title.trim()) throw new Error('Title is required');
        const created = await createDraft({ ...payload, title: state.title }, state.coPIs);
        proposalId = created.id;
      }

      if (pdfFile && proposalId) {
        const up = await uploadProposalDoc(proposalId, 'signed_proposal', pdfFile);
        if (!up.ok) throw new Error(up.error);
      }

      if (mode === 'submit') {
        if (!proposalId) throw new Error('Save failed before submit');
        if (!pdfFile && !hasSignedDoc) throw new Error('Signed proposal PDF is required to submit');
        const result = await submitProposal(proposalId);
        if (!result.ok) throw new Error(result.error);
      }

      navigate(proposalId ? `/proposals/${proposalId}` : '/proposals');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-text">
        {isEdit ? 'Edit Proposal' : 'New Proposal'}
      </h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
          {error}
        </div>
      )}

      <Section title="Identity">
        <Field label="Title" required>
          <input className={inputCls} value={state.title}
            onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Acronym">
          <input className={inputCls} value={state.acronym}
            onChange={(e) => set('acronym', e.target.value)} />
        </Field>
        <Field label="Domain / Theme">
          <select className={inputCls} value={state.domainTheme}
            onChange={(e) => set('domainTheme', e.target.value)}>
            <option value="">Select…</option>
            {DOMAIN_THEMES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Project Category">
          <select className={inputCls} value={state.projectCategory}
            onChange={(e) => set('projectCategory', e.target.value)}>
            <option value="">Select…</option>
            {PROJECT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </Section>

      <Section title="Sponsor">
        <Field label="Fund Type">
          <select className={inputCls} value={state.fundType}
            onChange={(e) => set('fundType', e.target.value)}>
            <option value="">Select…</option>
            {FUND_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Sponsor Type">
          <select className={inputCls} value={state.sponsorType}
            onChange={(e) => set('sponsorType', e.target.value)}>
            <option value="">Select…</option>
            {SPONSOR_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Sponsor Name">
          <input className={inputCls} value={state.sponsorName}
            onChange={(e) => set('sponsorName', e.target.value)} />
        </Field>
      </Section>

      <Section title="Timeline & Budget">
        <Field label="Proposed Start Date">
          <input type="date" className={inputCls} value={state.proposedStartDate}
            onChange={(e) => set('proposedStartDate', e.target.value)} />
        </Field>
        <Field label="Duration (months)">
          <input type="number" min={1} className={inputCls} value={state.proposedDurationMonths}
            onChange={(e) => set('proposedDurationMonths', Number(e.target.value))} />
        </Field>
        <Field label="Requested Budget (₹)">
          <input type="number" min={0} className={inputCls} value={state.requestedBudget}
            onChange={(e) => set('requestedBudget', Number(e.target.value))} />
        </Field>
      </Section>

      <Section title="Team">
        <Field label="Principal Investigator">
          <input className={inputCls} value={user?.fullName ?? user?.email ?? ''} disabled />
        </Field>
        <Field label="Co-PIs">
          <CoPIPicker
            staff={staff}
            value={state.coPIs}
            onChange={(v) => set('coPIs', v)}
          />
        </Field>
        <Field label="Division">
          <input className={inputCls} value={state.divisionCode}
            onChange={(e) => set('divisionCode', e.target.value)} />
        </Field>
      </Section>

      <Section title="Technical">
        <Field label="Abstract"><textarea rows={3} className={inputCls} value={state.abstract}
          onChange={(e) => set('abstract', e.target.value)} /></Field>
        <Field label="Problem Statement"><textarea rows={3} className={inputCls}
          value={state.problemStatement}
          onChange={(e) => set('problemStatement', e.target.value)} /></Field>
        <Field label="Objectives"><textarea rows={3} className={inputCls}
          value={state.objectives}
          onChange={(e) => set('objectives', e.target.value)} /></Field>
        <Field label="Expected Outcomes"><textarea rows={3} className={inputCls}
          value={state.expectedOutcomes}
          onChange={(e) => set('expectedOutcomes', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Current TRL (1–9)">
            <input type="number" min={1} max={9} className={inputCls}
              value={state.currentTrl ?? ''}
              onChange={(e) => set('currentTrl', e.target.value === '' ? null : Number(e.target.value))} />
          </Field>
          <Field label="Target TRL (1–9)">
            <input type="number" min={1} max={9} className={inputCls}
              value={state.targetTrl ?? ''}
              onChange={(e) => set('targetTrl', e.target.value === '' ? null : Number(e.target.value))} />
          </Field>
        </div>
      </Section>

      <Section title="Signed Proposal Document">
        {hasSignedDoc && (
          <p className="text-text-muted text-sm mb-2">A signed proposal is already uploaded. Re-upload to replace.</p>
        )}
        <input type="file" accept="application/pdf"
          onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
      </Section>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => handleSave('draft')} isLoading={saving}>
          Save Draft
        </Button>
        <Button onClick={() => handleSave('submit')} isLoading={saving}>
          Submit
        </Button>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-medium text-text mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

function CoPIPicker({
  staff, value, onChange,
}: {
  staff: Array<{ ID: string; StaffName: string }>;
  value: ProposalCoPI[];
  onChange: (v: ProposalCoPI[]) => void;
}) {
  const [selectedId, setSelectedId] = useState('');

  const add = () => {
    if (!selectedId) return;
    const found = staff.find((s) => s.ID === selectedId);
    if (!found) return;
    if (value.some((c) => c.staffId === found.ID)) return;
    onChange([...value, { staffId: found.ID, staffName: found.StaffName }]);
    setSelectedId('');
  };
  const remove = (sid: string) => onChange(value.filter((c) => c.staffId !== sid));

  return (
    <div>
      <div className="flex gap-2">
        <select className={inputCls} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Select staff…</option>
          {staff.map((s) => <option key={s.ID} value={s.ID}>{s.StaffName}</option>)}
        </select>
        <Button type="button" variant="secondary" onClick={add}>Add</Button>
      </div>
      <ul className="mt-2 space-y-1">
        {value.map((c) => (
          <li key={c.staffId} className="flex items-center justify-between text-sm bg-surface-hover px-3 py-1 rounded">
            <span>{c.staffName}</span>
            <button type="button" onClick={() => remove(c.staffId)} className="text-text-muted hover:text-red-500">×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> **Note:** This task uses `useData()` to get the staff list. If the actual `DataContext` exposes staff under a different field name than `staff`, or if `StaffMember.ID` / `StaffMember.StaffName` differ, read `src/contexts/DataContext.tsx` and `src/types/index.ts` and adjust the `CoPIPicker` props accordingly.

- [ ] **Step 12.2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS. Resolve any prop mismatches against the actual `Button`, `Card`, `DataContext`, and `StaffMember` shapes.

- [ ] **Step 12.3: Commit**

```bash
git add src/pages/proposals/ProposalForm.tsx
git commit -m "feat(proposals): create + edit form with section layout"
```

---

## Task 13: Detail Page — `ProposalDetail.tsx`

**Files:**
- Create: `src/pages/proposals/ProposalDetail.tsx`

- [ ] **Step 13.1: Create the detail page**

Create `src/pages/proposals/ProposalDetail.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useProposals } from '../../contexts/ProposalsContext';
import { Card, Badge } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { getDownloadUrl } from '../../lib/proposals/storage';
import {
  STATUS_LABELS, STATUS_BADGE_VARIANT, TERMINAL_STATUSES,
} from '../../lib/proposals/constants';
import { canEditProposal, canUpdateStatus, nextAllowedTransitions } from '../../lib/proposals/permissions';
import StatusUpdateModal from '../../components/proposals/StatusUpdateModal';
import type { Proposal } from '../../types/proposal';

export default function ProposalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getProposal } = useProposals();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false);

  const reload = async () => {
    if (!id) return;
    try {
      setProposal(await getProposal(id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!proposal) return <div className="p-6 text-text-muted">Loading…</div>;

  const editable = user ? canEditProposal(user, proposal) : false;
  const adminMayUpdate = user ? canUpdateStatus(user) : false;
  const transitions = nextAllowedTransitions(proposal.status);
  const showAdminPanel = adminMayUpdate && !TERMINAL_STATUSES.includes(proposal.status);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-text-muted">{proposal.proposalCode}</p>
          <h1 className="text-2xl font-semibold text-text">{proposal.title}</h1>
          {proposal.acronym && <p className="text-text-muted text-sm">({proposal.acronym})</p>}
          <div className="mt-2">
            <Badge variant={STATUS_BADGE_VARIANT[proposal.status]}>
              {STATUS_LABELS[proposal.status]}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {editable && (
            <Button variant="secondary" onClick={() => navigate(`/proposals/${proposal.id}/edit`)}>
              Edit
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-medium text-text mb-3">Summary</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row label="PI" value={proposal.piName} />
          <Row label="Division" value={proposal.divisionCode} />
          <Row label="Fund Type" value={proposal.fundType} />
          <Row label="Sponsor" value={`${proposal.sponsorType} — ${proposal.sponsorName}`} />
          <Row label="Category" value={proposal.projectCategory} />
          <Row label="Domain" value={proposal.domainTheme} />
          <Row label="Start Date" value={proposal.proposedStartDate} />
          <Row label="Duration" value={`${proposal.proposedDurationMonths} months`} />
          <Row label="Requested Budget" value={`₹${proposal.requestedBudget.toLocaleString('en-IN')}`} />
          <Row label="TRL" value={`${proposal.currentTrl ?? '-'} → ${proposal.targetTrl ?? '-'}`} />
        </dl>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-medium text-text">Technical</h2>
        <Block label="Abstract"          text={proposal.abstract} />
        <Block label="Problem Statement" text={proposal.problemStatement} />
        <Block label="Objectives"        text={proposal.objectives} />
        <Block label="Expected Outcomes" text={proposal.expectedOutcomes} />
      </Card>

      {proposal.coPIs && proposal.coPIs.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-medium text-text mb-3">Co-PIs</h2>
          <ul className="text-sm space-y-1">
            {proposal.coPIs.map((c) => <li key={c.staffId}>{c.staffName}</li>)}
          </ul>
        </Card>
      )}

      <Card className="p-4">
        <h2 className="text-sm font-medium text-text mb-3">Documents</h2>
        <ul className="text-sm space-y-1">
          {(proposal.documents ?? []).map((d) => (
            <li key={d.id} className="flex items-center justify-between">
              <span>{d.docType === 'signed_proposal' ? 'Signed Proposal' : 'OM Document'} — {d.fileName}</span>
              <button
                className="text-brand-blue underline"
                onClick={async () => {
                  const url = await getDownloadUrl(d.storagePath);
                  if (url) window.open(url, '_blank');
                }}
              >Download</button>
            </li>
          ))}
          {(!proposal.documents || proposal.documents.length === 0) && (
            <li className="text-text-muted">No documents uploaded.</li>
          )}
        </ul>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-medium text-text mb-3">Status History</h2>
        <ol className="text-sm space-y-2">
          {(proposal.history ?? []).map((h) => (
            <li key={h.id} className="flex items-start gap-3">
              <Badge variant={STATUS_BADGE_VARIANT[h.toStatus]}>{STATUS_LABELS[h.toStatus]}</Badge>
              <div>
                <p className="text-text-muted">{new Date(h.changedAt).toLocaleString('en-IN')}</p>
                {h.payload && Object.keys(h.payload).length > 0 && (
                  <pre className="text-xs text-text-muted whitespace-pre-wrap">
                    {JSON.stringify(h.payload, null, 2)}
                  </pre>
                )}
              </div>
            </li>
          ))}
          {(!proposal.history || proposal.history.length === 0) && (
            <li className="text-text-muted">No status changes yet.</li>
          )}
        </ol>
      </Card>

      {showAdminPanel && (
        <Card className="p-4">
          <h2 className="text-sm font-medium text-text mb-3">Admin: Update Status</h2>
          {transitions.length === 0 ? (
            <p className="text-text-muted text-sm">No admin transitions available from this state.</p>
          ) : (
            <Button onClick={() => setShowStatusModal(true)}>Update Status</Button>
          )}
        </Card>
      )}

      {showStatusModal && (
        <StatusUpdateModal
          proposal={proposal}
          onClose={() => setShowStatusModal(false)}
          onUpdated={async () => { setShowStatusModal(false); await reload(); }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-sm text-text whitespace-pre-wrap">{text || '—'}</p>
    </div>
  );
}
```

- [ ] **Step 13.2: Verify typecheck (will fail until StatusUpdateModal exists)**

```bash
npx tsc --noEmit
```

Expected: FAIL with "Cannot find module './StatusUpdateModal'" until Task 14 lands.

- [ ] **Step 13.3: Commit**

```bash
git add src/pages/proposals/ProposalDetail.tsx
git commit -m "feat(proposals): detail page with summary, documents, history, admin panel"
```

---

## Task 14: Admin Status Update Modal

**Files:**
- Create: `src/components/proposals/StatusUpdateModal.tsx`

- [ ] **Step 14.1: Create the modal**

Create `src/components/proposals/StatusUpdateModal.tsx`:

```typescript
import { useState } from 'react';
import { Card } from '../ui/Cards';
import { Button } from '../ui/Button';
import {
  setUnderReview, requestRevision, rejectProposal, recommendProposal,
  approveProposal, issueOM, archiveProposal, linkProject,
} from '../../lib/proposals/api';
import { uploadProposalDoc } from '../../lib/proposals/storage';
import { nextAllowedTransitions } from '../../lib/proposals/permissions';
import { STATUS_LABELS } from '../../lib/proposals/constants';
import { useData } from '../../contexts/DataContext';
import type { Proposal, ProposalStatus } from '../../types/proposal';

interface Props {
  proposal: Proposal;
  onClose: () => void;
  onUpdated: () => void | Promise<void>;
}

export default function StatusUpdateModal({ proposal, onClose, onUpdated }: Props) {
  const { projects } = useData();
  const transitions = nextAllowedTransitions(proposal.status);
  const [target, setTarget] = useState<ProposalStatus | ''>(transitions[0] ?? '');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  // Per-status fields
  const [reviewBody, setReviewBody] = useState('');
  const [reviewSent, setReviewSent] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(0);
  const [sanctionDate, setSanctionDate] = useState('');
  const [omNumber, setOmNumber] = useState('');
  const [omDate, setOmDate] = useState('');
  const [omFile, setOmFile] = useState<File | null>(null);
  const [projectNo, setProjectNo] = useState('');

  const handleApply = async () => {
    if (!target) return;
    setError('');
    setWorking(true);
    try {
      switch (target) {
        case 'UNDER_REVIEW': {
          const r = await setUnderReview(proposal.id, reviewBody, reviewSent);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        case 'REVISION_REQUESTED': {
          const r = await requestRevision(proposal.id, notes);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        case 'REJECTED': {
          const r = await rejectProposal(proposal.id, reason);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        case 'RECOMMENDED': {
          const r = await recommendProposal(proposal.id);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        case 'APPROVED': {
          const r = await approveProposal(proposal.id, amount, sanctionDate);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        case 'OM_ISSUED': {
          if (!omFile) throw new Error('OM document file is required');
          const up = await uploadProposalDoc(proposal.id, 'om_document', omFile);
          if (!up.ok) throw new Error(up.error);
          const r = await issueOM(proposal.id, omNumber, omDate, up.document.id);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        case 'ARCHIVED': {
          const r = await archiveProposal(proposal.id);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        case 'LINKED': {
          const r = await linkProject(proposal.id, projectNo);
          if (!r.ok) throw new Error(r.error);
          break;
        }
        default:
          throw new Error('Unsupported transition');
      }
      await onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg p-6 space-y-4 bg-surface">
        <h2 className="text-lg font-semibold text-text">Update Status</h2>

        <div>
          <label className="block text-xs text-text-muted mb-1">Next Status</label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as ProposalStatus)}
            className={inputCls}
          >
            {transitions.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {target === 'UNDER_REVIEW' && (
          <>
            <Labeled label="Reviewing Body">
              <input className={inputCls} value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)} />
            </Labeled>
            <Labeled label="Date Sent">
              <input type="date" className={inputCls} value={reviewSent}
                onChange={(e) => setReviewSent(e.target.value)} />
            </Labeled>
          </>
        )}
        {target === 'REVISION_REQUESTED' && (
          <Labeled label="Revision Notes">
            <textarea rows={4} className={inputCls} value={notes}
              onChange={(e) => setNotes(e.target.value)} />
          </Labeled>
        )}
        {target === 'REJECTED' && (
          <Labeled label="Rejection Reason">
            <textarea rows={4} className={inputCls} value={reason}
              onChange={(e) => setReason(e.target.value)} />
          </Labeled>
        )}
        {target === 'APPROVED' && (
          <>
            <Labeled label="Sanctioned Amount (₹)">
              <input type="number" min={0} className={inputCls} value={amount}
                onChange={(e) => setAmount(Number(e.target.value))} />
            </Labeled>
            <Labeled label="Sanction Date">
              <input type="date" className={inputCls} value={sanctionDate}
                onChange={(e) => setSanctionDate(e.target.value)} />
            </Labeled>
          </>
        )}
        {target === 'OM_ISSUED' && (
          <>
            <Labeled label="OM Number">
              <input className={inputCls} value={omNumber}
                onChange={(e) => setOmNumber(e.target.value)} />
            </Labeled>
            <Labeled label="OM Date">
              <input type="date" className={inputCls} value={omDate}
                onChange={(e) => setOmDate(e.target.value)} />
            </Labeled>
            <Labeled label="OM PDF">
              <input type="file" accept="application/pdf"
                onChange={(e) => setOmFile(e.target.files?.[0] ?? null)} />
            </Labeled>
          </>
        )}
        {target === 'LINKED' && (
          <Labeled label="Link to ProjectNo">
            <select className={inputCls} value={projectNo}
              onChange={(e) => setProjectNo(e.target.value)}>
              <option value="">Select…</option>
              {projects.map((p) => (
                <option key={p.ProjectNo} value={p.ProjectNo}>
                  {p.ProjectNo} — {p.ProjectName}
                </option>
              ))}
            </select>
          </Labeled>
        )}

        {error && (
          <div className="text-sm text-red-600">{error}</div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={working}>Cancel</Button>
          <Button onClick={handleApply} isLoading={working} disabled={!target}>Apply</Button>
        </div>
      </Card>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text';

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}
```

- [ ] **Step 14.2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 14.3: Commit**

```bash
git add src/components/proposals/StatusUpdateModal.tsx
git commit -m "feat(proposals): admin status update modal with per-status fields"
```

---

## Task 15: Routes + Nav

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Layout.tsx`

- [ ] **Step 15.1: Add lazy route declarations**

In `src/App.tsx`, add to the existing lazy imports block (alongside the other `const X = lazy(...)` lines):

```typescript
const Proposals      = lazy(() => import('./pages/proposals/Proposals'));
const ProposalForm   = lazy(() => import('./pages/proposals/ProposalForm'));
const ProposalDetail = lazy(() => import('./pages/proposals/ProposalDetail'));
```

- [ ] **Step 15.2: Register routes**

Within the existing `<Route element={<ProtectedRoute />}>` block (where other authenticated routes live), add:

```tsx
<Route path="/proposals"           element={<Proposals />} />
<Route path="/proposals/new"       element={
  <ProtectedRoute allowedRoles={['Scientist']}><ProposalForm /></ProtectedRoute>
} />
<Route path="/proposals/:id"       element={<ProposalDetail />} />
<Route path="/proposals/:id/edit"  element={<ProposalForm />} />
```

- [ ] **Step 15.3: Add nav entry**

In `src/components/layout/Layout.tsx`, inside the `NAV_SECTIONS` array, find the section labelled `'Research Ops'` and append to its `items` array:

```typescript
{
  path: '/proposals',
  label: 'Proposals',
  icon: FileText,
  allowedRoles: ['Scientist', 'HOD', 'DivisionHead', 'Director', 'HRAdmin', 'SystemAdmin', 'MasterAdmin'],
},
```

`FileText` is already imported from `lucide-react` (used by `/recruitment`). If by inspection it is not imported in your version of the file, add it to the import block at the top:

```typescript
import { FileText } from 'lucide-react';
```

- [ ] **Step 15.4: Verify typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/pages/proposals src/components/proposals src/lib/proposals src/contexts/ProposalsContext.tsx src/types/proposal.ts src/utils/proposalMappers.ts
```

Expected: PASS.

- [ ] **Step 15.5: Commit**

```bash
git add src/App.tsx src/components/layout/Layout.tsx
git commit -m "feat(proposals): register routes and add nav entry"
```

---

## Task 16: Full Verification

**Files:** none new

- [ ] **Step 16.1: Run all unit tests**

```bash
npm test
```

Expected: PASS, including the new tests for `permissions` and `validation`. Existing test count rises by the new tests added in Tasks 5 and 6.

- [ ] **Step 16.2: Run full typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 16.3: Run lint**

```bash
npx eslint src/
```

Expected: PASS.

- [ ] **Step 16.4: Build**

```bash
npm run build
```

Expected: PASS. Lazy-loaded chunk for `/proposals/*` produced.

- [ ] **Step 16.5: Manual smoke test in preview**

Apply the migration to the connected Supabase project (`npx supabase db reset` or Studio paste). Then:

1. Open the preview server. Log in as a Scientist account.
2. Navigate to `Proposals`. Verify empty list + visible "New Proposal" button.
3. Create a proposal. Save draft → reopen → re-edit → upload PDF → submit.
4. Log out, log in as an admin user (HRAdmin / SystemAdmin / MasterAdmin). Navigate to the same proposal.
5. Open the Admin panel. Walk the status chain: SUBMITTED → UNDER_REVIEW → RECOMMENDED → APPROVED → OM_ISSUED → LINKED (pick a real `ProjectNo`) or ARCHIVED.
6. Confirm the status history Card on the detail page records every transition with its payload.
7. As a different Scientist (not the owner), confirm the proposal is not visible in the list. (Optional — only if a second scientist account is available.)

If any step fails: identify the failing layer (RLS, RPC, UI) and fix in place. Re-commit.

- [ ] **Step 16.6: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix(proposals): address verification findings"
```

If no fixes needed, skip this step.

---

## Self-Review Notes

Pass over the plan against `docs/superpowers/specs/2026-05-16-project-proposals-design.md`:

- Spec §3 tables + §4 RLS → Task 1 (lays down all four tables, all four RLS policy sets, helper functions).
- Spec §5 state machine + §6 RPCs → Task 2 (all nine RPCs with status validation + history append).
- Spec §7 UI (list/form/detail/admin modal) → Tasks 11, 12, 13, 14.
- Spec §8 file storage (bucket, path convention, signed URL) → Task 2 (bucket + policies), Task 9 (client helpers).
- Spec §9 error handling (toast, optimistic concurrency, illegal transition surfaced) → covered in API wrappers (Task 8) returning `RpcResult`, modal/form catching errors (Tasks 12/14). NOTE: optimistic concurrency on edit (`If-Match` style) from spec §9 is **not** implemented in this plan; it is a deferred enhancement — the form simply overwrites on save. Flag at execution time if the user wants it added.
- Spec §10 testing → Tasks 5 (permissions) and 6 (validation) unit-test the pure logic. Integration RPC sequence + RLS tests from spec §10 are **not** scripted here because the codebase has no Supabase integration-test harness; verified manually in Task 16.5. Flag at execution time if a test harness should be added first.
- Spec §11 open decisions: starter dropdown lists supplied in Task 4 (`constants.ts`). User may revise before implementation.
- Spec §12 out-of-scope items: respected — no notifications, no reviewer assignment, no document versioning UI.

Type consistency check:
- `Proposal` field names used in `ProposalsContext`, pages, modal, mappers — all match `src/types/proposal.ts`.
- RPC argument names (`p_id`, `p_body`, etc.) match between SQL definitions in Task 2 and TypeScript callers in Task 8.
- `nextAllowedTransitions` consumed identically in `ProposalDetail` and `StatusUpdateModal`.

Placeholder scan: none.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-16-project-proposals.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
