import { useState } from 'react';
import { Badge } from '../ui/Cards';
import { supabase } from '../../utils/supabaseClient';
import type { ActionItem } from '../../types';

interface KanbanCardProps {
  item: ActionItem;
  committeeName: string;
  assigneeName: string;
  onStatusChange: () => void;
  canEdit: boolean;
}

const statusVariant: Record<string, 'warning' | 'info' | 'success'> = {
  Pending: 'warning',
  InProgress: 'info',
  Completed: 'success',
};

export function KanbanCard({
  item,
  committeeName,
  assigneeName,
  onStatusChange,
  canEdit,
}: KanbanCardProps) {
  const [now] = useState(() => Date.now());

  const isOverdue =
    item.status !== 'Completed' &&
    item.deadline &&
    new Date(item.deadline).getTime() < now;

  const daysOverdue = isOverdue
    ? Math.floor((now - new Date(item.deadline).getTime()) / 86400000)
    : 0;

  const cycleStatus = async () => {
    if (!canEdit) return;
    const next: Record<string, ActionItem['status']> = {
      Pending: 'InProgress',
      InProgress: 'Completed',
      Completed: 'Pending',
    };
    const newStatus = next[item.status];
    await supabase!
      .from('action_items')
      .update({
        status: newStatus,
        completed_at:
          newStatus === 'Completed' ? new Date().toISOString() : null,
      })
      .eq('id', item.id);
    onStatusChange();
  };

  const deadlineDate = item.deadline
    ? new Date(item.deadline).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div
      className={`bg-surface border rounded-lg p-3 space-y-2 ${
        isOverdue ? 'border-l-4 border-l-red-500' : 'border-border'
      }`}
    >
      {/* Task name */}
      <p className="text-sm font-medium text-text">{item.task}</p>

      {/* Committee name */}
      <p className="text-xs text-text-muted">{committeeName}</p>

      {/* Assignee */}
      <p className="text-xs text-text-muted">
        {'Assigned to: '}
        {assigneeName}
      </p>

      {/* Deadline row */}
      <div className="flex items-center gap-2 text-xs">
        {deadlineDate ? (
          <span className={isOverdue ? 'text-red-500 font-medium' : 'text-text-muted'}>
            {deadlineDate}
          </span>
        ) : (
          <span className="text-text-muted">No deadline</span>
        )}
        {isOverdue && (
          <span className="text-red-500 font-semibold">+{daysOverdue}d</span>
        )}
      </div>

      {/* Status badge + overdue indicator */}
      <div className="flex items-center gap-2">
        <span
          onClick={canEdit ? cycleStatus : undefined}
          className={canEdit ? 'cursor-pointer' : undefined}
        >
          <Badge variant={statusVariant[item.status]}>{item.status}</Badge>
        </span>
        {isOverdue && (
          <Badge variant="danger">Overdue</Badge>
        )}
      </div>
    </div>
  );
}
