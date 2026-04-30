import React from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  isLoading, 
  className,
  disabled,
  ...props 
}: ButtonProps) {
  const baseStyle = "inline-flex items-center justify-center rounded-[8px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3898ec] focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary: "bg-[#c96442] text-[#faf9f5] hover:bg-[#b5593b] shadow-[0px_0px_0px_1px_#c96442]",
    secondary: "bg-[#e8e6dc] text-[#4d4c48] hover:bg-[#dddbd1] shadow-[0px_0px_0px_1px_#d1cfc5]",
    ghost: "text-[#5e5d59] hover:text-[#141413] hover:bg-[#f0eee6]",
    danger: "bg-[#b53333] text-[#faf9f5] hover:bg-[#9e2c2c] shadow-[0px_0px_0px_1px_#b53333]",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <button 
      className={clsx(baseStyle, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
