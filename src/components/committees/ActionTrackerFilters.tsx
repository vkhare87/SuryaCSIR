import { Search } from 'lucide-react';
import type { Committee } from '../../types';

interface ActionTrackerFiltersProps {
  statusFilter: string;
  onStatusChange: (status: string) => void;
  committeeFilter: string;
  onCommitteeChange: (id: string) => void;
  assigneeSearch: string;
  onAssigneeSearchChange: (search: string) => void;
  committees: Committee[];
}

const STATUSES = ['All', 'Pending', 'In Progress', 'Completed', 'Overdue'] as const;

export function ActionTrackerFilters({
  statusFilter,
  onStatusChange,
  committeeFilter,
  onCommitteeChange,
  assigneeSearch,
  onAssigneeSearchChange,
  committees,
}: ActionTrackerFiltersProps) {
  return (
    <div className="flex gap-3 flex-wrap items-center">
      {/* Status chips */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUSES.map((status) => {
          const isActive = statusFilter === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => onStatusChange(status)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                isActive
                  ? 'bg-[#c96442]/10 text-[#c96442] border-[#c96442]/30'
                  : 'border-border text-text-muted hover:bg-surface-hover'
              }`}
            >
              {status}
            </button>
          );
        })}
      </div>

      {/* Committee dropdown */}
      <select
        value={committeeFilter}
        onChange={(e) => onCommitteeChange(e.target.value)}
        className="px-3 py-1.5 text-xs border border-border rounded-lg bg-surface text-text-muted focus:outline-none focus:ring-1 focus:ring-[#c96442]/30"
      >
        <option value="All">All Committees</option>
        {committees.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {/* Assignee search */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
        <input
          type="text"
          placeholder="Search assignee..."
          value={assigneeSearch}
          onChange={(e) => onAssigneeSearchChange(e.target.value)}
          className="pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg bg-surface text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-[#c96442]/30 w-48"
        />
      </div>
    </div>
  );
}
