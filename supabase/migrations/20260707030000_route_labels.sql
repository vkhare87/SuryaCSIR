-- P6: router quality loop (docs/IMPROVEMENT-PROPOSALS.md).
-- Admin-labeled correct routes for downvoted queries. The query API injects
-- recent labels as few-shot examples into the route prompt; eval/export_labels.py
-- appends them to the gold set.

create table public.route_labels (
  query_id      uuid primary key references public.query_log(id) on delete cascade,
  question      text not null,
  correct_route text not null check (correct_route in ('structured', 'document', 'hybrid')),
  created_at    timestamptz not null default now()
);

alter table public.route_labels enable row level security;

-- Any signed-in user's queries may become few-shots, so reads are
-- institute-internal (same stance as collection_indexes). Only admins label.
create policy route_labels_read on public.route_labels
  for select using (auth.uid() is not null);
create policy route_labels_admin_insert on public.route_labels
  for insert with check (
    public.proposals_caller_has_role('SystemAdmin')
    or public.proposals_caller_has_role('MasterAdmin')
  );
