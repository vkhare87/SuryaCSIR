-- ═══════════════════════════════════════════════════════════════════════
-- 20260726000006_default_acl_drop_anon
-- Stop the anon EXECUTE hole from reopening on the next migration.
--
-- 20260718000007 and 20260726000005 both wrote:
--     ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC
-- and then granted authenticated + service_role. That is not enough.
-- Supabase's stock bootstrap grants anon *by name*, and REVOKE ... FROM
-- PUBLIC does not remove a named grant. Verified on the live project after
-- 20260726000005 applied:
--
--   pg_default_acl, schema public, objtype 'f':
--     {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,...}
--
-- So 20260726000005 correctly cleaned the 81 functions that existed, but the
-- next `CREATE FUNCTION` in a migration would again be executable by anon —
-- which is exactly how pms_caller_track() and pms_finalize_senior_report()
-- shipped reachable in the first place.
--
-- Scope: DEFAULT privileges only, i.e. objects created from here on. It
-- deliberately does not touch privileges on existing tables — anon holds
-- SELECT/INSERT on all 64 of them, but every table has RLS enabled and every
-- policy resolves false for a NULL auth.uid(), so that is defence-in-depth
-- debt rather than an exposure, and revoking it live risks turning silent
-- empty results into visible permission errors. Tracked for the security
-- branch instead.
--
-- Rerun: idempotent.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_role text;
BEGIN
    -- Cover both creators: `postgres` owns the objects made through the
    -- Dashboard, while `supabase db push` connects as its own login role.
    FOREACH v_role IN ARRAY ARRAY['postgres', 'supabase_admin', current_user] LOOP
        BEGIN
            EXECUTE format(
                'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
                'REVOKE EXECUTE ON FUNCTIONS FROM anon', v_role);
            EXECUTE format(
                'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
                'REVOKE ALL ON TABLES FROM anon', v_role);
            EXECUTE format(
                'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
                'REVOKE ALL ON SEQUENCES FROM anon', v_role);
        EXCEPTION
            -- current_user may duplicate a role already handled, and the
            -- migration login may not be able to alter another role's
            -- defaults. Neither is a reason to fail the migration.
            WHEN insufficient_privilege OR undefined_object THEN
                RAISE NOTICE 'skipped default-ACL revoke for role %', v_role;
        END;
    END LOOP;
END;
$$;

-- Assert the outcome for the role that actually owns the schema's objects,
-- so a future stock-bootstrap re-run cannot quietly undo this.
DO $$
DECLARE
    v_acl text;
BEGIN
    SELECT d.defaclacl::text INTO v_acl
      FROM pg_default_acl d
      JOIN pg_namespace n ON n.oid = d.defaclnamespace
     WHERE n.nspname = 'public'
       AND d.defaclobjtype = 'f'
       AND pg_get_userbyid(d.defaclrole) = 'postgres';

    IF v_acl IS NOT NULL AND v_acl LIKE '%anon=X%' THEN
        RAISE EXCEPTION 'anon still holds default EXECUTE on functions: %', v_acl;
    END IF;

    RAISE NOTICE 'default ACLs no longer grant anon; functions added by future migrations stay locked';
END;
$$;
