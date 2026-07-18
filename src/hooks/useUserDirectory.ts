import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useData } from '../contexts/DataContext';
import type { Role } from '../types';

export interface DirectoryUser {
  userId: string;
  email: string | null;
  name: string | null;
  roles: Role[];
}

/** Loads auth accounts (user_profiles + user_roles) joined to HR staff by email,
 * for admin UI that needs to resolve a user_id to a display name — e.g. assigning
 * committee membership, which references auth.users rather than the staff table. */
export function useUserDirectory() {
  const { staff } = useData();
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase) { setLoading(false); return; }
      // user_roles has no broad-select RLS policy (by design — see
      // 20260712000002_auth_rbac.sql); user_directory() RPC is the
      // sanctioned way for any authenticated caller to resolve identities.
      const { data } = await supabase.rpc('user_directory');
      if (cancelled) return;
      const staffByEmail = new Map(staff.map(s => [(s.Email || '').toLowerCase(), s.Name]));
      const rows: DirectoryUser[] = ((data as { user_id: string; email: string | null; roles: Role[] | null }[]) ?? []).map(p => ({
        userId: p.user_id,
        email: p.email,
        name: p.email ? staffByEmail.get(p.email.toLowerCase()) ?? null : null,
        roles: p.roles ?? [],
      }));
      setUsers(rows);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [staff]);

  return { users, loading };
}
