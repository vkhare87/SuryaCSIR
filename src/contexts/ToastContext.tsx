import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextType {
  push: (message: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (ctx === undefined) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const KIND_STYLES: Record<ToastKind, { bg: string; icon: typeof CheckCircle2 }> = {
  success: { bg: 'bg-emerald-600/95 text-white', icon: CheckCircle2 },
  error: { bg: 'bg-red-600/95 text-white', icon: XCircle },
  warning: { bg: 'bg-amber-500/95 text-white', icon: AlertTriangle },
  info: { bg: 'bg-blue-600/95 text-white', icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++counter.current;
    setToasts((cur) => [...cur, { id, message, kind }]);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => window.setTimeout(() => dismiss(t.id), 4000));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [toasts, dismiss]);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[1000] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => {
          const { bg, icon: Icon } = KIND_STYLES[t.kind];
          return (
            <div
              key={t.id}
              role="status"
              className={clsx(
                'flex items-start gap-2 px-3 py-2 rounded-md shadow-lg text-sm',
                bg
              )}
            >
              <Icon className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="opacity-70 hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
