import { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { Badge } from '../ui/Cards';
import { Search, X, Plus, UserPlus } from 'lucide-react';
// SelectedMember interface used directly — no external type import needed

type MemberRole = 'Member' | 'Invitee' | 'ExternalExpert';

export interface SelectedMember {
  staffId: string;
  staffName: string;
  role: MemberRole;
}

interface MemberPickerProps {
  selected: SelectedMember[];
  onChange: (members: SelectedMember[]) => void;
}

const ROLE_BADGE_VARIANT: Record<MemberRole, 'info' | 'neutral' | 'warning'> = {
  Member: 'info',
  Invitee: 'neutral',
  ExternalExpert: 'warning',
};

export function MemberPicker({ selected, onChange }: MemberPickerProps) {
  const { staff } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [roleForNew, setRoleForNew] = useState<MemberRole>('Member');

  const filteredStaff = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    const selectedIds = new Set(selected.map(m => m.staffId));
    return staff
      .filter(s => s.Name.toLowerCase().includes(term) && !selectedIds.has(s.ID))
      .slice(0, 10);
  }, [staff, searchTerm, selected]);

  const addMember = (staffId: string, staffName: string) => {
    onChange([...selected, { staffId, staffName, role: roleForNew }]);
    setSearchTerm('');
    setShowDropdown(false);
  };

  const removeMember = (staffId: string) => {
    onChange(selected.filter(m => m.staffId !== staffId));
  };

  const changeRole = (staffId: string, newRole: MemberRole) => {
    onChange(selected.map(m => (m.staffId === staffId ? { ...m, role: newRole } : m)));
  };

  return (
    <div className="space-y-3">
      {/* --- Search Input Row --- */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            placeholder="Search staff by name..."
            className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
          />
        </div>

        {/* Role selector for next add */}
        <select
          value={roleForNew}
          onChange={e => setRoleForNew(e.target.value as MemberRole)}
          className="px-2 py-2 bg-surface border border-border rounded-lg text-xs text-text focus:ring-2 focus:ring-[#3898ec] outline-none"
        >
          <option value="Member">Member</option>
          <option value="Invitee">Invitee</option>
          <option value="ExternalExpert">External Expert</option>
        </select>

        <button
          type="button"
          disabled={!searchTerm.trim()}
          onClick={() => {
            if (searchTerm.trim() && filteredStaff.length > 0) {
              addMember(filteredStaff[0].ID, filteredStaff[0].Name);
            }
          }}
          className="p-2 bg-[#c96442] text-white rounded-lg hover:bg-[#b55a3a] transition-colors disabled:opacity-40 shrink-0"
          title="Add first match"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* --- Dropdown --- */}
      {showDropdown && filteredStaff.length > 0 && (
        <div className="border border-border rounded-lg bg-surface shadow-lg max-h-44 overflow-y-auto">
          {filteredStaff.map(s => (
            <button
              key={s.ID}
              type="button"
              onClick={() => addMember(s.ID, s.Name)}
              className="w-full text-left px-3 py-2 text-sm text-text hover:bg-surface-hover flex items-center gap-2"
            >
              <UserPlus size={14} className="text-text-muted shrink-0" />
              <span>{s.Name}</span>
              <span className="text-text-muted text-xs ml-auto">{s.Division}</span>
            </button>
          ))}
        </div>
      )}

      {/* --- Selected Members --- */}
      <div className="space-y-2">
        {selected.length === 0 ? (
          <p className="text-sm text-text-muted py-2">No members added</p>
        ) : (
          selected.map(m => (
            <div
              key={m.staffId}
              className="flex items-center justify-between gap-3 px-3 py-2 bg-surface border border-border rounded-lg"
            >
              <span className="text-sm text-text flex-1 truncate">{m.staffName}</span>

              <select
                value={m.role}
                onChange={e => changeRole(m.staffId, e.target.value as MemberRole)}
                className="px-2 py-1 bg-surface border border-border rounded text-xs text-text outline-none focus:ring-2 focus:ring-[#3898ec]"
              >
                <option value="Member">Member</option>
                <option value="Invitee">Invitee</option>
                <option value="ExternalExpert">External Expert</option>
              </select>

              <Badge variant={ROLE_BADGE_VARIANT[m.role]}>{m.role}</Badge>

              <button
                type="button"
                onClick={() => removeMember(m.staffId)}
                className="p-1 rounded hover:bg-surface-hover text-text-muted shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
