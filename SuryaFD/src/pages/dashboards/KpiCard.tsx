import type React from 'react';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  sublabel?: string;
}

export function KpiCard({ label, value, icon, sublabel }: KpiCardProps) {
  return (
    <div className="bg-[#faf9f5] border border-[#f0eee6] rounded-[12px] p-6 flex flex-col gap-2 shadow-[0px_0px_0px_1px_#f0eee6]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">{label}</span>
        {icon && <span className="text-[#c96442]">{icon}</span>}
      </div>
      <div className="text-3xl font-[500] text-[#141413] font-serif">{value}</div>
      {sublabel && <div className="text-xs text-[#87867f]">{sublabel}</div>}
    </div>
  );
}
