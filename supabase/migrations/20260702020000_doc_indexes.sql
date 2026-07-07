-- RAG ingestion index store (Overhaul T4).
-- One row per indexed document: the PageIndex tree JSON built by the
-- server-side worker (service role). Read is gated to whoever can read the
-- parent document; only the worker (service role) writes.

create table public.doc_indexes (
  document_id uuid primary key references public.documents(id) on delete cascade,
  tree        jsonb not null,
  model       text  not null,
  page_count  int   not null default 0,
  built_at    timestamptz not null default now()
);

alter table public.doc_indexes enable row level security;

create policy doc_indexes_read on public.doc_indexes
  for select using (
    exists (
      select 1 from public.documents d
      where d.id = doc_indexes.document_id
        and public.documents_can_read(d)
    )
  );
-- No client write policy: service role (worker) bypasses RLS.

-- Admin requeue: reset a document into the ingest queue. SECURITY DEFINER so
-- the client never patches documents.ingest_status directly.
create or replace function public.rag_requeue_document(p_doc_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.proposals_caller_has_role('SystemAdmin')
    or public.proposals_caller_has_role('MasterAdmin')
  ) then
    raise exception 'not authorized';
  end if;
  update public.documents
     set ingest_status = 'pending', ingest_error = null
   where id = p_doc_id;
end;
$$;

revoke all on function public.rag_requeue_document(uuid) from public;
grant execute on function public.rag_requeue_document(uuid) to authenticated;
