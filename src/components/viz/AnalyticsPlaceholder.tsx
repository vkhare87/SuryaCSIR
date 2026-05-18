import { BarChart3 } from 'lucide-react';

interface AnalyticsPlaceholderProps {
  section: string;
  upcoming: string[];
}

/**
 * Stub view for Phase 3 — proves Analytics tab loads on its own chunk and
 * lists the charts that will fill the tab in Phase 4.
 */
export function AnalyticsPlaceholder({ section, upcoming }: AnalyticsPlaceholderProps) {
  return (
    <div className="rounded-[12px] border border-dashed border-border bg-surface p-8 flex flex-col items-center justify-center text-center gap-4 min-h-[320px]">
      <div className="w-12 h-12 rounded-xl bg-[#f5ede0] text-[#7a4a1e] flex items-center justify-center">
        <BarChart3 size={22} />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-text">{section} Analytics</h3>
        <p className="text-sm text-text-muted max-w-md">
          Charts arrive in Phase 4. This view is wired through the lazy chunk so you can verify
          performance and the click-to-filter URL contract.
        </p>
      </div>
      <ul className="text-xs text-text-muted space-y-1 max-w-md">
        {upcoming.map((u) => (
          <li key={u}>· {u}</li>
        ))}
      </ul>
    </div>
  );
}
