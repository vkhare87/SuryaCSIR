-- P2: per-page source text for answer synthesis (docs/IMPROVEMENT-PROPOSALS.md).
-- One row per page per document, written by the ingest worker (service role).
-- Query time fetches only the picked nodes' page ranges, so answers are built
-- from source text instead of node summaries. Read gate mirrors doc_indexes.

create table public.doc_pages (
  document_id uuid not null references public.documents(id) on delete cascade,
  page        int  not null,
  text        text not null default '',
  primary key (document_id, page)
);

alter table public.doc_pages enable row level security;

create policy doc_pages_read on public.doc_pages
  for select using (
    exists (
      select 1 from public.documents d
      where d.id = doc_pages.document_id
        and public.documents_can_read(d)
    )
  );
-- No client write policy: service role (worker) bypasses RLS.
