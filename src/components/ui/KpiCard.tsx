import type React from 'react';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  sublabel?: string;
}

export function KpiCard({ label, value, icon, sublabel }: KpiCardProps) {
  return (
    <div className="bg-surface border border-border rounded-[12px] p-6 flex flex-col gap-2 shadow-[0px_0px_0px_1px_var(--color-border)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">{label}</span>
        {icon && <span className="text-terracotta">{icon}</span>}
      </div>
      <div className="text-3xl font-[500] text-near-black font-serif">{value}</div>
      {sublabel && <div className="text-xs text-[#87867f]">{sublabel}</div>}
    </div>
  );
}
