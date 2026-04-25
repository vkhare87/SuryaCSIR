import { useState, useEffect } from 'react';
import { Users, Shield, RefreshCw, Trash2, Plus } from 'lucide-react';
import { supabase, isProvisioned } from '../../utils/supabaseClient';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from './KpiCard';
import type { Role } from '../../types';

interface UserRow {
  user_id: string;
  email: string | null;
  must_change_password: boolean;
  last_seen_at: string | null;
  roles: string[];
}

const ALL_ROLE_VALUES: Role[] = [
  'Director', 'DivisionHead', 'HOD', 'Scientist', 'Technician',
  'HRAdmin', 'FinanceAdmin', 'SystemAdmin', 'MasterAdmin',
  'Student', 'ProjectStaff', 'Guest', 'DefaultUser',
];

const ROLE_COLORS: Record<string, string> = {
  Director: 'bg-[#fdf0e8] text-[#c96442]',
  DivisionHead: 'bg-[#e8f4fd] text-[#1a6b9a]',
  HOD: 'bg-[#e8f4fd] text-[#1a6b9a]',
  Scientist: 'bg-[#f0f8f0] text-[#3a7a3a]',
  Technician: 'bg-[#f5f4ed] text-[#4d4c48]',
  HRAdmin: 'bg-[#fdf5e8] text-[#a07020]',
  FinanceAdmin: 'bg-[#fdf5e8] text-[#a07020]',
  SystemAdmin: 'bg-[#f0e8fd] text-[#6a3aaa]',
  MasterAdmin: 'bg-[#141413] text-[#faf9f5]',
  Student: 'bg-[#e8fdf5] text-[#1a7a5a]',
  ProjectStaff: 'bg-[#f5e8fd] text-[#7a1a9a]',
  Guest: 'bg-[#f5f4ed] text-[#87867f]',
  DefaultUser: 'bg-[#f5e8e8] text-[#a03333]',
};

export function MasterAdminView() {
  const provisioned = isProvisioned();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingRoleFor, setAddingRoleFor] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<Role>('DefaultUser');
  const [newDivCode, setNewDivCode] = useState('');

  const fetchUsers = async () => {
    if (!supabase || !provisioned) return;
    setLoading(true);

    // Fetch all profiles (has email)
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, email, must_change_password, last_seen_at');

    // Fetch all role assignments
    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('user_id, role');

    if (!profiles) { setLoading(false); return; }

    // Group roles by user_id
    const rolesByUser: Record<string, string[]> = {};
    (roleRows ?? []).forEach(r => {
      if (!rolesByUser[r.user_id]) rolesByUser[r.user_id] = [];
      rolesByUser[r.user_id].push(r.role);
    });

    setUsers(profiles.map(p => ({
      user_id: p.user_id,
      email: p.email,
      must_change_password: p.must_change_password,
      last_seen_at: p.last_seen_at,
      roles: rolesByUser[p.user_id] ?? [],
    })));
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, [provisioned]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddRole = async (userId: string) => {
    if (!supabase || !newRole) return;
    await supabase.from('user_roles').upsert({
      user_id: userId,
      role: newRole,
      division_code: newDivCode || null,
      must_change_password: false,
    });
    setAddingRoleFor(null);
    setNewRole('DefaultUser');
    setNewDivCode('');
    fetchUsers();
  };

  const handleRemoveRole = async (userId: string, role: string) => {
    if (!supabase) return;
    await supabase.from('user_roles').delete()
      .eq('user_id', userId).eq('role', role);
    fetchUsers();
  };

  const handleResetPassword = async (userId: string) => {
    if (!supabase) return;
    await supabase.from('user_profiles').update({ must_change_password: true }).eq('user_id', userId);
    fetchUsers();
  };

  const formatLastSeen = (ts: string | null) => {
    if (!ts) return 'Never';
    try { return new Date(ts).toLocaleString(); } catch { return 'Never'; }
  };

  if (!provisioned) {
    return (
      <div className="space-y-8 pb-12">
        <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">Master Administration</h1>
        <div className="bg-[#faf9f5] border border-[#f0eee6] rounded-[12px] p-8 text-center">
          <p className="text-sm font-medium text-[#4d4c48]">Connect to Supabase via Setup to manage users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
            Master Administration
          </h1>
          <p className="text-[#87867f] mt-1 text-sm font-medium">
            User & role management for all SURYA accounts
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="flex items-center gap-2 px-4 py-2 border border-[#e8e6dc] rounded-[8px] text-xs font-semibold text-[#87867f] hover:bg-[#f5f4ed] transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="bg-[#f5f4ed] border border-[#e8e6dc] rounded-[8px] px-5 py-3 text-sm text-[#4d4c48]">
        To create new accounts, use the{' '}
        <span className="font-semibold">Supabase Auth Dashboard</span>.
        New users are auto-assigned <span className="font-mono text-[#c96442]">DefaultUser</span> role on first sign-up.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md">
        <KpiCard label="Total Users" value={users.length} icon={<Users size={18} />} sublabel="Registered accounts" />
        <KpiCard
          label="Pending Access"
          value={users.filter(u => u.roles.length === 1 && u.roles[0] === 'DefaultUser').length}
          icon={<Shield size={18} />}
          sublabel="DefaultUser only"
        />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0eee6]">
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Users & Roles</h2>
        </div>

        {loading ? (
          <div className="px-6 py-8 text-center text-[#87867f] text-xs">Loading users...</div>
        ) : (
          <div className="divide-y divide-[#f0eee6]">
            {users.map(u => (
              <div key={u.user_id} className="px-6 py-4 hover:bg-[#f5f4ed]/50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#141413]">
                        {u.email ?? <span className="font-mono text-[#b0aea5]">{u.user_id.substring(0, 12)}...</span>}
                      </span>
                      {u.must_change_password && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#fdf0e8] text-[#c96442]">
                          Password reset pending
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#b0aea5]">Last seen: {formatLastSeen(u.last_seen_at)}</div>

                    {/* Role badges */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {u.roles.map(role => (
                        <div key={role} className="flex items-center gap-1">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[role] ?? 'bg-[#f5f4ed] text-[#4d4c48]'}`}>
                            {role}
                          </span>
                          <button
                            onClick={() => handleRemoveRole(u.user_id, role)}
                            className="text-[#b0aea5] hover:text-[#b53333] transition-colors"
                            title={`Remove ${role}`}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleResetPassword(u.user_id)}
                      className="text-[11px] font-semibold text-[#87867f] hover:text-[#4d4c48] border border-[#e8e6dc] px-3 py-1.5 rounded-[6px] hover:bg-[#f5f4ed] transition-colors"
                    >
                      Reset Password
                    </button>
                    <button
                      onClick={() => { setAddingRoleFor(u.user_id); setNewRole('DefaultUser'); setNewDivCode(''); }}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-[#faf9f5] bg-[#c96442] hover:bg-[#b5593b] px-3 py-1.5 rounded-[6px] transition-colors"
                    >
                      <Plus size={12} />
                      Add Role
                    </button>
                  </div>
                </div>

                {/* Add role inline form */}
                {addingRoleFor === u.user_id && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap p-3 bg-[#f5f4ed] rounded-[8px] border border-[#e8e6dc]">
                    <select
                      value={newRole}
                      onChange={e => setNewRole(e.target.value as Role)}
                      className="border border-[#e8e6dc] rounded-[6px] px-2 py-1.5 text-xs text-[#4d4c48] bg-[#faf9f5] focus:outline-none focus:ring-1 focus:ring-[#c96442]"
                    >
                      {ALL_ROLE_VALUES.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    {(newRole === 'DivisionHead' || newRole === 'HOD' || newRole === 'Technician') && (
                      <input
                        type="text"
                        value={newDivCode}
                        onChange={e => setNewDivCode(e.target.value)}
                        placeholder="Division code"
                        className="border border-[#e8e6dc] rounded-[6px] px-2 py-1.5 text-xs text-[#4d4c48] bg-[#faf9f5] focus:outline-none focus:ring-1 focus:ring-[#c96442] w-32"
                      />
                    )}
                    <button
                      onClick={() => handleAddRole(u.user_id)}
                      className="text-xs font-semibold text-[#faf9f5] bg-[#c96442] px-3 py-1.5 rounded-[6px] hover:bg-[#b5593b] transition-colors"
                    >
                      Assign
                    </button>
                    <button
                      onClick={() => setAddingRoleFor(null)}
                      className="text-xs font-semibold text-[#87867f] hover:text-[#4d4c48] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
            {users.length === 0 && (
              <div className="px-6 py-8 text-center text-[#87867f] text-xs italic">
                No users found.
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
