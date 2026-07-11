-- P5: ingest retry / dead-letter (docs/IMPROVEMENT-PROPOSALS.md).
-- Worker auto-retries failed docs up to 3 attempts; after that the doc is a
-- dead letter until an admin requeues it (requeue resets the counter).

alter table public.documents
  add column ingest_attempts int not null default 0;

-- Redefine requeue RPCs so a manual requeue restarts the retry budget.
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
     set ingest_status = 'pending', ingest_error = null, ingest_attempts = 0
   where id = p_doc_id;
end;
$$;

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
     set ingest_status = 'pending', ingest_error = null, ingest_attempts = 0
   where ingest_status in ('indexed', 'failed');
  get diagnostics n = row_count;
  return n;
end;
$$;
