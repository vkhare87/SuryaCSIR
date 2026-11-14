/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import clsx from 'clsx';
import { Card, Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import { dueUrgency } from '../../lib/dashboard/myActions';
import type { MyAction } from '../../lib/dashboard/myActions';
import type { DecisionRow } from '../../lib/home/decisions';
import type { Precheck } from '../../lib/home/prechecks';
import { daysUntil } from '../../lib/home/today';

// Shared by every role's home view, so a block looks the same on every screen.
export const BLOCK_TITLE = 'text-xs font-medium text-text-muted mb-3 flex items-center justify-between gap-2';
export const ROW = 'flex items-center gap-3 py-2.5 border-t border-border first:border-t-0';
export const TITLE_LINK = 'inline-block py-1.5 -my-1.5 hover:underline';

export function dueText(due: string | null, now: Date): { text: string; variant: 'danger' | 'warning' | 'neutral' } | null {
  if (!due) return null;
  const days = daysUntil(due, now);
  if (days < 0) return { text: `${-days} d late`, variant: 'danger' };
  if (days === 0) return { text: 'today', variant: 'warning' };
  return { text: `${days} d`, variant: dueUrgency(due, now) === 'soon' ? 'warning' : 'neutral' };
}

export function TodayRing({ done, total }: { done: number; total: number }) {
  const circumference = 151;
  const share = total === 0 ? 1 : done / total;
  return (
    <svg width="60" height="60" viewBox="0 0 58 58" role="img" aria-label={`${done} of ${total} done today`} className="shrink-0">
      <circle cx="29" cy="29" r="24" fill="none" strokeWidth="5" className="stroke-border" />
      <circle
        cx="29" cy="29" r="24" fill="none" strokeWidth="5" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={Math.round(circumference * (1 - share))}
        transform="rotate(-90 29 29)" className="stroke-archive-green"
      />
      <text x="29" y="33" textAnchor="middle" className="fill-text font-mono text-[13px]">{done}/{total}</text>
    </svg>
  );
}

/** The ring, the one composed sentence, a quiet line under it, and an optional control on the right. */
export function HomeGreeting({ done, total, sentence, sub, right }: {
  done: number; total: number; sentence: string; sub: ReactNode; right?: ReactNode;
}) {
  return (
    <Card className="p-5 flex flex-wrap items-center gap-4">
      <TodayRing done={done} total={total} />
      <div className="min-w-0 flex-1 basis-56">
        <h1 className="font-serif text-xl sm:text-2xl leading-snug text-text">{sentence}</h1>
        <p className="text-xs text-text-muted mt-1">{sub}</p>
      </div>
      {right}
    </Card>
  );
}

export function AskBox({ placeholder, children }: { placeholder: string; children?: ReactNode }) {
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const ask = (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    navigate(q ? `/ask?q=${encodeURIComponent(q)}` : '/ask');
  };
  return (
    <div className="flex flex-wrap gap-2">
      <form onSubmit={ask} className="flex-1 min-w-[220px] relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          value={question} onChange={e => setQuestion(e.target.value)}
          aria-label="Ask or search" placeholder={placeholder}
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-surface-raised text-sm text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/60"
        />
      </form>
      {children}
    </div>
  );
}

export function ActionRow({ action, now }: { action: MyAction; now: Date }) {
  const due = dueText(action.due, now);
  return (
    <Link to={action.link} className={clsx(ROW, 'group')}>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text truncate group-hover:underline" title={action.label}>{action.label}</p>
        <p className="text-xs text-text-muted truncate" title={action.detail}>{action.detail}</p>
      </div>
      {due && <Badge variant={due.variant} className="font-mono normal-case shrink-0">{due.text}</Badge>}
    </Link>
  );
}

/** A block whose data source is not built yet. It says so; it never shows a made-up value. */
export function NotConnected({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <p className={BLOCK_TITLE}><span>{title}</span></p>
      <p className="text-sm text-text-muted">Not connected yet. {children}</p>
    </Card>
  );
}

/** The first item with the screen's one strong button, then the next few as rows. */
export function WaitingOnYou({ actions, now, rows = 5, strong = true, title = 'Waiting on you' }: {
  actions: MyAction[]; now: Date; rows?: number; strong?: boolean; title?: string;
}) {
  const first = actions[0];
  if (!first) return null;
  const due = dueText(first.due, now);
  return (
    <Card className="p-5">
      <p className={BLOCK_TITLE}>
        <span>{title}</span>
        <Link to="/work" className={TITLE_LINK}>See all <span className="font-mono">{actions.length}</span></Link>
      </p>
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <div className="flex-1 min-w-[200px]">
          <p className="text-base font-medium text-text">{first.label}</p>
          <p className="text-sm text-text-muted">{first.detail}</p>
        </div>
        {due && <Badge variant={due.variant} className="font-mono normal-case">{due.text}</Badge>}
        <Link to={first.link}><Button type="button" variant={strong ? 'primary' : 'secondary'}>Open</Button></Link>
      </div>
      {actions.slice(1, rows + 1).map(a => <ActionRow key={a.id} action={a} now={now} />)}
    </Card>
  );
}

/** Decisions that wait on this person, oldest first. Each opens the page where it is decided. */
export function DecisionQueue({ rows, strong = true, max = 6, check }: {
  rows: DecisionRow[]; strong?: boolean; max?: number; check?: (a: MyAction) => Precheck | null;
}) {
  if (rows.length === 0) return null;
  return (
    <Card className="p-5">
      <p className={BLOCK_TITLE}>
        <span>Waiting on your decision · oldest first</span>
        <span>people waiting: <span className="font-mono">{rows.length}</span></span>
      </p>
      {rows.slice(0, max).map(({ action: a, days }, i) => {
        const pc = check?.(a) ?? null;
        return (
        <div key={a.id} className={ROW}>
          <div className="flex-1 min-w-0">
            <p className={clsx('text-text truncate', i === 0 ? 'text-base font-medium' : 'text-sm')} title={a.label}>{a.label}</p>
            <p className="text-xs text-text-muted truncate" title={a.detail}>{a.detail}</p>
            {pc && <p className={clsx('text-xs truncate', pc.finding ? 'text-badge-warning-fg' : 'text-text-muted')} title={pc.text}>Check: {pc.text}</p>}
          </div>
          {days !== null && (
            <Badge variant={days >= 7 ? 'danger' : days >= 3 ? 'warning' : 'neutral'} className="font-mono normal-case shrink-0">{days} d</Badge>
          )}
          <Link to={a.link}><Button type="button" size="sm" variant={i === 0 && strong ? 'primary' : 'secondary'}>Open</Button></Link>
        </div>
        );
      })}
      {rows.length > max && (
        <p className="text-xs text-text-muted mt-2">+<span className="font-mono">{rows.length - max}</span> more · <Link to="/work" className="underline">See all</Link></p>
      )}
    </Card>
  );
}
