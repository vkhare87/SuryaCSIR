-- ============================================================================
-- Migration: 20261114000003_batch_b_functions_rls_and_rpcs
-- Purpose  : Batch B database hardening & performance optimizations:
--              1. Sync early FOR UPDATE lock fixes onto live pms_save_awp_activities
--                 and proposal_save_copis RPCs.
--              2. Pin search_path = public on all 25 helper/trigger functions
--                 flagged by Security Advisor (function_search_path_mutable).
--              3. Revoke direct authenticated EXECUTE on internal route_ticket()
--                 and fix auth.uid() initplan on storage documents_storage_delete.
--              4. Add remaining hot-path, composite, partial, & trigram indexes.
--              5. Split remaining overlapping FOR ALL write policies across 30
--                 tables to eliminate multiple_permissive_policies warnings.
--              6. Add list_combined_audit_logs(), rag_monitor_summary(), and
--                 enrich admin_list_users() with profile status fields so
--                 admin/monitor UIs avoid max_rows=1000 caps & client-side joins.
-- ============================================================================

-- ── 1. Sync early FOR UPDATE lock order (from 20261114000001) ───────────────
CREATE OR REPLACE FUNCTION public.pms_save_awp_activities(
    p_report_id  uuid,
    p_activities jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Report not found';
    END IF;
    IF v_report.scientist_id <> (SELECT auth.uid()) THEN
        RAISE EXCEPTION 'Not your report';
    END IF;
    IF v_report.status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Activities can only be saved on a DRAFT report';
    END IF;
    IF p_activities IS NOT NULL AND jsonb_typeof(p_activities) <> 'array' THEN
        RAISE EXCEPTION 'p_activities must be a JSON array';
    END IF;

    DELETE FROM public.pms_awp_activities WHERE report_id = p_report_id;

    IF jsonb_array_length(coalesce(p_activities, '[]'::jsonb)) > 0 THEN
        INSERT INTO public.pms_awp_activities (
            report_id, nature_of_activity, role, time_committed_percentage, milestones
        )
        SELECT p_report_id,
               x.nature_of_activity,
               x.role,
               x.time_committed_percentage,
               coalesce(x.milestones, '[]'::jsonb)
          FROM jsonb_to_recordset(p_activities) AS x(
              nature_of_activity text,
              role text,
              time_committed_percentage numeric,
              milestones jsonb
          );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_save_awp_activities(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pms_save_awp_activities(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.proposal_save_copis(
    p_proposal_id uuid,
    p_copis       jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_p public.proposals%ROWTYPE;
BEGIN
    SELECT * INTO v_p FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Proposal not found';
    END IF;
    IF v_p.created_by <> (SELECT auth.uid()) THEN
        RAISE EXCEPTION 'Not your proposal';
    END IF;
    IF v_p.status NOT IN ('DRAFT', 'REVISION_REQUESTED', 'RETURNED') THEN
        RAISE EXCEPTION 'Co-PIs can only be modified while DRAFT or REVISION_REQUESTED';
    END IF;
    IF p_copis IS NOT NULL AND jsonb_typeof(p_copis) <> 'array' THEN
        RAISE EXCEPTION 'p_copis must be a JSON array';
    END IF;

    DELETE FROM public.proposal_copis WHERE proposal_id = p_proposal_id;

    IF jsonb_array_length(coalesce(p_copis, '[]'::jsonb)) > 0 THEN
        INSERT INTO public.proposal_copis (proposal_id, staff_id, staff_name)
        SELECT p_proposal_id, x.staff_id, x.staff_name
          FROM jsonb_to_recordset(p_copis) AS x(staff_id text, staff_name text);
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.proposal_save_copis(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposal_save_copis(uuid, jsonb) TO authenticated, service_role;

-- ── 2. Pin search_path on all SECURITY INVOKER helper / trigger functions ──
DO $$
DECLARE
    v_sig text;
    v_sigs constant text[] := ARRAY[
        'public.calendar_events_set_updated_at()',
        'public.caller_active_role()',
        'public.caller_division()',
        'public.caller_email()',
        'public.caller_has_role(text)',
        'public.caller_in_division(text)',
        'public.caller_is_admin()',
        'public.caller_is_director()',
        'public.caller_is_div_manager()',
        'public.caller_is_finance()',
        'public.caller_sees_all_personnel()',
        'public.pms_awp_content(public.pms_awps)',
        'public.pms_awp_director_staff_id()',
        'public.pms_awp_notify(text, text, text, text)',
        'public.pms_awp_redact_projects(jsonb)',
        'public.pms_awp_total(jsonb)',
        'public.pms_can_read_report_path(text)',
        'public.pms_deadline(uuid, text)',
        'public.pms_set_report_track()',
        'public.pms_set_updated_at()',
        'public.project_reports_can_review(public.project_reports)',
        'public.proposals_caller_division()',
        'public.proposals_caller_has_role(text)',
        'public.proposals_caller_is_admin()',
        'public.set_updated_at()'
    ];
BEGIN
    FOREACH v_sig IN ARRAY v_sigs LOOP
        IF to_regprocedure(v_sig) IS NOT NULL THEN
            EXECUTE format('ALTER FUNCTION %s SET search_path = public', v_sig);
        END IF;
    END LOOP;
END $$;

-- ── 3. Internal helper lockdown & storage policy initplan fix ─────────────
DO $$
BEGIN
    IF to_regprocedure('public.route_ticket(text, uuid)') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.route_ticket(text, uuid) FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.route_ticket(text, uuid) TO service_role;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'storage' AND table_name = 'objects'
    ) THEN
        DROP POLICY IF EXISTS documents_storage_delete ON storage.objects;
        CREATE POLICY documents_storage_delete ON storage.objects
            FOR DELETE TO authenticated
            USING (
                bucket_id = 'documents'
                AND EXISTS (
                    SELECT 1 FROM public.documents d
                    WHERE d.storage_bucket = 'documents'
                      AND d.storage_path = name
                      AND (
                          d.owner_id = (SELECT auth.uid())
                          OR public.proposals_caller_has_role('SystemAdmin')
                          OR public.proposals_caller_has_role('MasterAdmin')
                      )
                )
            );
    END IF;
END $$;

-- ── 4. Remaining hot-path, composite, partial, & trigram indexes ────────────
CREATE INDEX IF NOT EXISTS route_labels_created_at_idx
    ON public.route_labels (created_at DESC);
CREATE INDEX IF NOT EXISTS documents_failed_retry_idx
    ON public.documents (created_at)
    WHERE ingest_status = 'failed' AND ingest_attempts < 3;
CREATE INDEX IF NOT EXISTS documents_created_at_idx
    ON public.documents (created_at DESC);
CREATE INDEX IF NOT EXISTS documents_entity_created_idx
    ON public.documents (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_harvested_tier_created_idx
    ON public.documents (access_tier, created_at)
    WHERE entity_type = 'harvested';
CREATE INDEX IF NOT EXISTS doc_indexes_model_idx
    ON public.doc_indexes (model);
CREATE INDEX IF NOT EXISTS query_log_created_idx
    ON public.query_log (created_at DESC);
CREATE INDEX IF NOT EXISTS query_log_feedback_created_idx
    ON public.query_log (feedback, created_at DESC)
    WHERE feedback IS NOT NULL;
CREATE INDEX IF NOT EXISTS proposal_copis_staff_id_idx
    ON public.proposal_copis (staff_id);
CREATE INDEX IF NOT EXISTS pms_annexures_report_uploaded_idx
    ON public.pms_annexures (report_id, uploaded_at);
CREATE INDEX IF NOT EXISTS pms_awps_updated_id_idx
    ON public.pms_awps (updated_at DESC, id);
CREATE INDEX IF NOT EXISTS pms_awp_revisions_created_id_idx
    ON public.pms_awp_revisions (created_at DESC, id);
CREATE INDEX IF NOT EXISTS pms_evaluations_created_id_idx
    ON public.pms_evaluations (created_at DESC, id);
CREATE INDEX IF NOT EXISTS pms_representations_submitted_id_idx
    ON public.pms_representations (submitted_at DESC, id);
CREATE INDEX IF NOT EXISTS pms_audit_logs_created_at_idx
    ON public.pms_audit_logs (created_at DESC, id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx
    ON public.audit_log (created_at DESC, id);
CREATE INDEX IF NOT EXISTS access_requests_pending_created_idx
    ON public.access_requests (created_at)
    WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS irins_profiles_synced_idx
    ON public.irins_profiles (synced_at DESC, vidwan_id);
CREATE INDEX IF NOT EXISTS project_milestones_status_target_idx
    ON public.project_milestones (status, target_date);
CREATE INDEX IF NOT EXISTS agenda_items_subject_idx
    ON public.agenda_items (subject_type, subject_id)
    WHERE subject_id IS NOT NULL;

-- Trigram index accelerates %q% ILIKE title searches on documents (guarded for minimal test runtimes).
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE INDEX IF NOT EXISTS documents_title_trgm_idx
        ON public.documents USING gin (title gin_trgm_ops);
EXCEPTION
    WHEN undefined_file OR feature_not_supported OR insufficient_privilege THEN NULL;
END $$;

-- ── 5. Split overlapping FOR ALL write policies into INSERT/UPDATE/DELETE ───
-- action_items
DROP POLICY IF EXISTS action_items_write ON public.action_items;
CREATE POLICY action_items_insert ON public.action_items
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY action_items_update ON public.action_items
    FOR UPDATE TO authenticated
    USING (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))
    WITH CHECK (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY action_items_delete ON public.action_items
    FOR DELETE TO authenticated
    USING (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));

-- agenda_items
DROP POLICY IF EXISTS agenda_items_write ON public.agenda_items;
CREATE POLICY agenda_items_insert ON public.agenda_items
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY agenda_items_update ON public.agenda_items
    FOR UPDATE TO authenticated
    USING (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))
    WITH CHECK (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY agenda_items_delete ON public.agenda_items
    FOR DELETE TO authenticated
    USING (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));

-- committee_members
DROP POLICY IF EXISTS committee_members_write ON public.committee_members;
CREATE POLICY committee_members_insert ON public.committee_members
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY committee_members_update ON public.committee_members
    FOR UPDATE TO authenticated
    USING (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))
    WITH CHECK (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY committee_members_delete ON public.committee_members
    FOR DELETE TO authenticated
    USING (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));

-- committees
DROP POLICY IF EXISTS committees_write ON public.committees;
CREATE POLICY committees_insert ON public.committees
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY committees_update ON public.committees
    FOR UPDATE TO authenticated
    USING (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))
    WITH CHECK (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY committees_delete ON public.committees
    FOR DELETE TO authenticated
    USING (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));

-- contract_staff
DROP POLICY IF EXISTS contract_staff_write ON public.contract_staff;
CREATE POLICY contract_staff_insert ON public.contract_staff
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY contract_staff_update ON public.contract_staff
    FOR UPDATE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY contract_staff_delete ON public.contract_staff
    FOR DELETE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));

-- divisions
DROP POLICY IF EXISTS hr_data_write ON public.divisions;
CREATE POLICY divisions_insert ON public.divisions
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY divisions_update ON public.divisions
    FOR UPDATE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY divisions_delete ON public.divisions
    FOR DELETE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));

-- equipment
DROP POLICY IF EXISTS equipment_admin_write ON public.equipment;
CREATE POLICY equipment_admin_insert ON public.equipment
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = (SELECT auth.uid())
          AND user_roles.role = ANY (ARRAY['SystemAdmin'::text, 'MasterAdmin'::text, 'HRAdmin'::text])
    ));
CREATE POLICY equipment_admin_update ON public.equipment
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = (SELECT auth.uid())
          AND user_roles.role = ANY (ARRAY['SystemAdmin'::text, 'MasterAdmin'::text, 'HRAdmin'::text])
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = (SELECT auth.uid())
          AND user_roles.role = ANY (ARRAY['SystemAdmin'::text, 'MasterAdmin'::text, 'HRAdmin'::text])
    ));
CREATE POLICY equipment_admin_delete ON public.equipment
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = (SELECT auth.uid())
          AND user_roles.role = ANY (ARRAY['SystemAdmin'::text, 'MasterAdmin'::text, 'HRAdmin'::text])
    ));

-- feature_controls
DROP POLICY IF EXISTS feature_controls_write ON public.feature_controls;
CREATE POLICY feature_controls_insert ON public.feature_controls
    FOR INSERT TO authenticated
    WITH CHECK (caller_has_role('MasterAdmin'::text));
CREATE POLICY feature_controls_update ON public.feature_controls
    FOR UPDATE TO authenticated
    USING (caller_has_role('MasterAdmin'::text))
    WITH CHECK (caller_has_role('MasterAdmin'::text));
CREATE POLICY feature_controls_delete ON public.feature_controls
    FOR DELETE TO authenticated
    USING (caller_has_role('MasterAdmin'::text));

-- helpdesk_routing
DROP POLICY IF EXISTS helpdesk_routing_write ON public.helpdesk_routing;
CREATE POLICY helpdesk_routing_insert ON public.helpdesk_routing
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY helpdesk_routing_update ON public.helpdesk_routing
    FOR UPDATE TO authenticated
    USING (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))
    WITH CHECK (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY helpdesk_routing_delete ON public.helpdesk_routing
    FOR DELETE TO authenticated
    USING (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));

-- ip_intelligence
DROP POLICY IF EXISTS ip_intelligence_write ON public.ip_intelligence;
CREATE POLICY ip_intelligence_insert ON public.ip_intelligence
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text));
CREATE POLICY ip_intelligence_update ON public.ip_intelligence
    FOR UPDATE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text))
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text));
CREATE POLICY ip_intelligence_delete ON public.ip_intelligence
    FOR DELETE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text));

-- meeting_documents
DROP POLICY IF EXISTS meeting_documents_write ON public.meeting_documents;
CREATE POLICY meeting_documents_insert ON public.meeting_documents
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY meeting_documents_update ON public.meeting_documents
    FOR UPDATE TO authenticated
    USING (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))
    WITH CHECK (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY meeting_documents_delete ON public.meeting_documents
    FOR DELETE TO authenticated
    USING (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));

-- mous (merges mous_write + mous_write_pme)
DROP POLICY IF EXISTS mous_write ON public.mous;
DROP POLICY IF EXISTS mous_write_pme ON public.mous;
CREATE POLICY mous_insert ON public.mous
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme());
CREATE POLICY mous_update ON public.mous
    FOR UPDATE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme())
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme());
CREATE POLICY mous_delete ON public.mous
    FOR DELETE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme());

-- phd_milestones
DROP POLICY IF EXISTS phd_milestones_write ON public.phd_milestones;
CREATE POLICY phd_milestones_insert ON public.phd_milestones
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY phd_milestones_update ON public.phd_milestones
    FOR UPDATE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY phd_milestones_delete ON public.phd_milestones
    FOR DELETE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));

-- phd_students
DROP POLICY IF EXISTS phd_students_write ON public.phd_students;
CREATE POLICY phd_students_insert ON public.phd_students
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY phd_students_update ON public.phd_students
    FOR UPDATE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY phd_students_delete ON public.phd_students
    FOR DELETE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));

-- pms_awp_activities
DROP POLICY IF EXISTS awp_write_owner_draft ON public.pms_awp_activities;
CREATE POLICY awp_insert_owner_draft ON public.pms_awp_activities
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.pms_reports r
        WHERE r.id = pms_awp_activities.report_id
          AND r.scientist_id = (SELECT auth.uid())
          AND r.status = 'DRAFT'::text
    ));
CREATE POLICY awp_update_owner_draft ON public.pms_awp_activities
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.pms_reports r
        WHERE r.id = pms_awp_activities.report_id
          AND r.scientist_id = (SELECT auth.uid())
          AND r.status = 'DRAFT'::text
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.pms_reports r
        WHERE r.id = pms_awp_activities.report_id
          AND r.scientist_id = (SELECT auth.uid())
          AND r.status = 'DRAFT'::text
    ));
CREATE POLICY awp_delete_owner_draft ON public.pms_awp_activities
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.pms_reports r
        WHERE r.id = pms_awp_activities.report_id
          AND r.scientist_id = (SELECT auth.uid())
          AND r.status = 'DRAFT'::text
    ));

-- pms_empowered_committee_members
DROP POLICY IF EXISTS empowered_members_write ON public.pms_empowered_committee_members;
CREATE POLICY empowered_members_insert ON public.pms_empowered_committee_members
    FOR INSERT TO authenticated WITH CHECK (pms_is_admin());
CREATE POLICY empowered_members_update ON public.pms_empowered_committee_members
    FOR UPDATE TO authenticated USING (pms_is_admin()) WITH CHECK (pms_is_admin());
CREATE POLICY empowered_members_delete ON public.pms_empowered_committee_members
    FOR DELETE TO authenticated USING (pms_is_admin());

-- pms_evaluation_committee_members
DROP POLICY IF EXISTS evaluation_committee_members_write ON public.pms_evaluation_committee_members;
CREATE POLICY evaluation_committee_members_insert ON public.pms_evaluation_committee_members
    FOR INSERT TO authenticated WITH CHECK (pms_is_admin());
CREATE POLICY evaluation_committee_members_update ON public.pms_evaluation_committee_members
    FOR UPDATE TO authenticated USING (pms_is_admin()) WITH CHECK (pms_is_admin());
CREATE POLICY evaluation_committee_members_delete ON public.pms_evaluation_committee_members
    FOR DELETE TO authenticated USING (pms_is_admin());

-- pms_evaluation_committees
DROP POLICY IF EXISTS evaluation_committees_write ON public.pms_evaluation_committees;
CREATE POLICY evaluation_committees_insert ON public.pms_evaluation_committees
    FOR INSERT TO authenticated WITH CHECK (pms_is_admin());
CREATE POLICY evaluation_committees_update ON public.pms_evaluation_committees
    FOR UPDATE TO authenticated USING (pms_is_admin()) WITH CHECK (pms_is_admin());
CREATE POLICY evaluation_committees_delete ON public.pms_evaluation_committees
    FOR DELETE TO authenticated USING (pms_is_admin());

-- pms_grievance_members
DROP POLICY IF EXISTS grievance_members_write ON public.pms_grievance_members;
CREATE POLICY grievance_members_insert ON public.pms_grievance_members
    FOR INSERT TO authenticated WITH CHECK (pms_is_admin());
CREATE POLICY grievance_members_update ON public.pms_grievance_members
    FOR UPDATE TO authenticated USING (pms_is_admin()) WITH CHECK (pms_is_admin());
CREATE POLICY grievance_members_delete ON public.pms_grievance_members
    FOR DELETE TO authenticated USING (pms_is_admin());

-- project_schemes
DROP POLICY IF EXISTS project_schemes_write_master ON public.project_schemes;
CREATE POLICY project_schemes_insert_master ON public.project_schemes
    FOR INSERT TO authenticated WITH CHECK (user_has_role('MasterAdmin'::text));
CREATE POLICY project_schemes_update_master ON public.project_schemes
    FOR UPDATE TO authenticated USING (user_has_role('MasterAdmin'::text)) WITH CHECK (user_has_role('MasterAdmin'::text));
CREATE POLICY project_schemes_delete_master ON public.project_schemes
    FOR DELETE TO authenticated USING (user_has_role('MasterAdmin'::text));

-- project_staff (merges project_staff_write + project_staff_write_pme; preserves PME SELECT visibility)
DROP POLICY IF EXISTS project_staff_select ON public.project_staff;
CREATE POLICY project_staff_select ON public.project_staff
    FOR SELECT TO authenticated
    USING (
        caller_sees_all_personnel()
        OR caller_is_finance()
        OR caller_is_pme()
        OR caller_in_division("DivisionCode")
        OR (staff_id IS NOT NULL AND staff_id = caller_staff_id())
        OR (staff_id IS NULL AND "StaffName" = caller_staff_name())
    );
DROP POLICY IF EXISTS project_staff_write ON public.project_staff;
DROP POLICY IF EXISTS project_staff_write_pme ON public.project_staff;
CREATE POLICY project_staff_insert ON public.project_staff
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme());
CREATE POLICY project_staff_update ON public.project_staff
    FOR UPDATE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme())
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme());
CREATE POLICY project_staff_delete ON public.project_staff
    FOR DELETE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme());

-- projects (merges projects_write_master + projects_write_pme; preserves PME SELECT visibility)
DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects
    FOR SELECT TO authenticated
    USING (
        caller_sees_all_personnel()
        OR caller_is_finance()
        OR caller_is_pme()
        OR caller_in_division("DivisionCode")
        OR (pi_staff_id IS NOT NULL AND pi_staff_id = caller_staff_id())
        OR (pi_staff_id IS NULL AND "PrincipalInvestigator" = caller_staff_name())
        OR EXISTS (
            SELECT 1 FROM public.project_staff ps
            WHERE ps."ProjectNo" = projects."ProjectNo"
              AND (
                  (ps.staff_id IS NOT NULL AND ps.staff_id = caller_staff_id())
                  OR (ps.staff_id IS NULL AND ps."StaffName" = caller_staff_name())
              )
        )
    );
DROP POLICY IF EXISTS projects_write_master ON public.projects;
DROP POLICY IF EXISTS projects_write_pme ON public.projects;
CREATE POLICY projects_insert ON public.projects
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('MasterAdmin'::text) OR caller_is_pme());
CREATE POLICY projects_update ON public.projects
    FOR UPDATE TO authenticated
    USING (user_has_role('MasterAdmin'::text) OR caller_is_pme())
    WITH CHECK (user_has_role('MasterAdmin'::text) OR caller_is_pme());
CREATE POLICY projects_delete ON public.projects
    FOR DELETE TO authenticated
    USING (user_has_role('MasterAdmin'::text) OR caller_is_pme());

-- proposal_budget_lines
DROP POLICY IF EXISTS proposal_budget_lines_write_author ON public.proposal_budget_lines;
CREATE POLICY proposal_budget_lines_insert_author ON public.proposal_budget_lines
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = proposal_budget_lines.proposal_id
          AND p.created_by = (SELECT auth.uid())
          AND p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text])
    ));
CREATE POLICY proposal_budget_lines_update_author ON public.proposal_budget_lines
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = proposal_budget_lines.proposal_id
          AND p.created_by = (SELECT auth.uid())
          AND p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text])
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = proposal_budget_lines.proposal_id
          AND p.created_by = (SELECT auth.uid())
          AND p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text])
    ));
CREATE POLICY proposal_budget_lines_delete_author ON public.proposal_budget_lines
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = proposal_budget_lines.proposal_id
          AND p.created_by = (SELECT auth.uid())
          AND p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text])
    ));

-- proposal_copis (also scope SELECT to authenticated to avoid authenticator/dashboard_user overlaps)
DROP POLICY IF EXISTS proposal_copis_select ON public.proposal_copis;
CREATE POLICY proposal_copis_select ON public.proposal_copis
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = proposal_copis.proposal_id
          AND proposals_can_read(p.*)
    ));

DROP POLICY IF EXISTS proposal_copis_write ON public.proposal_copis;
CREATE POLICY proposal_copis_insert ON public.proposal_copis
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = proposal_copis.proposal_id
          AND p.created_by = (SELECT auth.uid())
          AND p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text])
    ));
CREATE POLICY proposal_copis_update ON public.proposal_copis
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = proposal_copis.proposal_id
          AND p.created_by = (SELECT auth.uid())
          AND p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text])
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = proposal_copis.proposal_id
          AND p.created_by = (SELECT auth.uid())
          AND p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text])
    ));
CREATE POLICY proposal_copis_delete ON public.proposal_copis
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = proposal_copis.proposal_id
          AND p.created_by = (SELECT auth.uid())
          AND p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text])
    ));

-- scientific_outputs
DROP POLICY IF EXISTS scientific_outputs_write ON public.scientific_outputs;
CREATE POLICY scientific_outputs_insert ON public.scientific_outputs
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text));
CREATE POLICY scientific_outputs_update ON public.scientific_outputs
    FOR UPDATE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text))
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text));
CREATE POLICY scientific_outputs_delete ON public.scientific_outputs
    FOR DELETE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text));

-- staff
DROP POLICY IF EXISTS staff_write ON public.staff;
CREATE POLICY staff_insert ON public.staff
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY staff_update ON public.staff
    FOR UPDATE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY staff_delete ON public.staff
    FOR DELETE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text));

-- tech_transfers (merges tech_transfers_write + tech_transfers_write_pme)
DROP POLICY IF EXISTS tech_transfers_write ON public.tech_transfers;
DROP POLICY IF EXISTS tech_transfers_write_pme ON public.tech_transfers;
CREATE POLICY tech_transfers_insert ON public.tech_transfers
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme());
CREATE POLICY tech_transfers_update ON public.tech_transfers
    FOR UPDATE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme())
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme());
CREATE POLICY tech_transfers_delete ON public.tech_transfers
    FOR DELETE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme());

-- user_profiles (single policy per command)
DROP POLICY IF EXISTS user_profiles_manage_admin ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_select_admin ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_select_own ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_update_own ON public.user_profiles;
CREATE POLICY user_profiles_select ON public.user_profiles
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id OR user_has_role('MasterAdmin'::text) OR user_has_role('SystemAdmin'::text));
CREATE POLICY user_profiles_insert_admin ON public.user_profiles
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('MasterAdmin'::text) OR user_has_role('SystemAdmin'::text));
CREATE POLICY user_profiles_update ON public.user_profiles
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id OR user_has_role('MasterAdmin'::text) OR user_has_role('SystemAdmin'::text))
    WITH CHECK ((SELECT auth.uid()) = user_id OR user_has_role('MasterAdmin'::text) OR user_has_role('SystemAdmin'::text));
CREATE POLICY user_profiles_delete_admin ON public.user_profiles
    FOR DELETE TO authenticated
    USING (user_has_role('MasterAdmin'::text) OR user_has_role('SystemAdmin'::text));

-- vacancy_advertisements
DROP POLICY IF EXISTS vacancy_advertisements_write ON public.vacancy_advertisements;
CREATE POLICY vacancy_advertisements_insert ON public.vacancy_advertisements
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY vacancy_advertisements_update ON public.vacancy_advertisements
    FOR UPDATE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('MasterAdmin'::text))
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY vacancy_advertisements_delete ON public.vacancy_advertisements
    FOR DELETE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('MasterAdmin'::text));

-- vacancy_posts
DROP POLICY IF EXISTS vacancy_posts_write ON public.vacancy_posts;
CREATE POLICY vacancy_posts_insert ON public.vacancy_posts
    FOR INSERT TO authenticated
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY vacancy_posts_update ON public.vacancy_posts
    FOR UPDATE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('MasterAdmin'::text))
    WITH CHECK (user_has_role('HRAdmin'::text) OR user_has_role('MasterAdmin'::text));
CREATE POLICY vacancy_posts_delete ON public.vacancy_posts
    FOR DELETE TO authenticated
    USING (user_has_role('HRAdmin'::text) OR user_has_role('MasterAdmin'::text));

-- ── 6. Server-side pagination & summary RPCs ────────────────────────────────

-- 6a) Server-side combined audit log pagination (avoids PostgREST max_rows = 1000 cutoff)
CREATE OR REPLACE FUNCTION public.list_combined_audit_logs(
    p_source text DEFAULT 'all',
    p_limit  integer DEFAULT 25,
    p_offset integer DEFAULT 0
) RETURNS TABLE(
    source      text,
    id          uuid,
    action      text,
    entity_type text,
    entity_id   uuid,
    actor_label text,
    details     jsonb,
    created_at  timestamptz,
    total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH combined AS (
        SELECT 'pms'::text AS source,
               l.id,
               l.action,
               l.entity_type,
               l.entity_id,
               l.user_id::text AS actor_label,
               l.details,
               l.created_at
          FROM public.pms_audit_logs l
         WHERE p_source IN ('all', 'pms')
        UNION ALL
        SELECT 'modules'::text AS source,
               a.id,
               a.action,
               a.entity_type,
               a.entity_id,
               a.actor_id AS actor_label,
               a.changes AS details,
               a.created_at
          FROM public.audit_log a
         WHERE p_source IN ('all', 'modules')
    ),
    counted AS (
        SELECT count(*) AS total_count FROM combined
    )
    SELECT c.source,
           c.id,
           c.action,
           c.entity_type,
           c.entity_id,
           c.actor_label,
           c.details,
           c.created_at,
           counted.total_count
      FROM combined c, counted
     ORDER BY c.created_at DESC, c.id
     LIMIT GREATEST(1, LEAST(coalesce(p_limit, 25), 100))
    OFFSET GREATEST(0, coalesce(p_offset, 0));
$$;

REVOKE ALL ON FUNCTION public.list_combined_audit_logs(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_combined_audit_logs(text, integer, integer) TO authenticated, service_role;

-- 6b) Enrich admin_list_users() with must_change_password and last_seen_at to
--     eliminate the redundant full-table user_profiles download in admin dashboards.
DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
    user_id              uuid,
    email                text,
    active_role          text,
    roles                text[],
    division_code        text,
    must_change_password boolean,
    last_seen_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    RETURN QUERY
    SELECT
        up.user_id,
        up.email,
        up.active_role,
        COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::text[]) AS roles,
        (array_agg(ur.division_code) FILTER (WHERE ur.division_code IS NOT NULL))[1] AS division_code,
        up.must_change_password,
        up.last_seen_at
    FROM public.user_profiles up
    LEFT JOIN public.user_roles ur ON ur.user_id = up.user_id
    GROUP BY up.user_id, up.email, up.active_role, up.must_change_password, up.last_seen_at
    ORDER BY up.email;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;

-- 6c) Corpus-wide RAG monitor KPIs without downloading full query_log answers/citations
CREATE OR REPLACE FUNCTION public.rag_monitor_summary()
RETURNS TABLE(
    status_counts      jsonb,
    traceability_cited bigint,
    traceability_total bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH doc_counts AS (
        SELECT
            count(*) FILTER (WHERE ingest_status = 'pending')    AS pending,
            count(*) FILTER (WHERE ingest_status = 'processing') AS processing,
            count(*) FILTER (WHERE ingest_status = 'indexed')    AS indexed,
            count(*) FILTER (WHERE ingest_status = 'failed')     AS failed,
            count(*) FILTER (WHERE ingest_status = 'skipped')    AS skipped
        FROM public.documents
    ),
    qlog_qual AS (
        SELECT
            (citations IS NOT NULL AND jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) > 0) AS is_cited
        FROM public.query_log
        WHERE mode <> 'structured'
          AND btrim(coalesce(answer, '')) <> 'Not found in institute documents.'
    )
    SELECT
        jsonb_build_object(
            'pending',    dc.pending,
            'processing', dc.processing,
            'indexed',    dc.indexed,
            'failed',     dc.failed,
            'skipped',    dc.skipped
        ) AS status_counts,
        count(*) FILTER (WHERE q.is_cited) AS traceability_cited,
        count(q.is_cited)                  AS traceability_total
    FROM doc_counts dc
    LEFT JOIN qlog_qual q ON true
    GROUP BY dc.pending, dc.processing, dc.indexed, dc.failed, dc.skipped;
$$;

REVOKE ALL ON FUNCTION public.rag_monitor_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rag_monitor_summary() TO authenticated, service_role;
