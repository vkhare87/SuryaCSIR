import { useState, useEffect } from 'react';
import { Users, Wifi } from 'lucide-react';
import { supabase, isProvisioned } from '../../utils/supabaseClient';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from './KpiCard';
import type { Role } from '../../types';

interface UserRoleRow {
  user_id: string;
  role: string;
  division_code: string | null;
  last_seen_at: string | null;
}

const ALL_ROLE_VALUES: Role[] = [
  'Director', 'DivisionHead', 'Scientist', 'Technician',
  'HRAdmin', 'FinanceAdmin', 'SystemAdmin',
];

export function SystemAdminView() {
  const provisioned = isProvisioned();

  const [userRoles, setUserRoles] = useState<UserRoleRow[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [newRoleValue, setNewRoleValue] = useState<string>('');

  useEffect(() => {
    if (!supabase || !provisioned) return;
    setLoadingRoles(true);
    supabase.from('user_roles').select('*').then(({ data, error }) => {
      if (!error && data) setUserRoles(data as UserRoleRow[]);
      setLoadingRoles(false);
    });
  }, [provisioned]);

  const handleRoleUpdate = async (userId: string, newRole: string) => {
    if (!supabase) return;
    await supabase
      .from('user_roles')
      .upsert({ user_id: userId, role: newRole, division_code: null })
      .eq('user_id', userId);
    setEditingUserId(null);
    const { data } = await supabase.from('user_roles').select('*');
    if (data) setUserRoles(data as UserRoleRow[]);
  };

  const handleRoleDelete = async (userId: string) => {
    if (!supabase) return;
    await supabase.from('user_roles').delete().eq('user_id', userId);
    setUserRoles(prev => prev.filter(r => r.user_id !== userId));
  };

  const formatLastSeen = (lastSeenAt: string | null): string => {
    if (!lastSeenAt) return 'Never';
    try {
      return new Date(lastSeenAt).toLocaleString();
    } catch {
      return 'Never';
    }
  };

  if (!provisioned) {
    return (
      <div className="space-y-8 pb-12">
        <div>
          <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
            System Administration
          </h1>
        </div>
        <div className="bg-[#faf9f5] border border-[#f0eee6] rounded-[12px] p-8 text-center">
          <p className="text-sm font-medium text-[#4d4c48]">
            Connect to Supabase via Setup to manage users.
          </p>
          <p className="text-xs text-[#87867f] mt-2">
            Navigate to <span className="font-mono text-[#c96442]">/setup</span> to configure your Supabase connection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
          System Administration
        </h1>
        <p className="text-[#87867f] mt-1 text-sm font-medium">
          User role management and system status
        </p>
      </div>

      {/* Notice */}
      <div className="bg-[#f5f4ed] border border-[#e8e6dc] rounded-[8px] px-5 py-3 text-sm text-[#4d4c48]">
        To create new user accounts, use the <span className="font-semibold">Supabase Auth Dashboard</span> or run{' '}
        <span className="font-mono text-[#c96442]">seed.sql</span>. Role assignment for existing users is managed here.
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md">
        <KpiCard
          label="Registered Users"
          value={userRoles.length}
          icon={<Users size={18} />}
          sublabel="With role assignments"
        />
        <KpiCard
          label="Supabase Status"
          value={provisioned ? 'Connected' : 'Not Connected'}
          icon={<Wifi size={18} />}
          sublabel={provisioned ? 'Backend provisioned' : 'Running in demo mode'}
        />
      </div>

      {/* User Roles Table */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0eee6]">
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">User Roles</h2>
        </div>

        {loadingRoles ? (
          <div className="px-6 py-8 text-center text-[#87867f] text-xs">
            Loading user roles...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f4ed]">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">User ID</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Role</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Division</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Last Seen</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eee6]">
                {userRoles.map(row => (
                  <tr key={row.user_id} className="hover:bg-[#f5f4ed] transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-[#87867f]">
                      {row.user_id.substring(0, 8)}...
                    </td>
                    <td className="px-6 py-3">
                      {editingUserId === row.user_id ? (
                        <select
                          value={newRoleValue}
                          onChange={e => setNewRoleValue(e.target.value)}
                          className="border border-[#e8e6dc] rounded-[6px] px-2 py-1 text-xs text-[#4d4c48] bg-[#faf9f5] focus:outline-none focus:ring-1 focus:ring-[#c96442]"
                        >
                          {ALL_ROLE_VALUES.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[#4d4c48] font-medium">{row.role}</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-[#87867f] font-mono text-xs">
                      {row.division_code ?? '—'}
                    </td>
                    <td className="px-6 py-3 text-[#87867f] text-xs">
                      {formatLastSeen(row.last_seen_at)}
                    </td>
                    <td className="px-6 py-3">
                      {editingUserId === row.user_id ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRoleUpdate(row.user_id, newRoleValue)}
                            className="text-xs font-semibold text-[#faf9f5] bg-[#c96442] px-3 py-1 rounded-[6px] hover:bg-[#b5593b] transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingUserId(null)}
                            className="text-xs font-semibold text-[#87867f] hover:text-[#4d4c48] transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              setEditingUserId(row.user_id);
                              setNewRoleValue(row.role);
                            }}
                            className="text-xs font-semibold text-[#c96442] hover:text-[#b5593b] hover:underline transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRoleDelete(row.user_id)}
                            className="text-xs font-semibold text-[#87867f] hover:text-[#b53333] hover:underline transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {userRoles.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-[#87867f] text-xs italic">
                      No user roles found. Run seed.sql to create the first SystemAdmin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
