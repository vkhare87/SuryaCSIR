/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

export interface BriefPill {
  label: string;
  to?: string;
  tone?: 'neutral' | 'accent' | 'positive' | 'warning';
}

interface LivingBriefHeaderProps {
  /** Mono editorial kicker above the sentence (e.g. "CSIR-AMPRI · DIRECTOR'S COCKPIT"). */
  kicker: string;
  /** Composed Fraunces lead sentence (DESIGN.md R5). */
  sentence: ReactNode;
  /** Optional interactive status pills below the sentence. */
  pills?: BriefPill[];
  /** Optional right-aligned actions. */
  actions?: ReactNode;
  className?: string;
}

const PILL_TONES: Record<NonNullable<BriefPill['tone']>, string> = {
  neutral:  'bg-surface border-border text-text-muted hover:text-text hover:border-terracotta/40',
  accent:   'bg-terracotta/10 border-terracotta/25 text-terracotta hover:bg-terracotta/15',
  positive: 'bg-surface border-border text-archive-green hover:border-archive-green/50',
  warning:  'bg-badge-warning-bg border-badge-warning-fg/25 text-badge-warning-fg',
};

function formattedDateStamp(): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
    }).format(new Date()).toUpperCase();
  } catch {
    return '';
  }
}

export function timeOfDayGreeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * DESIGN.md R5: Editorial sentence-first dashboard opening — replaces static
 * ALL-CAPS headings with a living, data-bound Fraunces brief.
 */
export function LivingBriefHeader({ kicker, sentence, pills, actions, className }: LivingBriefHeaderProps) {
  const dateStamp = formattedDateStamp();

  return (
    <header className={clsx('flex flex-col lg:flex-row lg:items-end justify-between gap-4', className)}>
      <div className="space-y-2 max-w-3xl">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.14em] text-text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-terracotta shrink-0" aria-hidden="true" />
          <span>{kicker}</span>
          {dateStamp && <span className="hidden sm:inline opacity-60">· {dateStamp}</span>}
        </div>

        <h1 className="font-serif text-2xl md:text-3xl font-normal text-text leading-snug tracking-tight">
          {sentence}
        </h1>

        {pills && pills.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {pills.map(pill => {
              const cls = clsx(
                'inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium transition-colors',
                PILL_TONES[pill.tone ?? 'neutral'],
              );
              return pill.to ? (
                <Link key={pill.label} to={pill.to} className={cls}>{pill.label}</Link>
              ) : (
                <span key={pill.label} className={cls}>{pill.label}</span>
              );
            })}
          </div>
        )}
      </div>

      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
