/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { UserAccount, Role } from '../types';
import { supabase } from '../utils/supabaseClient';

interface AuthContextType {
  user: UserAccount | null;
  isAuthenticated: boolean;
  role: Role | null;
  divisionCode: string | null;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  clearMustChangePassword: () => Promise<void>;
  isLoading: boolean;
  hasPermission: (allowedRoles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Clear legacy hardcoded session on first render — migrates users from old system
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('surya_session');
  }

  const [user, setUser] = useState<UserAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const resolveUserRole = async (authUser: SupabaseUser) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('user_roles')
      .select('role, division_code, must_change_password')
      .eq('user_id', authUser.id)
      .single();
    if (error || !data) {
      await supabase.auth.signOut();
      setUser(null);
      return;
    }
    setUser({
      id: authUser.id,
      email: authUser.email ?? '',
      role: data.role as Role,
      divisionCode: data.division_code ?? null,
      mustChangePassword: data.must_change_password ?? false,
    });
    // Update last_seen_at for audit log (allowed by RLS policy "Users can update own last_seen_at")
    await supabase
      .from('user_roles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', authUser.id);
  };

  useEffect(() => {
    if (!supabase) {
      // Not provisioned — mock mode; skip session restore
      setIsLoading(false);
      return;
    }

    // Resolve existing session first, THEN subscribe to changes.
    // setIsLoading(false) only after getSession resolves — prevents auth flash.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await resolveUserRole(session.user);
      }
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
        } else if (session?.user) {
          await resolveUserRole(session.user);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // resolveUserRole is defined inside component — stable ref, no dep needed

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // DEV BYPASS — remove before production
    if (email === 'admin@dev.local' && password === 'admin123') {
      setUser({ id: 'dev-admin', email, role: 'SystemAdmin', divisionCode: null, mustChangePassword: false });
      return { success: true };
    }
    if (!supabase) {
      return { success: false, error: 'Database not provisioned. Configure Supabase in Setup.' };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, error: error.message };
    }
    // onAuthStateChange SIGNED_IN event fires and calls resolveUserRole automatically.
    return { success: true };
  };

  const logout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    // Remove any legacy surya_session key that may linger from the old hardcoded system
    localStorage.removeItem('surya_session');
    setUser(null);
  };

  const clearMustChangePassword = async () => {
    if (!supabase || !user) return;
    await supabase
      .from('user_roles')
      .update({ must_change_password: false })
      .eq('user_id', user.id);
    setUser((prev) => prev ? { ...prev, mustChangePassword: false } : prev);
  };

  const hasPermission = (allowedRoles: Role[]) => {
    if (!user) return false;
    return allowedRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      role: user?.role ?? null,
      divisionCode: user?.divisionCode ?? null,
      mustChangePassword: user?.mustChangePassword ?? false,
      login,
      logout,
      clearMustChangePassword,
      isLoading,
      hasPermission
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
