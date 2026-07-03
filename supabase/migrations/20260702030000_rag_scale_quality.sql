-- RAG scale & quality (Overhaul T6): query log + feedback, collection indexes,
-- bulk re-index tooling.

-- ---------- Query log ----------
-- One row per Ask SURYA question, owned by the caller. Inserted through the
-- caller's scoped client (RLS, no service key). Feedback is an owner update.
create table public.query_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) default auth.uid(),
  question    text not null,
  mode        text not null,
  answer      text not null,
  citations   jsonb not null default '[]'::jsonb,
  feedback    smallint check (feedback in (-1, 1)),
  created_at  timestamptz not null default now()
);

create index query_log_user_idx on public.query_log (user_id, created_at desc);

alter table public.query_log enable row level security;

create policy query_log_owner_insert on public.query_log
  for insert with check (user_id = auth.uid());
create policy query_log_owner_update on public.query_log
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy query_log_read on public.query_log
  for select using (
    user_id = auth.uid()
    or public.proposals_caller_has_role('SystemAdmin')
    or public.proposals_caller_has_role('MasterAdmin')
  );

-- ---------- Collection indexes ----------
-- Per-collection (keyed by entity_type) document-summary rollup for
-- cross-document traversal. Built by the service-role worker.
create table public.collection_indexes (
  collection_key text primary key,
  title          text not null,
  summary        text not null,
  document_count int not null default 0,
  model          text not null,
  built_at       timestamptz not null default now()
);

alter table public.collection_indexes enable row level security;

-- Non-confidential rollups: any authenticated user may read. Only service role writes.
create policy collection_indexes_read on public.collection_indexes
  for select using (auth.uid() is not null);

-- ---------- Bulk re-index (admin) ----------
create or replace function public.rag_requeue_all()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not (
    public.proposals_caller_has_role('SystemAdmin')
    or public.proposals_caller_has_role('MasterAdmin')
  ) then
    raise exception 'not authorized';
  end if;
  update public.documents
     set ingest_status = 'pending', ingest_error = null
   where ingest_status in ('indexed', 'failed');
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.rag_requeue_all() from public;
grant execute on function public.rag_requeue_all() to authenticated;
