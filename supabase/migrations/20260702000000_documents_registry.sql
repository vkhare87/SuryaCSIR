-- Unified Document Registry (Overhaul T1)
-- One row per institutional document, regardless of which module produced it.
-- Files stay in their module buckets (proposal-documents, committee-docs,
-- annexures) — registry rows point at bucket+path. New modules use the
-- shared 'documents' bucket. `ingest_status` doubles as the RAG ingestion
-- queue consumed by the server-side indexing worker (service role).

-- ---------- Table ----------
create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text not null,   -- 'proposal' | 'meeting' | 'pms_report' | 'publication' | 'staff_profile' | 'project_report' | ...
  entity_id      text not null,   -- parent PK as text (HR/PMS key types differ)
  doc_type       text not null,   -- module-specific subtype (e.g. 'signed_proposal', 'annexure', 'minutes')
  title          text not null,
  storage_bucket text not null,
  storage_path   text not null,
  file_name      text not null,
  file_size      bigint not null default 0,
  mime_type      text not null default 'application/pdf',
  owner_id       uuid not null references auth.users(id),
  division_code  text,
  access_tier    text not null default 'institute'
                 check (access_tier in ('institute','division','owner','confidential')),
  ingest_status  text not null default 'pending'
                 check (ingest_status in ('pending','processing','indexed','failed','skipped')),
  ingest_error   text,
  created_at     timestamptz not null default now()
);

create index documents_entity_idx on public.documents (entity_type, entity_id);
create index documents_ingest_pending_idx on public.documents (created_at)
  where ingest_status = 'pending';
create unique index documents_bucket_path_idx on public.documents (storage_bucket, storage_path);

-- ---------- RLS ----------
alter table public.documents enable row level security;

-- Read rule per tier. Reuses the generic role/division helpers shipped with
-- the proposals migration (they read user_roles/user_profiles, nothing
-- proposal-specific).
--   owner        -> owner + admins + Director
--   confidential -> owner + admins + Director (same as owner; distinct tier
--                   so the RAG layer can index it into a restricted corpus)
--   division     -> above + same-division users
--   institute    -> any authenticated user
create or replace function public.documents_can_read(d public.documents)
returns boolean
language sql stable
as $$
  select
    d.owner_id = auth.uid()
    or public.proposals_caller_has_role('HRAdmin')
    or public.proposals_caller_has_role('SystemAdmin')
    or public.proposals_caller_has_role('MasterAdmin')
    or public.proposals_caller_has_role('Director')
    or (d.access_tier = 'institute' and auth.uid() is not null)
    or (d.access_tier = 'division'
        and d.division_code is not null
        and d.division_code = public.proposals_caller_division());
$$;

create policy documents_select on public.documents
  for select using (public.documents_can_read(documents));

create policy documents_insert on public.documents
  for insert with check (owner_id = auth.uid());

-- Owner may remove own registry row (e.g. deleting an annexure); admins too.
create policy documents_delete on public.documents
  for delete using (
    owner_id = auth.uid()
    or public.proposals_caller_has_role('SystemAdmin')
    or public.proposals_caller_has_role('MasterAdmin')
  );

-- Updates (ingest status transitions) come from the indexing worker via the
-- service role, which bypasses RLS. Admins may retry failed ingests from the UI.
create policy documents_update_admin on public.documents
  for update using (
    public.proposals_caller_has_role('SystemAdmin')
    or public.proposals_caller_has_role('MasterAdmin')
  );

-- ---------- Shared bucket for new modules ----------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Objects readable iff the caller can read the owning registry row.
create policy documents_storage_select on storage.objects
  for select using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_bucket = 'documents'
        and d.storage_path = name
        and public.documents_can_read(d)
    )
  );

-- Any authenticated user may upload; the object stays unreadable until a
-- registry row exists, and the uploader must own that row.
create policy documents_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'documents' and auth.uid() is not null
  );

create policy documents_storage_delete on storage.objects
  for delete using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_bucket = 'documents'
        and d.storage_path = name
        and (d.owner_id = auth.uid()
             or public.proposals_caller_has_role('SystemAdmin')
             or public.proposals_caller_has_role('MasterAdmin'))
    )
  );
