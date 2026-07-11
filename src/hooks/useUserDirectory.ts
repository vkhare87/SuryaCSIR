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
      const [{ data: profiles }, { data: roleRows }] = await Promise.all([
        supabase.from('user_profiles').select('user_id, email'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      if (cancelled) return;
      const rolesByUser = new Map<string, Role[]>();
      for (const r of (roleRows as { user_id: string; role: Role }[]) ?? []) {
        const list = rolesByUser.get(r.user_id) ?? [];
        list.push(r.role);
        rolesByUser.set(r.user_id, list);
      }
      const staffByEmail = new Map(staff.map(s => [(s.Email || '').toLowerCase(), s.Name]));
      const rows: DirectoryUser[] = ((profiles as { user_id: string; email: string | null }[]) ?? []).map(p => ({
        userId: p.user_id,
        email: p.email,
        name: p.email ? staffByEmail.get(p.email.toLowerCase()) ?? null : null,
        roles: rolesByUser.get(p.user_id) ?? [],
      }));
      setUsers(rows);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [staff]);

  return { users, loading };
}
