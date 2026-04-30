---
name: supabase-rls-patterns
description: How SURYA writes Row Level Security policies. Read before adding any new Supabase table or policy.
---

## Invariants

1. **Every table must have RLS enabled** before any policy is added:
   ```sql
   ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;
   ```

2. **Use helper functions** — never inline role-check subqueries in policies:
   ```sql
   -- Good
   USING (public.user_has_role('MasterAdmin'))
   
   -- Bad — causes RLS recursion
   USING ((SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'MasterAdmin')
   ```

3. **Available helpers:**
   - `public.user_has_role(check_role text) → boolean` — checks user_roles table
   - `pms_is_admin() → boolean` — true if user has HRAdmin, SystemAdmin, or MasterAdmin
   - `pms_is_collegium_member(p_cycle_id uuid) → boolean` — true if user is in collegium for cycle

4. **Policy naming pattern**: `<table>_<operation>_<who>` — e.g., `staff_select`, `staff_write_admin`, `reports_select_owner`.

5. **Separate SELECT policies per access class** (not one mega-policy with OR) when access classes are logically distinct:
   ```sql
   -- Two policies, not one fat OR
   CREATE POLICY "reports_select_owner" ON pms_reports FOR SELECT TO authenticated
     USING (scientist_id = auth.uid());
   
   CREATE POLICY "reports_select_admin" ON pms_reports FOR SELECT TO authenticated
     USING (pms_is_admin());
   ```
   Exception: PMS reports use one combined policy because it combines owner + evaluator + collegium (intrinsically coupled).

6. **Idempotency**: wrap policies in existence checks for migrations that may re-run:
   ```sql
   DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'my_table' AND policyname = 'my_policy') THEN
       CREATE POLICY "my_policy" ON my_table ...;
     END IF;
   END $$;
   ```
   In fresh `00000000000000_init.sql` (applied once) plain `CREATE POLICY` is fine.

7. **`auth.uid()` in stable context**: wrap in subquery `(select auth.uid())` in USING clauses that are evaluated per-row to avoid re-evaluation cost:
   ```sql
   USING ((select auth.uid()) = user_id)
   ```

## Common Patterns

### Own-row read
```sql
CREATE POLICY "profiles_select_own" ON user_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
```

### Admin full access
```sql
CREATE POLICY "table_manage_admin" ON my_table FOR ALL TO authenticated
  USING (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'))
  WITH CHECK (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'));
```

### Read-only for all authenticated
```sql
CREATE POLICY "table_select" ON public.divisions FOR SELECT TO authenticated USING (true);
```

### Write only for specific roles
```sql
CREATE POLICY "table_write" ON public.staff FOR ALL TO authenticated
  USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin'))
  WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin'));
```

### Append-only (INSERT from RPC, no client writes)
```sql
-- No INSERT policy needed if all inserts go through SECURITY DEFINER functions
-- Only add SELECT and UPDATE policies for the client
```

## SECURITY DEFINER RPCs

For tables where client must never write directly (e.g., `pms_audit_logs`, `pms_notifications`): define **no INSERT policy**, and let SECURITY DEFINER functions handle all writes. The function runs as the DB owner, bypassing RLS.

```sql
CREATE OR REPLACE FUNCTION my_rpc(...)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- This INSERT bypasses RLS because of SECURITY DEFINER
  INSERT INTO pms_audit_logs (...) VALUES (...);
END;
$$;
```
