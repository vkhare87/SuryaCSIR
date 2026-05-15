import { useState, useMemo } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import type { StaffMember } from '../../types';

interface StaffPickerProps {
  onSelect: (staff: StaffMember) => void;
  excludeIds?: string[];
  placeholder?: string;
  filter?: (s: StaffMember) => boolean;
  maxResults?: number;
}

export function StaffPicker({
  onSelect,
  excludeIds = [],
  placeholder = 'Search staff by name...',
  filter,
  maxResults = 10,
}: StaffPickerProps) {
  const { staff } = useData();
  const [searchTerm, setSearchTerm] = useState('');

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);

  const results = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return staff
      .filter((s) => {
        if (excludeSet.has(s.ID)) return false;
        if (filter && !filter(s)) return false;
        return s.Name.toLowerCase().includes(term);
      })
      .slice(0, maxResults);
  }, [staff, searchTerm, excludeSet, filter, maxResults]);

  const handlePick = (member: StaffMember) => {
    onSelect(member);
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
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
        />
      </div>

      {results.length > 0 && (
        <div className="border border-border rounded-lg bg-surface shadow-sm max-h-48 overflow-y-auto">
          {results.map((s) => (
            <button
              key={s.ID}
              type="button"
              onClick={() => handlePick(s)}
              className="w-full text-left px-3 py-2 text-sm text-text hover:bg-surface-hover flex items-center gap-2"
            >
              <UserPlus size={14} className="text-text-muted shrink-0" />
              <span className="truncate">{s.Name}</span>
              <span className="text-text-muted text-xs ml-auto truncate">
                {s.Designation || s.Division}
              </span>
            </button>
          ))}
        </div>
      )}

      {searchTerm.trim() && results.length === 0 && (
        <p className="text-xs text-text-muted px-1">No staff match.</p>
      )}
    </div>
  );
}
