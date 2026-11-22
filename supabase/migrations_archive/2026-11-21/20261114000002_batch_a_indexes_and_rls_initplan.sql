-- ============================================================
-- 20261114000002_batch_a_indexes_and_rls_initplan
-- Database Optimization Plan — Batch A (non-breaking, additive):
--   1. Drop 6 strictly redundant/duplicate indexes.
--   2. Add covering B-tree indexes for all 122 unindexed foreign keys
--      (guarded via information_schema.columns so both branch PGlite
--      tests and the live Supabase database apply cleanly).
--   3. Add targeted partial and composite indexes for hot query paths.
--   4. Fix all 5 auth_rls_initplan policies and split overlapping
--      admin FOR ALL policies on labs, irins_profiles, irins_sync_log.
-- ============================================================

-- ── 1. Drop strictly redundant indexes ──────────────────────────────────────
DROP INDEX IF EXISTS public.helpdesk_routing_category_idx;
DROP INDEX IF EXISTS public.tickets_token_idx;
DROP INDEX IF EXISTS public.tickets_assigned_to_idx;
DROP INDEX IF EXISTS public.pms_notifications_user_id_idx;
DROP INDEX IF EXISTS public.pms_evaluations_report_id_idx;
DROP INDEX IF EXISTS public.pms_reports_cycle_id_idx;

-- ── 2. Covering indexes for unindexed foreign keys (122 FKs) ────────────────
-- Composite index: covers proposals_created_by_fkey AND (created_by, status) lookups.
CREATE INDEX IF NOT EXISTS proposals_created_by_status_fk_idx
    ON public.proposals (created_by, status);

DO $$
DECLARE
    rec record;
BEGIN
    FOR rec IN
        SELECT * FROM (VALUES
            ('access_requests_reviewed_by_fk_idx',                        'access_requests',                 'reviewed_by'),
            ('acting_assignments_created_by_fk_idx',                      'acting_assignments',              'created_by'),
            ('acting_assignments_division_code_fk_idx',                   'acting_assignments',              'division_code'),
            ('acting_assignments_principal_user_id_fk_idx',               'acting_assignments',              'principal_user_id'),
            ('ai_action_log_notification_id_fk_idx',                      'ai_action_log',                   'notification_id'),
            ('coi_declarations_decided_by_fk_idx',                        'coi_declarations',                'decided_by'),
            ('coi_declarations_member_user_id_fk_idx',                    'coi_declarations',                'member_user_id'),
            ('contribution_request_events_actor_id_fk_idx',               'contribution_request_events',     'actor_id'),
            ('contribution_requests_requested_by_fk_idx',                 'contribution_requests',           'requested_by'),
            ('csir_rules_created_by_fk_idx',                              'csir_rules',                      'created_by'),
            ('data_stewards_user_id_fk_idx',                              'data_stewards',                   'user_id'),
            ('documents_owner_id_fk_idx',                                 'documents',                       'owner_id'),
            ('equipment_usage_log_logged_by_fk_idx',                      'equipment_usage_log',             'logged_by'),
            ('equipment_usage_log_project_id_fk_idx',                     'equipment_usage_log',             'project_id'),
            ('equipment_usage_log_user_staff_id_fk_idx',                  'equipment_usage_log',             'user_staff_id'),
            ('expertise_terms_created_by_fk_idx',                         'expertise_terms',                 'created_by'),
            ('expertise_terms_merged_into_fk_idx',                        'expertise_terms',                 'merged_into'),
            ('expertise_terms_parent_id_fk_idx',                          'expertise_terms',                 'parent_id'),
            ('feature_controls_updated_by_fk_idx',                        'feature_controls',                'updated_by'),
            ('feature_grants_granted_by_fk_idx',                          'feature_grants',                  'granted_by'),
            ('harvested_imports_reviewed_by_fk_idx',                      'harvested_imports',               'reviewed_by'),
            ('holidays_created_by_fk_idx',                                'holidays',                        'created_by'),
            ('import_events_uploaded_by_fk_idx',                          'import_events',                   'uploaded_by'),
            ('import_field_mappings_confirmed_by_fk_idx',                 'import_field_mappings',           'confirmed_by'),
            ('ip_inventors_confirmed_by_fk_idx',                          'ip_inventors',                    'confirmed_by'),
            ('labs_div_code_fk_idx',                                      'labs',                            'div_code'),
            ('output_authors_confirmed_by_fk_idx',                        'output_authors',                  'confirmed_by'),
            ('pms_annexures_report_id_fk_idx',                            'pms_annexures',                   'report_id'),
            ('pms_awp_revisions_decided_by_fk_idx',                       'pms_awp_revisions',               'decided_by'),
            ('pms_awp_revisions_initiated_by_fk_idx',                     'pms_awp_revisions',               'initiated_by'),
            ('pms_awps_approved_by_fk_idx',                               'pms_awps',                        'approved_by'),
            ('pms_awps_reviewing_officer_id_fk_idx',                      'pms_awps',                        'reviewing_officer_id'),
            ('pms_awps_scientist_user_id_fk_idx',                         'pms_awps',                        'scientist_user_id'),
            ('pms_committee_decisions_decided_by_fk_idx',                 'pms_committee_decisions',         'decided_by'),
            ('pms_condonations_condoned_by_fk_idx',                       'pms_condonations',                'condoned_by'),
            ('pms_empowered_committee_members_user_id_fk_idx',            'pms_empowered_committee_members', 'user_id'),
            ('pms_evaluation_committee_members_user_id_fk_idx',           'pms_evaluation_committee_members','user_id'),
            ('pms_evaluation_committees_cycle_id_fk_idx',                 'pms_evaluation_committees',       'cycle_id'),
            ('pms_grievance_members_user_id_fk_idx',                      'pms_grievance_members',           'user_id'),
            ('pms_notifications_report_id_fk_idx',                        'pms_notifications',               'report_id'),
            ('pms_panel_scores_committee_id_fk_idx',                      'pms_panel_scores',                'committee_id'),
            ('pms_panel_scores_recorded_by_fk_idx',                       'pms_panel_scores',                'recorded_by'),
            ('pms_part1_prefilled_by_fk_idx',                             'pms_part1',                       'prefilled_by'),
            ('pms_part1_verified_by_fk_idx',                              'pms_part1',                       'verified_by'),
            ('pms_reports_committee_id_fk_idx',                           'pms_reports',                     'committee_id'),
            ('pms_representations_resolved_by_fk_idx',                    'pms_representations',             'resolved_by'),
            ('pms_representations_scientist_id_fk_idx',                   'pms_representations',             'scientist_id'),
            ('project_budget_lines_change_request_id_fk_idx',             'project_budget_lines',            'change_request_id'),
            ('project_change_requests_created_by_fk_idx',                 'project_change_requests',         'created_by'),
            ('project_change_requests_request_document_id_fk_idx',        'project_change_requests',         'request_document_id'),
            ('project_change_steps_decided_by_fk_idx',                    'project_change_steps',            'decided_by'),
            ('project_change_steps_document_id_fk_idx',                   'project_change_steps',            'document_id'),
            ('project_change_steps_meeting_id_fk_idx',                    'project_change_steps',            'meeting_id'),
            ('project_completion_reports_created_by_fk_idx',              'project_completion_reports',      'created_by'),
            ('project_completion_reports_document_id_fk_idx',             'project_completion_reports',      'document_id'),
            ('project_completion_reports_published_document_id_fk_idx',   'project_completion_reports',      'published_document_id'),
            ('project_completion_steps_decided_by_fk_idx',                'project_completion_steps',        'decided_by'),
            ('project_completion_steps_document_id_fk_idx',               'project_completion_steps',        'document_id'),
            ('project_documents_uploaded_by_fk_idx',                      'project_documents',               'uploaded_by'),
            ('project_engagements_created_by_fk_idx',                     'project_engagements',             'created_by'),
            ('project_engagements_project_id_fk_idx',                     'project_engagements',             'project_id'),
            ('project_engagements_selection_id_fk_idx',                   'project_engagements',             'selection_id'),
            ('project_expenditure_document_id_fk_idx',                    'project_expenditure',             'document_id'),
            ('project_expenditure_recorded_by_fk_idx',                    'project_expenditure',             'recorded_by'),
            ('project_fund_receipts_document_id_fk_idx',                  'project_fund_receipts',           'document_id'),
            ('project_fund_receipts_recorded_by_fk_idx',                  'project_fund_receipts',           'recorded_by'),
            ('project_ip_agreements_document_id_fk_idx',                  'project_ip_agreements',           'document_id'),
            ('project_ip_agreements_project_id_fk_idx',                   'project_ip_agreements',           'project_id'),
            ('project_ip_agreements_recorded_by_fk_idx',                  'project_ip_agreements',           'recorded_by'),
            ('project_labs_added_by_fk_idx',                              'project_labs',                    'added_by'),
            ('project_labs_rc_approval_document_id_fk_idx',               'project_labs',                    'rc_approval_document_id'),
            ('project_milestones_created_by_fk_idx',                      'project_milestones',              'created_by'),
            ('project_milestones_document_id_fk_idx',                     'project_milestones',              'document_id'),
            ('project_report_history_changed_by_fk_idx',                  'project_report_history',          'changed_by'),
            ('project_report_history_report_id_fk_idx',                   'project_report_history',          'report_id'),
            ('project_reports_reviewed_by_fk_idx',                        'project_reports',                 'reviewed_by'),
            ('project_reports_slot_id_fk_idx',                            'project_reports',                 'slot_id'),
            ('project_review_slots_meeting_id_fk_idx',                    'project_review_slots',            'meeting_id'),
            ('project_review_slots_minutes_document_id_fk_idx',           'project_review_slots',            'minutes_document_id'),
            ('project_review_slots_recorded_by_fk_idx',                   'project_review_slots',            'recorded_by'),
            ('project_review_slots_report_id_fk_idx',                     'project_review_slots',            'report_id'),
            ('project_schemes_leader_user_id_fk_idx',                     'project_schemes',                 'leader_user_id'),
            ('project_schemes_review_committee_id_fk_idx',                'project_schemes',                 'review_committee_id'),
            ('project_selections_created_by_fk_idx',                      'project_selections',              'created_by'),
            ('project_selections_minutes_document_id_fk_idx',             'project_selections',              'minutes_document_id'),
            ('project_selections_project_id_fk_idx',                      'project_selections',              'project_id'),
            ('project_staff_person_id_fk_idx',                            'project_staff',                   'person_id'),
            ('project_staff_leave_engagement_id_fk_idx',                  'project_staff_leave',             'engagement_id'),
            ('project_staff_leave_recorded_by_fk_idx',                    'project_staff_leave',             'recorded_by'),
            ('project_stage_deliverables_document_id_fk_idx',             'project_stage_deliverables',      'document_id'),
            ('project_stage_deliverables_done_by_fk_idx',                 'project_stage_deliverables',      'done_by'),
            ('project_stage_deliverables_item_key_fk_idx',                'project_stage_deliverables',      'item_key'),
            ('projects_legacy_completed_by_fk_idx',                       'projects',                        'legacy_completed_by'),
            ('projects_track_fk_idx',                                     'projects',                        'track'),
            ('proposal_documents_uploaded_by_fk_idx',                     'proposal_documents',              'uploaded_by'),
            ('proposal_notes_author_id_fk_idx',                           'proposal_notes',                  'author_id'),
            ('proposal_review_comments_author_id_fk_idx',                 'proposal_review_comments',        'author_id'),
            ('proposal_review_steps_decided_by_fk_idx',                   'proposal_review_steps',           'decided_by'),
            ('proposal_review_steps_document_id_fk_idx',                  'proposal_review_steps',           'document_id'),
            ('proposal_review_steps_meeting_id_fk_idx',                   'proposal_review_steps',           'meeting_id'),
            ('proposal_status_history_changed_by_fk_idx',                 'proposal_status_history',         'changed_by'),
            ('proposal_versions_created_by_fk_idx',                       'proposal_versions',               'created_by'),
            ('proposals_last_status_change_by_fk_idx',                    'proposals',                       'last_status_change_by'),
            ('proposals_submitted_version_id_fk_idx',                     'proposals',                       'submitted_version_id'),
            ('proposals_track_fk_idx',                                    'proposals',                       'track'),
            ('publication_author_consents_staff_id_fk_idx',               'publication_author_consents',     'staff_id'),
            ('publication_files_cleared_by_fk_idx',                       'publication_files',               'cleared_by'),
            ('publication_files_created_by_fk_idx',                       'publication_files',               'created_by'),
            ('publication_files_output_id_fk_idx',                        'publication_files',               'output_id'),
            ('publication_files_similarity_report_document_id_fk_idx',    'publication_files',               'similarity_report_document_id'),
            ('recruitment_events_actor_fk_idx',                           'recruitment_events',              'actor'),
            ('recruitment_events_document_id_fk_idx',                     'recruitment_events',              'document_id'),
            ('sanctioned_post_events_actor_fk_idx',                       'sanctioned_post_events',          'actor'),
            ('staff_career_events_created_by_fk_idx',                     'staff_career_events',             'created_by'),
            ('staff_expertise_added_by_fk_idx',                           'staff_expertise',                 'added_by'),
            ('staff_profile_changes_user_id_fk_idx',                      'staff_profile_changes',           'user_id'),
            ('ticket_events_actor_id_fk_idx',                             'ticket_events',                   'actor_id'),
            ('ticket_responses_author_id_fk_idx',                         'ticket_responses',                'author_id'),
            ('vacancy_advertisements_created_by_fk_idx',                  'vacancy_advertisements',          'created_by'),
            ('vacancy_posts_advertisement_id_fk_idx',                     'vacancy_posts',                   'advertisement_id'),
            ('vacancy_posts_sanctioned_post_id_fk_idx',                   'vacancy_posts',                   'sanctioned_post_id')
        ) AS t(idx_name, tbl, col_name)
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = rec.tbl
              AND column_name = rec.col_name
        ) THEN
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)',
                rec.idx_name, rec.tbl, rec.col_name
            );
        END IF;
    END LOOP;
END $$;

-- ── 3. Targeted hot-path, composite & partial indexes ───────────────────────
CREATE INDEX IF NOT EXISTS documents_ingest_processing_idx
    ON public.documents (processing_started_at)
    WHERE ingest_status = 'processing';

CREATE INDEX IF NOT EXISTS documents_status_tier_idx
    ON public.documents (ingest_status, access_tier);

CREATE INDEX IF NOT EXISTS documents_division_code_idx
    ON public.documents (division_code)
    WHERE division_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_user_open_idx
    ON public.notifications (user_id, created_at DESC)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS pms_notifications_user_unread_idx
    ON public.pms_notifications (user_id, created_at DESC)
    WHERE NOT read;

CREATE INDEX IF NOT EXISTS projects_division_code_idx
    ON public.projects ("DivisionCode");

CREATE INDEX IF NOT EXISTS staff_division_idx
    ON public.staff ("Division");

CREATE INDEX IF NOT EXISTS staff_reporting_id_idx
    ON public.staff ("ReportingID")
    WHERE "ReportingID" IS NOT NULL;

CREATE INDEX IF NOT EXISTS phd_students_division_idx
    ON public.phd_students ("DivisionCode");

CREATE INDEX IF NOT EXISTS scientific_outputs_division_year_idx
    ON public.scientific_outputs (division_code, year);

CREATE INDEX IF NOT EXISTS pms_reports_status_idx
    ON public.pms_reports (status);

CREATE INDEX IF NOT EXISTS pms_evaluations_evaluator_status_idx
    ON public.pms_evaluations (evaluator_id, status);

CREATE INDEX IF NOT EXISTS pms_awps_reporting_year_status_idx
    ON public.pms_awps (reporting_year, status);

-- ── 4. Fix auth_rls_initplan & overlapping write/service policies ───────────
-- public.labs
DROP POLICY IF EXISTS labs_read_authenticated ON public.labs;
DROP POLICY IF EXISTS labs_admin_write ON public.labs;
CREATE POLICY labs_read_authenticated ON public.labs
    FOR SELECT TO authenticated
    USING (true);
CREATE POLICY labs_admin_insert ON public.labs
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
CREATE POLICY labs_admin_update ON public.labs
    FOR UPDATE TO authenticated
    USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
CREATE POLICY labs_admin_delete ON public.labs
    FOR DELETE TO authenticated
    USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

-- public.irins_profiles
DROP POLICY IF EXISTS irins_profiles_read_authenticated ON public.irins_profiles;
DROP POLICY IF EXISTS irins_profiles_admin_write ON public.irins_profiles;
DROP POLICY IF EXISTS irins_profiles_service_write ON public.irins_profiles;
CREATE POLICY irins_profiles_read_authenticated ON public.irins_profiles
    FOR SELECT TO authenticated
    USING (true);
CREATE POLICY irins_profiles_admin_insert ON public.irins_profiles
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
CREATE POLICY irins_profiles_admin_update ON public.irins_profiles
    FOR UPDATE TO authenticated
    USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
CREATE POLICY irins_profiles_admin_delete ON public.irins_profiles
    FOR DELETE TO authenticated
    USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
CREATE POLICY irins_profiles_service_write ON public.irins_profiles
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- public.irins_sync_log
DROP POLICY IF EXISTS irins_sync_log_read_authenticated ON public.irins_sync_log;
DROP POLICY IF EXISTS irins_sync_log_admin_write ON public.irins_sync_log;
DROP POLICY IF EXISTS irins_sync_log_service_write ON public.irins_sync_log;
CREATE POLICY irins_sync_log_read_authenticated ON public.irins_sync_log
    FOR SELECT TO authenticated
    USING (true);
CREATE POLICY irins_sync_log_admin_insert ON public.irins_sync_log
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
CREATE POLICY irins_sync_log_admin_update ON public.irins_sync_log
    FOR UPDATE TO authenticated
    USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
CREATE POLICY irins_sync_log_admin_delete ON public.irins_sync_log
    FOR DELETE TO authenticated
    USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
CREATE POLICY irins_sync_log_service_write ON public.irins_sync_log
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
