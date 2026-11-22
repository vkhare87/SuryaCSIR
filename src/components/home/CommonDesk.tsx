import { CalendarDays, ChevronLeft, ChevronRight, Inbox, Users } from 'lucide-react';
import { useHome } from '../../contexts/HomeContext';
import { MyDayBlock } from './common/MyDayBlock';
import { MyRequestsBlock } from './common/MyRequestsBlock';
import { NoticesBlock } from './common/NoticesBlock';
import { PeopleBlock } from './common/PeopleBlock';
import { WaitingOnMeBlock } from './common/WaitingOnMeBlock';
import { MyCommitteesBlock } from './common/MyCommitteesBlock';

export function CommonDesk() {
  const { commonDeskCollapsed, toggleCommonDesk, rankedActions } = useHome();

  if (commonDeskCollapsed) {
    return (
      <aside
        aria-label="Common Desk (collapsed)"
        className="w-full min-[1100px]:w-14 shrink-0 rounded-xl border border-border bg-surface p-2 flex min-[1100px]:flex-col items-center justify-between min-[1100px]:justify-start gap-3"
      >
        <button
          type="button"
          onClick={toggleCommonDesk}
          aria-label="Expand Common Desk"
          title="Expand Common Desk"
          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex min-[1100px]:flex-col items-center gap-3 text-text-muted text-[11px] font-mono tabular-nums">
          <span title="My day" className="flex flex-col items-center gap-0.5">
            <CalendarDays size={15} />
          </span>
          <span title="Waiting on me" className="flex flex-col items-center gap-0.5">
            <Inbox size={15} />
            <span>{rankedActions.length}</span>
          </span>
          <span title="People" className="flex flex-col items-center gap-0.5">
            <Users size={15} />
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside aria-label="Common Desk" className="w-full min-[1100px]:w-[320px] shrink-0 space-y-4">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
          Common Desk
        </span>
        <button
          type="button"
          onClick={toggleCommonDesk}
          aria-label="Collapse Common Desk"
          title="Collapse Common Desk"
          className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-hover"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Four always-shown blocks */}
      <MyDayBlock />
      <MyRequestsBlock />
      <NoticesBlock />
      <PeopleBlock />

      {/* Conditional blocks — absent from DOM when empty */}
      <WaitingOnMeBlock />
      <MyCommitteesBlock />
    </aside>
  );
}
