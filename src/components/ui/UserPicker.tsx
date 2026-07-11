import { useState, useMemo } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { useUserDirectory, type DirectoryUser } from '../../hooks/useUserDirectory';
import type { Role } from '../../types';

interface UserPickerProps {
  onSelect: (option: DirectoryUser) => void;
  excludeIds?: string[];
  roleFilter?: Role[];
  placeholder?: string;
  maxResults?: number;
}

/** Searches real Supabase Auth accounts by name/email and resolves to a user_id —
 * for assigning committee roles that reference auth.users, not the HR staff table.
 */
export function UserPicker({
  onSelect,
  excludeIds = [],
  roleFilter,
  placeholder = 'Search by name or email...',
  maxResults = 10,
}: UserPickerProps) {
  const { users: options, loading } = useUserDirectory();
  const [searchTerm, setSearchTerm] = useState('');

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);
  const roleFilterSet = useMemo(() => roleFilter ? new Set(roleFilter) : null, [roleFilter]);

  const results = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return options
      .filter(o => {
        if (excludeSet.has(o.userId)) return false;
        if (roleFilterSet && !o.roles.some(r => roleFilterSet.has(r))) return false;
        return (o.name ?? '').toLowerCase().includes(term) || (o.email ?? '').toLowerCase().includes(term);
      })
      .slice(0, maxResults);
  }, [options, searchTerm, excludeSet, roleFilterSet, maxResults]);

  const handlePick = (option: DirectoryUser) => {
    onSelect(option);
    setSearchTerm('');
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={loading ? 'Loading users…' : placeholder}
          disabled={loading}
          className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none disabled:opacity-60"
        />
      </div>

      {results.length > 0 && (
        <div className="border border-border rounded-lg bg-surface shadow-sm max-h-48 overflow-y-auto">
          {results.map((o) => (
            <button
              key={o.userId}
              type="button"
              onClick={() => handlePick(o)}
              className="w-full text-left px-3 py-2 text-sm text-text hover:bg-surface-hover flex items-center gap-2"
            >
              <UserPlus size={14} className="text-text-muted shrink-0" />
              <span className="truncate">{o.name ?? o.email ?? o.userId}</span>
              {o.name && <span className="text-text-muted text-xs truncate">{o.email}</span>}
              <span className="text-text-muted text-xs ml-auto truncate">{o.roles[0] ?? ''}</span>
            </button>
          ))}
        </div>
      )}

      {searchTerm.trim() && !loading && results.length === 0 && (
        <p className="text-xs text-text-muted px-1">No matching user accounts.</p>
      )}
    </div>
  );
}
