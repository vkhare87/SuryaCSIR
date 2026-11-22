-- 20261122000001_amc_expiry_sweep
-- Roadmap WP-2 A1 (AMC expiry rule): the screens already colour an AMC that
-- ends within 90 days (amcStatus in src/utils/dateUtils.ts); until now nobody
-- was told. The instrument's owner and the head of its division (held or
-- acting) are told once per AMC end date, so a renewed AMC earns a new notice.
--
-- Window: ends within 90 days, or ended up to 30 days ago. An AMC that lapsed
-- long ago is already red on the Facilities page; telling about every one of
-- them on the first run would bury the messages that matter.
-- Tests: scripts/db/amcSweep.db.test.ts.

CREATE OR REPLACE FUNCTION public.amc_expiry_sweep()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_n integer;
BEGIN
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    SELECT DISTINCT w.user_id, 'amc-expiry', 'warning',
           CASE WHEN e.amc_end_date < public.ist_today() THEN 'AMC ended: ' ELSE 'AMC ends soon: ' END
               || coalesce(nullif(e."Name", ''), e."UInsID"),
           e."UInsID" || coalesce(' · ' || nullif(e."Location", ''), '') || ' · AMC until ' || to_char(e.amc_end_date, 'DD Mon YYYY'),
           '/facilities/' || e."UInsID", 'rule', 'amc:' || e."UInsID" || ':' || e.amc_end_date
      FROM public.equipment e
     CROSS JOIN LATERAL (
            SELECT e.owner_user_id AS user_id WHERE e.owner_user_id IS NOT NULL
            UNION
            SELECT user_id FROM public.user_roles
             WHERE role IN ('HOD', 'DivisionHead') AND division_code = e."Division"
            UNION
            SELECT acting_user_id FROM public.acting_assignments
             WHERE role IN ('HOD', 'DivisionHead') AND division_code = e."Division"
               AND public.ist_today() BETWEEN from_on AND to_on) w
     WHERE e.amc_end_date BETWEEN public.ist_today() - 30 AND public.ist_today() + 90
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.amc_expiry_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.amc_expiry_sweep() TO service_role;

-- 01:50 UTC = 07:20 IST, after the home sweep, before the working day.
SELECT cron.schedule('amc-expiry-sweep', '50 1 * * *', 'select public.amc_expiry_sweep()');
