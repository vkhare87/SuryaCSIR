import { useMemo, useState, useEffect } from 'react';
import { Reorder } from 'framer-motion';
import { KanbanCard } from './KanbanCard';
import { ActionTrackerFilters } from './ActionTrackerFilters';
import { Badge } from '../ui/Cards';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { canEditActionItems } from '../../lib/committees/permissions';
import type { ActionItem } from '../../types';

interface KanbanBoardProps {
  committeeId?: string;
}

// --- Column sub-component ---

function Column({
  title,
  items,
  variant,
  onStatusChange,
  canEdit,
  staffName,
  committeeName,
}: {
  title: string;
  items: ActionItem[];
  variant: 'warning' | 'info' | 'success';
  onStatusChange: () => void;
  canEdit: boolean;
  staffName: (id: string) => string;
  committeeName: (a: ActionItem) => string;
}) {
  const [localItems, setLocalItems] = useState(items);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  return (
    <div className="bg-surface-hover border border-border rounded-xl p-3">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-medium text-text">{title}</h3>
        <Badge variant={variant}>{items.length}</Badge>
      </div>
      <Reorder.Group
        axis="y"
        values={localItems}
        onReorder={setLocalItems}
        className="space-y-2"
      >
        {localItems.map((item) => (
          <Reorder.Item key={item.id} value={item.id}>
            <KanbanCard
              item={item}
              committeeName={committeeName(item)}
              assigneeName={staffName(item.assigned_to)}
              onStatusChange={onStatusChange}
              canEdit={canEdit}
            />
          </Reorder.Item>
        ))}
      </Reorder.Group>
      {items.length === 0 && (
        <p className="text-xs text-text-muted text-center py-4">No items</p>
      )}
    </div>
  );
}

// --- Main Board ---

export function KanbanBoard({ committeeId }: KanbanBoardProps) {
  const { actionItems, committees, meetings, staff, refreshData } = useData();
  const { user } = useAuth();
  const canEdit = user ? canEditActionItems(user) : false;

  // --- Filters state ---

  const [statusFilter, setStatusFilter] = useState('All');
  const [committeeFilter, setCommitteeFilter] = useState(committeeId ?? 'All');
  const [assigneeSearch, setAssigneeSearch] = useState('');

  // --- Derived action items ---

  const filtered = useMemo(() => {
    let items = actionItems;

    // Scope to committee if committeeId is provided
    if (committeeId) {
      const committeeMeetingIds = new Set(
        meetings
          .filter((m) => m.committee_id === committeeId)
          .map((m) => m.id)
      );
      items = items.filter(
        (a) =>
          (a.meeting_id && committeeMeetingIds.has(a.meeting_id)) ||
          a.source === 'manual'
      );
    }

    // Status filter
    if (statusFilter !== 'All') {
      if (statusFilter === 'Overdue') {
        items = items.filter(
          (a) =>
            a.status !== 'Completed' &&
            a.deadline &&
            new Date(a.deadline) < new Date()
        );
      } else {
        // "In Progress" chip maps to "InProgress" status
        const statusValue =
          statusFilter === 'In Progress' ? 'InProgress' : statusFilter;
        items = items.filter((a) => a.status === statusValue);
      }
    }

    // Committee filter (only when NOT scoped to a single committee)
    if (!committeeId && committeeFilter !== 'All') {
      const filteredMeetingIds = new Set(
        meetings
          .filter((m) => m.committee_id === committeeFilter)
          .map((m) => m.id)
      );
      items = items.filter((a) => {
        if (a.meeting_id && filteredMeetingIds.has(a.meeting_id)) return true;
        return false;
      });
    }

    // Assignee search filter
    if (assigneeSearch.trim()) {
      const q = assigneeSearch.toLowerCase();
      items = items.filter((a) => {
        const s = staff.find((st) => st.ID === a.assigned_to);
        return s ? s.Name.toLowerCase().includes(q) : false;
      });
    }

    return items;
  }, [
    actionItems,
    meetings,
    committeeId,
    statusFilter,
    committeeFilter,
    assigneeSearch,
    staff,
  ]);

  // --- Name helpers ---

  const staffName = (staffId: string) => {
    const s = staff.find((st) => st.ID === staffId);
    return s ? s.Name : staffId;
  };

  const committeeName = (action: ActionItem) => {
    if (action.meeting_id) {
      const mtg = meetings.find((m) => m.id === action.meeting_id);
      if (mtg) {
        const cmt = committees.find((c) => c.id === mtg.committee_id);
        return cmt ? cmt.name : 'Unknown';
      }
    }
    return 'Standalone';
  };

  // --- Refresh after status change ---

  const handleStatusChange = async () => {
    await refreshData?.();
  };

  // --- Group by status ---

  const pending = filtered.filter((a) => a.status === 'Pending');
  const inProgress = filtered.filter((a) => a.status === 'InProgress');
  const completed = filtered.filter((a) => a.status === 'Completed');

  return (
    <div className="space-y-4">
      <ActionTrackerFilters
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        committeeFilter={committeeFilter}
        onCommitteeChange={setCommitteeFilter}
        assigneeSearch={assigneeSearch}
        onAssigneeSearchChange={setAssigneeSearch}
        committees={committees}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Column
          title="Pending"
          items={pending}
          variant="warning"
          onStatusChange={handleStatusChange}
          canEdit={canEdit}
          staffName={staffName}
          committeeName={committeeName}
        />
        <Column
          title="In Progress"
          items={inProgress}
          variant="info"
          onStatusChange={handleStatusChange}
          canEdit={canEdit}
          staffName={staffName}
          committeeName={committeeName}
        />
        <Column
          title="Completed"
          items={completed}
          variant="success"
          onStatusChange={handleStatusChange}
          canEdit={canEdit}
          staffName={staffName}
          committeeName={committeeName}
        />
      </div>
    </div>
  );
}
