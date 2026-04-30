import React from 'react';
import clsx from 'clsx';


interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  isGlass?: boolean;
}

export function Card({ children, className, isGlass = false, ...props }: CardProps) {
  return (
    <div 
      className={clsx(
        "rounded-[12px] p-6 shadow-[0px_0px_0px_1px_#f0eee6] hover:shadow-[0px_0px_0px_1px_#d1cfc5] transition-shadow",
        isGlass ? "glass dark:glass-dark" : "bg-surface border border-border",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------

interface StatCardProps extends CardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: number; label: string; isPositive: boolean };
  valueColor?: string;
}

export function StatCard({ title, value, subtitle, icon, trend, valueColor, className, ...props }: StatCardProps) {
  return (
    <Card className={clsx("flex flex-col gap-2 relative overflow-hidden", className)} {...props}>
      <div className="flex items-center justify-between text-text-muted">
        <span className="text-sm font-medium">{title}</span>
        {icon && <div className="text-[#c96442] bg-[#f0eee6] p-2 rounded-[8px]">{icon}</div>}
      </div>
      
      <div className="flex flex-col gap-0.5 mt-2">
        <span className={clsx("text-3xl font-bold font-mono tracking-tight", valueColor || "text-text")}>{value}</span>
        {subtitle && <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{subtitle}</span>}
      </div>

      {trend && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span className={clsx("font-medium", trend.isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
          <span className="text-text-muted">{trend.label}</span>
        </div>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export function Badge({ children, variant = 'neutral', className, ...props }: BadgeProps) {
  const variants = {
    success: "bg-[#f0eee6] text-[#4d4c48] border border-[#e8e6dc]",
    warning: "bg-[#f5ede0] text-[#7a4a1e] border border-[#e8d4c0]",
    danger:  "bg-[#f5e8e8] text-[#b53333] border border-[#e8c8c8]",
    info:    "bg-[#f0eee6] text-[#5e5d59] border border-[#e8e6dc]",
    neutral: "bg-[#f0eee6] text-[#87867f] border border-[#e8e6dc]",
  };

  return (
    <span 
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
