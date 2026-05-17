import React, { createContext, useContext, useId, useState } from 'react';
import clsx from 'clsx';

interface TabsContextType {
  value: string;
  setValue: (v: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

function useTabs() {
  const ctx = useContext(TabsContext);
  if (ctx === undefined) throw new Error('Tabs subcomponents must be used within <Tabs>');
  return ctx;
}

interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function Tabs({ value, defaultValue, onValueChange, className, children }: TabsProps) {
  const baseId = useId();
  const [internal, setInternal] = useState(defaultValue ?? '');
  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;
  const setValue = (v: string) => {
    if (!isControlled) setInternal(v);
    onValueChange?.(v);
  };

  return (
    <TabsContext.Provider value={{ value: current, setValue, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabsListProps {
  className?: string;
  children: React.ReactNode;
}

export function TabsList({ className, children }: TabsListProps) {
  return (
    <div
      role="tablist"
      className={clsx(
        'inline-flex items-center gap-1 rounded-[10px] bg-surface border border-border p-1',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps {
  value: string;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

export function TabsTrigger({ value, className, disabled, children }: TabsTriggerProps) {
  const { value: current, setValue, baseId } = useTabs();
  const active = current === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-trigger-${value}`}
      aria-selected={active}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={active ? 0 : -1}
      disabled={disabled}
      onClick={() => setValue(value)}
      className={clsx(
        'px-4 py-1.5 text-sm font-medium rounded-[8px] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3898ec]',
        active
          ? 'bg-background text-text shadow-[0px_0px_0px_1px_var(--color-border)]'
          : 'text-text-muted hover:text-text hover:bg-surface-hover',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  );
}

interface TabsContentProps {
  value: string;
  className?: string;
  children: React.ReactNode;
  /** keep mounted when hidden (preserves state); default unmounts inactive panels */
  keepMounted?: boolean;
}

export function TabsContent({ value, className, children, keepMounted = false }: TabsContentProps) {
  const { value: current, baseId } = useTabs();
  const active = current === value;
  if (!active && !keepMounted) return null;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-trigger-${value}`}
      hidden={!active}
      className={className}
    >
      {children}
    </div>
  );
}
