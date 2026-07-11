-- 20260707000000_query_log_latency.sql
-- Decision-preparation-time baseline: record end-to-end answer latency per query.
-- Column-only change; query_log RLS policies are row-level and unchanged.

alter table public.query_log add column if not exists latency_ms integer;
