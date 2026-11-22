-- ============================================================
-- Stage 03 / 08 — Unified HR, Workforce, Outputs, IP & Facilities
-- Depends    : Stage 01, Stage 02
-- Rerun      : NOT idempotent — fresh installs only.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."divisions" (
    "divCode" text NOT NULL,
    "divName" text,
    "divDescription" text,
    "divResearchAreas" text,
    "divHoD" text,
    "divHoDID" text,
    "divSanctionedstrength" integer,
    "divCurrentStrength" integer,
    "divStatus" text,
    CONSTRAINT "divisions_pkey" PRIMARY KEY ("divCode")
);

CREATE TABLE IF NOT EXISTS public."staff" (
    "ID" text NOT NULL,
    "LabCode" text,
    "EmployeeType" text,
    "Name" text,
    "Designation" text,
    "Group" text,
    "Division" text,
    "DoAPP" text,
    "DOJ" text,
    "DOB" text,
    "Cat" text,
    "AppointmentType" text,
    "Level" text,
    "CoreArea" text,
    "Expertise" text,
    "Email" text,
    "Ext" text,
    "VidwanID" text,
    "ReportingID" text,
    "HighestQualification" text,
    "Gender" text,
    "user_id" uuid,
    "orcid" text,
    "doj_date" date,
    "dob_date" date,
    "doapp_date" date,
    CONSTRAINT "staff_pkey" PRIMARY KEY ("ID")
);
CREATE INDEX staff_division_idx ON public.staff USING btree ("Division");
CREATE INDEX staff_email_lower_idx ON public.staff USING btree (lower("Email"));
CREATE INDEX staff_name_key_idx ON public.staff USING btree (person_name_key("Name"));
CREATE INDEX staff_reporting_id_idx ON public.staff USING btree ("ReportingID") WHERE ("ReportingID" IS NOT NULL);
CREATE UNIQUE INDEX staff_user_id_key ON public.staff USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE TABLE IF NOT EXISTS public."sanctioned_posts" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "post_code" text NOT NULL,
    "staff_group" text NOT NULL,
    "level" text,
    "designation" text NOT NULL,
    "discipline" text,
    "division_code" text,
    "category" text,
    "state" text DEFAULT 'VACANT'::text NOT NULL,
    "holder_staff_id" text,
    "vacant_since" date,
    "sanction_ref" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "sanctioned_posts_check" CHECK ((state = 'FILLED'::text) = (holder_staff_id IS NOT NULL)),
    CONSTRAINT "sanctioned_posts_post_code_check" CHECK (btrim(post_code) <> ''::text),
    CONSTRAINT "sanctioned_posts_state_check" CHECK (state = ANY (ARRAY['FILLED'::text, 'VACANT'::text, 'ADVERTISED'::text, 'ABEYANCE'::text, 'ABOLISHED'::text])),
    CONSTRAINT "sanctioned_posts_pkey" PRIMARY KEY (id),
    CONSTRAINT "sanctioned_posts_post_code_key" UNIQUE (post_code)
);
CREATE INDEX sanctioned_posts_division_idx ON public.sanctioned_posts USING btree (division_code, state);
CREATE UNIQUE INDEX sanctioned_posts_one_post_per_holder ON public.sanctioned_posts USING btree (holder_staff_id) WHERE (holder_staff_id IS NOT NULL);

CREATE TABLE IF NOT EXISTS public."sanctioned_post_events" (
    "id" bigserial NOT NULL,
    "post_id" uuid NOT NULL,
    "at" timestamp with time zone DEFAULT now() NOT NULL,
    "actor" uuid,
    "from_state" text,
    "to_state" text NOT NULL,
    "staff_id" text,
    "effective_on" date,
    "order_ref" text,
    "note" text,
    CONSTRAINT "sanctioned_post_events_pkey" PRIMARY KEY (id)
);
CREATE INDEX sanctioned_post_events_actor_fk_idx ON public.sanctioned_post_events USING btree (actor);
CREATE INDEX sanctioned_post_events_post_idx ON public.sanctioned_post_events USING btree (post_id, at);

CREATE TABLE IF NOT EXISTS public."staff_career_events" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "staff_id" text NOT NULL,
    "kind" text NOT NULL,
    "effective_on" date NOT NULL,
    "detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "order_ref" text,
    "source" text DEFAULT 'MANUAL'::text NOT NULL,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "staff_career_events_kind_check" CHECK (kind = ANY (ARRAY['APPOINTMENT'::text, 'PROMOTION'::text, 'TRANSFER'::text, 'DEPUTATION'::text, 'TRAINING'::text, 'ASSESSMENT'::text, 'RETIREMENT'::text])),
    CONSTRAINT "staff_career_events_source_check" CHECK (source = ANY (ARRAY['IMPORT'::text, 'MANUAL'::text])),
    CONSTRAINT "staff_career_events_pkey" PRIMARY KEY (id),
    CONSTRAINT "staff_career_events_staff_id_kind_effective_on_key" UNIQUE (staff_id, kind, effective_on)
);
CREATE INDEX staff_career_events_created_by_fk_idx ON public.staff_career_events USING btree (created_by);

CREATE TABLE IF NOT EXISTS public."staff_profile_changes" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "staff_id" text NOT NULL,
    "user_id" uuid,
    "changes" jsonb NOT NULL,
    "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "staff_profile_changes_pkey" PRIMARY KEY (id)
);
CREATE INDEX staff_profile_changes_staff_idx ON public.staff_profile_changes USING btree (staff_id, changed_at DESC);
CREATE INDEX staff_profile_changes_user_id_fk_idx ON public.staff_profile_changes USING btree (user_id);

CREATE TABLE IF NOT EXISTS public."expertise_terms" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "label" text NOT NULL,
    "kind" text NOT NULL,
    "theme_code" text,
    "parent_id" uuid,
    "status" text DEFAULT 'ACTIVE'::text NOT NULL,
    "merged_into" uuid,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "expertise_terms_check" CHECK ((status = 'MERGED'::text) = (merged_into IS NOT NULL)),
    CONSTRAINT "expertise_terms_kind_check" CHECK (kind = ANY (ARRAY['MATERIAL'::text, 'TECHNIQUE'::text, 'APPLICATION'::text])),
    CONSTRAINT "expertise_terms_label_check" CHECK (btrim(label) <> ''::text),
    CONSTRAINT "expertise_terms_status_check" CHECK (status = ANY (ARRAY['ACTIVE'::text, 'MERGED'::text])),
    CONSTRAINT "expertise_terms_theme_code_check" CHECK (theme_code ~ '^0[1-9]$'::text),
    CONSTRAINT "expertise_terms_pkey" PRIMARY KEY (id)
);
CREATE INDEX expertise_terms_created_by_fk_idx ON public.expertise_terms USING btree (created_by);
CREATE UNIQUE INDEX expertise_terms_label_key ON public.expertise_terms USING btree (lower(btrim(label))) WHERE (status = 'ACTIVE'::text);
CREATE INDEX expertise_terms_merged_into_fk_idx ON public.expertise_terms USING btree (merged_into);
CREATE INDEX expertise_terms_parent_id_fk_idx ON public.expertise_terms USING btree (parent_id);

CREATE TABLE IF NOT EXISTS public."staff_expertise" (
    "staff_id" text NOT NULL,
    "term_id" uuid NOT NULL,
    "source" text NOT NULL,
    "confirmed_at" timestamp with time zone,
    "added_by" uuid DEFAULT auth.uid(),
    CONSTRAINT "staff_expertise_source_check" CHECK (source = ANY (ARRAY['SELF'::text, 'SUGGESTED'::text])),
    CONSTRAINT "staff_expertise_pkey" PRIMARY KEY (staff_id, term_id)
);
CREATE INDEX staff_expertise_added_by_fk_idx ON public.staff_expertise USING btree (added_by);
CREATE INDEX staff_expertise_term_idx ON public.staff_expertise USING btree (term_id) WHERE (confirmed_at IS NOT NULL);

CREATE TABLE IF NOT EXISTS public."contract_staff" (
    "id" text NOT NULL,
    "Name" text,
    "Designation" text,
    "Division" text,
    "DateOfJoining" text,
    "ContractEndDate" text,
    "LabCode" text,
    "DateOfBirth" text,
    "AttachedToStaffID" text,
    "joined_on" date,
    "ends_on" date,
    "born_on" date,
    CONSTRAINT "contract_staff_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public."project_staff" (
    "id" text NOT NULL,
    "StaffName" text,
    "Designation" text,
    "RecruitmentCycle" text,
    "DateOfJoining" text,
    "DateOfProjectDuration" text,
    "ProjectNo" text,
    "PIName" text,
    "DivisionCode" text,
    "staff_id" text,
    "project_id" text,
    "joined_on" date,
    "project_ends_on" date,
    "person_id" uuid,
    CONSTRAINT "project_staff_pkey" PRIMARY KEY (id)
);
CREATE INDEX project_staff_person_id_fk_idx ON public.project_staff USING btree (person_id);
CREATE INDEX project_staff_project_id_idx ON public.project_staff USING btree (project_id);
CREATE INDEX project_staff_project_no_idx ON public.project_staff USING btree ("ProjectNo");
CREATE INDEX project_staff_staff_id_idx ON public.project_staff USING btree (staff_id);

CREATE TABLE IF NOT EXISTS public."project_staff_persons" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "born_on" date,
    "category" text,
    "gender" text,
    "phd_registered_on" date,
    "thesis_submitted_on" date,
    "abroad_last_5y" boolean DEFAULT false NOT NULL,
    "antecedents_verified_on" date,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_staff_persons_category_check" CHECK (category = ANY (ARRAY['GEN'::text, 'SC'::text, 'ST'::text, 'OBC'::text, 'EWS'::text, 'PwBD'::text])),
    CONSTRAINT "project_staff_persons_check" CHECK (thesis_submitted_on IS NULL OR phd_registered_on IS NOT NULL),
    CONSTRAINT "project_staff_persons_name_check" CHECK (btrim(name) <> ''::text),
    CONSTRAINT "project_staff_persons_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public."project_staff_leave" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "engagement_id" uuid NOT NULL,
    "kind" text NOT NULL,
    "from_on" date NOT NULL,
    "to_on" date NOT NULL,
    "recorded_by" uuid,
    "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_staff_leave_check" CHECK (to_on >= from_on),
    CONSTRAINT "project_staff_leave_kind_check" CHECK (kind = ANY (ARRAY['PAID'::text, 'MATERNITY'::text, 'PATERNITY'::text, 'OTHER'::text])),
    CONSTRAINT "project_staff_leave_pkey" PRIMARY KEY (id)
);
CREATE INDEX project_staff_leave_engagement_id_fk_idx ON public.project_staff_leave USING btree (engagement_id);
CREATE INDEX project_staff_leave_recorded_by_fk_idx ON public.project_staff_leave USING btree (recorded_by);

CREATE TABLE IF NOT EXISTS public."project_engagements" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "person_id" uuid NOT NULL,
    "project_id" text NOT NULL,
    "position_code" text NOT NULL,
    "from_on" date NOT NULL,
    "to_on" date NOT NULL,
    "emoluments" numeric(12,2),
    "selection_id" uuid,
    "legacy_project_staff_id" text,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_engagements_check" CHECK (to_on >= from_on),
    CONSTRAINT "project_engagements_pkey" PRIMARY KEY (id)
);
CREATE INDEX project_engagements_created_by_fk_idx ON public.project_engagements USING btree (created_by);
CREATE INDEX project_engagements_person_idx ON public.project_engagements USING btree (person_id, from_on);
CREATE INDEX project_engagements_project_id_fk_idx ON public.project_engagements USING btree (project_id);
CREATE INDEX project_engagements_selection_id_fk_idx ON public.project_engagements USING btree (selection_id);

CREATE TABLE IF NOT EXISTS public."phd_students" (
    "EnrollmentNo" text NOT NULL,
    "StudentName" text,
    "Specialization" text,
    "SupervisorName" text,
    "CoSupervisorName" text,
    "FellowshipDetails" text,
    "CurrentStatus" text,
    "ThesisTitle" text,
    "ProjectNo" text,
    "DivisionCode" text,
    "supervisor_staff_id" text,
    "cosupervisor_staff_id" text,
    "project_id" text,
    CONSTRAINT "phd_students_pkey" PRIMARY KEY ("EnrollmentNo")
);
CREATE INDEX phd_cosupervisor_staff_id_idx ON public.phd_students USING btree (cosupervisor_staff_id);
CREATE INDEX phd_students_division_idx ON public.phd_students USING btree ("DivisionCode");
CREATE INDEX phd_students_project_id_idx ON public.phd_students USING btree (project_id);
CREATE INDEX phd_supervisor_staff_id_idx ON public.phd_students USING btree (supervisor_staff_id);

CREATE TABLE IF NOT EXISTS public."phd_milestones" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "enrollment_no" text NOT NULL,
    "milestone" text NOT NULL,
    "due_date" date,
    "completed_date" date,
    "remarks" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "phd_milestones_milestone_check" CHECK (milestone = ANY (ARRAY['Joining'::text, 'Coursework'::text, 'Comprehensive Exam'::text, 'Registration'::text, 'Synopsis Submission'::text, 'Thesis Submission'::text, 'Viva Voce'::text, 'Degree Awarded'::text])),
    CONSTRAINT "phd_milestones_pkey" PRIMARY KEY (id),
    CONSTRAINT "phd_milestones_enrollment_no_milestone_key" UNIQUE (enrollment_no, milestone)
);
CREATE INDEX phd_milestones_enrollment_idx ON public.phd_milestones USING btree (enrollment_no);

CREATE TABLE IF NOT EXISTS public."labs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lab_code" text NOT NULL,
    "lab_name" text NOT NULL,
    "div_code" text,
    "created_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "labs_pkey" PRIMARY KEY (id),
    CONSTRAINT "labs_lab_code_key" UNIQUE (lab_code)
);
CREATE INDEX labs_div_code_fk_idx ON public.labs USING btree (div_code);

CREATE TABLE IF NOT EXISTS public."equipment" (
    "UInsID" text NOT NULL,
    "Name" text,
    "EndUse" text,
    "Division" text,
    "IndenterName" text,
    "OperatorName" text,
    "Location" text,
    "WorkingStatus" text,
    "Movable" text,
    "RequirementInstallation" text,
    "Justification" text,
    "Remark" text,
    "instrument_code" text,
    "serial_number" text,
    "manufacturer" text,
    "year_of_manufacture" integer,
    "lab_id" uuid,
    "owner_user_id" uuid,
    "amc_end_date" date,
    "purchase_cost" numeric(14,2),
    "procurement_date" date,
    "project_id" text,
    CONSTRAINT "equipment_pkey" PRIMARY KEY ("UInsID")
);
CREATE INDEX equipment_amc_idx ON public.equipment USING btree (amc_end_date);
CREATE INDEX equipment_lab_idx ON public.equipment USING btree (lab_id);
CREATE INDEX equipment_owner_idx ON public.equipment USING btree (owner_user_id);
CREATE INDEX equipment_project_idx ON public.equipment USING btree (project_id);

CREATE TABLE IF NOT EXISTS public."equipment_usage_log" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "equipment_id" text NOT NULL,
    "used_on" date NOT NULL,
    "hours" numeric(5,2) NOT NULL,
    "user_staff_id" text,
    "project_id" text,
    "purpose" text NOT NULL,
    "logged_by" uuid NOT NULL,
    "logged_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "equipment_usage_log_hours_check" CHECK (hours > 0::numeric AND hours <= 24::numeric),
    CONSTRAINT "equipment_usage_log_purpose_check" CHECK (btrim(purpose) <> ''::text),
    CONSTRAINT "equipment_usage_log_pkey" PRIMARY KEY (id)
);
CREATE INDEX equipment_usage_log_equipment_idx ON public.equipment_usage_log USING btree (equipment_id, used_on DESC);
CREATE INDEX equipment_usage_log_logged_by_fk_idx ON public.equipment_usage_log USING btree (logged_by);
CREATE INDEX equipment_usage_log_project_id_fk_idx ON public.equipment_usage_log USING btree (project_id);
CREATE INDEX equipment_usage_log_user_staff_id_fk_idx ON public.equipment_usage_log USING btree (user_staff_id);

CREATE TABLE IF NOT EXISTS public."scientific_outputs" (
    "id" text NOT NULL,
    "title" text NOT NULL,
    "authors" text[] DEFAULT '{}'::text[] NOT NULL,
    "journal" text NOT NULL,
    "year" integer NOT NULL,
    "doi" text,
    "impact_factor" double precision,
    "citation_count" integer,
    "division_code" text NOT NULL,
    "project_id" text,
    CONSTRAINT "scientific_outputs_pkey" PRIMARY KEY (id)
);
CREATE INDEX scientific_outputs_division_year_idx ON public.scientific_outputs USING btree (division_code, year);
CREATE INDEX scientific_outputs_project_idx ON public.scientific_outputs USING btree (project_id);

CREATE TABLE IF NOT EXISTS public."output_authors" (
    "output_id" text NOT NULL,
    "pos" integer NOT NULL,
    "author_name" text NOT NULL,
    "staff_id" text,
    "link_source" text,
    "confirmed_by" uuid,
    "confirmed_at" timestamp with time zone,
    CONSTRAINT "output_authors_link_source_check" CHECK (link_source = ANY (ARRAY['auto'::text, 'manual'::text])),
    CONSTRAINT "output_authors_pos_check" CHECK (pos > 0),
    CONSTRAINT "output_authors_pkey" PRIMARY KEY (output_id, pos)
);
CREATE INDEX output_authors_confirmed_by_fk_idx ON public.output_authors USING btree (confirmed_by);
CREATE INDEX output_authors_staff_idx ON public.output_authors USING btree (staff_id) WHERE (staff_id IS NOT NULL);

CREATE TABLE IF NOT EXISTS public."ip_intelligence" (
    "id" text NOT NULL,
    "title" text NOT NULL,
    "type" text NOT NULL,
    "status" text NOT NULL,
    "filing_date" text NOT NULL,
    "grant_date" text,
    "inventors" text[] DEFAULT '{}'::text[] NOT NULL,
    "division_code" text NOT NULL,
    "project_id" text,
    CONSTRAINT "ip_intelligence_status_check" CHECK (status = ANY (ARRAY['Filed'::text, 'Published'::text, 'Granted'::text])),
    CONSTRAINT "ip_intelligence_type_check" CHECK (type = ANY (ARRAY['Patent'::text, 'Copyright'::text, 'Design'::text, 'Trademark'::text])),
    CONSTRAINT "ip_intelligence_pkey" PRIMARY KEY (id)
);
CREATE INDEX ip_intelligence_project_idx ON public.ip_intelligence USING btree (project_id);

CREATE TABLE IF NOT EXISTS public."ip_inventors" (
    "ip_id" text NOT NULL,
    "pos" integer NOT NULL,
    "author_name" text NOT NULL,
    "staff_id" text,
    "link_source" text,
    "confirmed_by" uuid,
    "confirmed_at" timestamp with time zone,
    CONSTRAINT "ip_inventors_link_source_check" CHECK (link_source = ANY (ARRAY['auto'::text, 'manual'::text])),
    CONSTRAINT "ip_inventors_pos_check" CHECK (pos > 0),
    CONSTRAINT "ip_inventors_pkey" PRIMARY KEY (ip_id, pos)
);
CREATE INDEX ip_inventors_confirmed_by_fk_idx ON public.ip_inventors USING btree (confirmed_by);
CREATE INDEX ip_inventors_staff_idx ON public.ip_inventors USING btree (staff_id) WHERE (staff_id IS NOT NULL);

CREATE TABLE IF NOT EXISTS public."irins_profiles" (
    "vidwan_id" text NOT NULL,
    "profile_data" jsonb NOT NULL,
    "synced_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "irins_profiles_pkey" PRIMARY KEY (vidwan_id)
);
CREATE INDEX irins_profiles_synced_idx ON public.irins_profiles USING btree (synced_at DESC, vidwan_id);

CREATE TABLE IF NOT EXISTS public."irins_sync_log" (
    "id" bigserial NOT NULL,
    "triggered_by" text DEFAULT 'cron'::text NOT NULL,
    "started_at" timestamp with time zone DEFAULT now() NOT NULL,
    "completed_at" timestamp with time zone,
    "status" text DEFAULT 'running'::text NOT NULL,
    "total_scientists" integer DEFAULT 0 NOT NULL,
    "succeeded" integer DEFAULT 0 NOT NULL,
    "failed" integer DEFAULT 0 NOT NULL,
    "error_details" jsonb,
    CONSTRAINT "irins_sync_log_status_check" CHECK (status = ANY (ARRAY['running'::text, 'success'::text, 'partial'::text, 'failed'::text])),
    CONSTRAINT "irins_sync_log_triggered_by_check" CHECK (triggered_by = ANY (ARRAY['cron'::text, 'manual'::text])),
    CONSTRAINT "irins_sync_log_pkey" PRIMARY KEY (id)
);
CREATE INDEX irins_sync_log_started_idx ON public.irins_sync_log USING btree (started_at DESC);

CREATE TABLE IF NOT EXISTS public."mous" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "partner_name" text NOT NULL,
    "partner_type" text DEFAULT 'Other'::text NOT NULL,
    "purpose" text DEFAULT ''::text NOT NULL,
    "signed_date" date,
    "valid_until" date,
    "status" text DEFAULT 'Active'::text NOT NULL,
    "division_code" text,
    "linked_project_no" text,
    "remarks" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "project_id" text,
    CONSTRAINT "mous_partner_type_check" CHECK (partner_type = ANY (ARRAY['Academic'::text, 'Industry'::text, 'Government'::text, 'International'::text, 'Other'::text])),
    CONSTRAINT "mous_status_check" CHECK (status = ANY (ARRAY['Active'::text, 'Expired'::text, 'Under Renewal'::text, 'Terminated'::text])),
    CONSTRAINT "mous_pkey" PRIMARY KEY (id)
);
CREATE INDEX mous_project_id_idx ON public.mous USING btree (project_id);
CREATE INDEX mous_status_idx ON public.mous USING btree (status);
CREATE INDEX mous_valid_until_idx ON public.mous USING btree (valid_until);

CREATE TABLE IF NOT EXISTS public."tech_transfers" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "technology_title" text NOT NULL,
    "licensee" text NOT NULL,
    "licensee_type" text DEFAULT 'Other'::text NOT NULL,
    "agreement_type" text DEFAULT 'License'::text NOT NULL,
    "agreement_date" date,
    "value_lakhs" numeric(12,2),
    "status" text DEFAULT 'Signed'::text NOT NULL,
    "linked_project_no" text,
    "linked_ip_id" text,
    "division_code" text,
    "remarks" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "project_id" text,
    CONSTRAINT "tech_transfers_agreement_type_check" CHECK (agreement_type = ANY (ARRAY['License'::text, 'Know-how Transfer'::text, 'Joint Development'::text, 'Consultancy'::text, 'Sponsored'::text])),
    CONSTRAINT "tech_transfers_licensee_type_check" CHECK (licensee_type = ANY (ARRAY['Industry'::text, 'Startup'::text, 'PSU'::text, 'Government'::text, 'Other'::text])),
    CONSTRAINT "tech_transfers_status_check" CHECK (status = ANY (ARRAY['Under Negotiation'::text, 'Signed'::text, 'Active'::text, 'Completed'::text, 'Terminated'::text])),
    CONSTRAINT "tech_transfers_value_lakhs_check" CHECK (value_lakhs >= 0::numeric),
    CONSTRAINT "tech_transfers_pkey" PRIMARY KEY (id)
);
CREATE INDEX tech_transfers_division_idx ON public.tech_transfers USING btree (division_code);
CREATE INDEX tech_transfers_project_id_idx ON public.tech_transfers USING btree (project_id);
CREATE INDEX tech_transfers_status_idx ON public.tech_transfers USING btree (status);

CREATE TABLE IF NOT EXISTS public."publication_files" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "output_id" text,
    "title" text NOT NULL,
    "division_code" text NOT NULL,
    "communication_no" text,
    "similarity_pct" numeric(5,2),
    "similarity_report_document_id" uuid,
    "journal" text,
    "year" integer,
    "doi" text,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "cleared_by" uuid,
    "cleared_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    CONSTRAINT "publication_files_similarity_pct_check" CHECK (similarity_pct >= 0::numeric AND similarity_pct <= 100::numeric),
    CONSTRAINT "publication_files_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'ETHICS_CHECK'::text, 'CLEARED'::text, 'SUBMITTED'::text, 'ACCEPTED'::text, 'PUBLISHED'::text])),
    CONSTRAINT "publication_files_title_check" CHECK (btrim(title) <> ''::text),
    CONSTRAINT "publication_files_pkey" PRIMARY KEY (id),
    CONSTRAINT "publication_files_communication_no_key" UNIQUE (communication_no)
);
CREATE INDEX publication_files_cleared_by_fk_idx ON public.publication_files USING btree (cleared_by);
CREATE INDEX publication_files_created_by_fk_idx ON public.publication_files USING btree (created_by);
CREATE INDEX publication_files_output_id_fk_idx ON public.publication_files USING btree (output_id);
CREATE INDEX publication_files_similarity_report_document_id_fk_idx ON public.publication_files USING btree (similarity_report_document_id);

CREATE TABLE IF NOT EXISTS public."publication_author_consents" (
    "file_id" uuid NOT NULL,
    "pos" integer NOT NULL,
    "name" text NOT NULL,
    "staff_id" text,
    "contribution" text,
    "consented_at" timestamp with time zone,
    CONSTRAINT "publication_author_consents_name_check" CHECK (btrim(name) <> ''::text),
    CONSTRAINT "publication_author_consents_pos_check" CHECK (pos > 0),
    CONSTRAINT "publication_author_consents_pkey" PRIMARY KEY (file_id, pos)
);
CREATE INDEX publication_author_consents_staff_id_fk_idx ON public.publication_author_consents USING btree (staff_id);
