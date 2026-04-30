/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { UserAccount, Role } from '../types';
import { supabase } from '../utils/supabaseClient';

interface AuthContextType {
  user: UserAccount | null;
  isAuthenticated: boolean;
  role: Role | null;           // activeRole alias — backward-compat for all consumers
  roles: Role[];               // all assigned roles
  activeRole: Role | null;
  divisionCode: string | null;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; otpSent?: boolean }>;
  logout: () => Promise<void>;
  clearMustChangePassword: () => Promise<void>;
  setActiveRole: (role: Role) => Promise<void>;
  isLoading: boolean;
  hasPermission: (allowedRoles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('surya_session');
  }

  const [user, setUser] = useState<UserAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const resolveUserRoles = async (authUser: SupabaseUser): Promise<boolean> => {
    if (!supabase) return false;

    // Fetch all role rows for this user
    const { data: roleRows, error: rolesError } = await supabase
      .from('user_roles')
      .select('role, division_code')
      .eq('user_id', authUser.id);

    if (rolesError || !roleRows || roleRows.length === 0) {
      await supabase.auth.signOut();
      setUser(null);
      return false;
    }

    // Fetch per-user profile (must_change_password, active_role, last_seen_at)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('must_change_password, active_role, last_seen_at')
      .eq('user_id', authUser.id)
      .single();

    const roles = roleRows.map(r => r.role as Role);

    // active_role: use saved preference if it's still a valid assigned role, else default to first
    const savedActive = profile?.active_role as Role | null;
    const activeRole: Role = (savedActive && roles.includes(savedActive)) ? savedActive : roles[0];

    // division_code: take from the active role's row
    const activeRow = roleRows.find(r => r.role === activeRole) ?? roleRows[0];
    const divisionCode = activeRow.division_code ?? null;

    const mustChangePassword = profile?.must_change_password ?? false;

    setUser({
      id: authUser.id,
      email: authUser.email ?? '',
      roles,
      activeRole,
      divisionCode,
      mustChangePassword,
    });

    // Update last_seen_at in user_profiles
    await supabase
      .from('user_profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', authUser.id);

    return true;
  };

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await resolveUserRoles(session.user);
      }
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
        } else if (session?.user) {
          await resolveUserRoles(session.user);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string; otpSent?: boolean }> => {
    // DEV BYPASS — remove before production
    if (email === 'admin@dev.local' && password === 'admin123') {
      setUser({
        id: 'dev-admin',
        email,
        roles: ['SystemAdmin'],
        activeRole: 'SystemAdmin',
        divisionCode: null,
        mustChangePassword: false,
      });
      return { success: true };
    }
    if (!supabase) {
      return { success: false, error: 'Database not provisioned. Configure Supabase in Setup.' };
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.toLowerCase().includes('database error querying schema')) {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        });
        if (!otpError) {
          return { success: false, otpSent: true };
        }
        return { success: false, error: 'Login failed and a recovery link could not be sent. Please contact your administrator.' };
      }
      return { success: false, error: error.message };
    }
    if (data.user) {
      const resolved = await resolveUserRoles(data.user);
      if (!resolved) {
        return { success: false, error: 'Your account has no assigned role. Please contact your system administrator.' };
      }
    }
    return { success: true };
  };

  const logout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem('surya_session');
    setUser(null);
  };

  const clearMustChangePassword = async () => {
    if (!supabase || !user) return;
    await supabase
      .from('user_profiles')
      .update({ must_change_password: false })
      .eq('user_id', user.id);
    setUser((prev) => prev ? { ...prev, mustChangePassword: false } : prev);
  };

  const setActiveRole = async (role: Role) => {
    if (!user || !user.roles.includes(role)) return;

    // Find division_code for the new active role
    let newDivisionCode: string | null = null;
    if (supabase) {
      const { data } = await supabase
        .from('user_roles')
        .select('division_code')
        .eq('user_id', user.id)
        .eq('role', role)
        .single();
      newDivisionCode = data?.division_code ?? null;

      await supabase
        .from('user_profiles')
        .update({ active_role: role })
        .eq('user_id', user.id);
    }

    setUser((prev) => prev ? { ...prev, activeRole: role, divisionCode: newDivisionCode } : prev);
  };

  const hasPermission = (allowedRoles: Role[]) => {
    if (!user) return false;
    return user.roles.some(r => allowedRoles.includes(r));
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      role: user?.activeRole ?? null,        // backward-compat alias
      roles: user?.roles ?? [],
      activeRole: user?.activeRole ?? null,
      divisionCode: user?.divisionCode ?? null,
      mustChangePassword: user?.mustChangePassword ?? false,
      login,
      logout,
      clearMustChangePassword,
      setActiveRole,
      isLoading,
      hasPermission,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
