-- One-off data cleanup: ticket inserted by the 2026-07-18 UX drive through
-- the pre-lock anon RPC hole. Data-only (no schema) — run via psql against
-- the linked project (connection string: Dashboard → Settings → Database).
DELETE FROM public.ticket_events
 WHERE ticket_id = '2a47b1cb-c300-4bfd-8271-bb257a73ee53';
DELETE FROM public.tickets
 WHERE id = '2a47b1cb-c300-4bfd-8271-bb257a73ee53';
