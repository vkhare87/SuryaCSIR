-- ════════════════════════════════════════════════════════════════════
-- SURYA — Wipe seed data (preserves schema + auth users)
-- ════════════════════════════════════════════════════════════════════
-- Run this in Supabase Studio SQL Editor (as postgres) BEFORE re-running
-- supabase/seed.sql. TRUNCATE ... CASCADE clears all seed-data tables in
-- one shot. Auth tables and user_roles / user_profiles are untouched, so
-- your SystemAdmin login still works.
-- ════════════════════════════════════════════════════════════════════

TRUNCATE TABLE
    public.ticket_events,
    public.ticket_responses,
    public.tickets,
    public.helpdesk_routing,
    public.meeting_documents,
    public.action_items,
    public.agenda_items,
    public.meetings,
    public.committee_members,
    public.committees,
    public.audit_log,
    public.appraisal_cycles,
    public.ip_intelligence,
    public.scientific_outputs,
    public.contract_staff,
    public.project_staff,
    public.equipment,
    public.labs,
    public.phd_students,
    public.projects,
    public.staff,
    public.divisions
RESTART IDENTITY CASCADE;
