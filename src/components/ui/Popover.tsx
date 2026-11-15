import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { useDialog } from '../../utils/useDialog';

interface PopoverProps {
  /** Accessible name of the trigger button and of the panel. */
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  align?: 'left' | 'right';
  className?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}

/** Click-open floating panel under its trigger. Escape, a click outside, or
 *  focus leaving closes it. A floating layer, so it wears glass (DESIGN.md). */
export function Popover({ label, trigger, triggerClassName, align = 'right', className, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const panelRef = useDialog<HTMLDivElement>(open, close);

  return (
    <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) close(); }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={triggerClassName}
      >
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-label={label}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className={clsx(
              'absolute top-full mt-1 z-50 min-w-[180px] rounded-xl border border-border bg-surface-raised/90 backdrop-blur-md shadow-[var(--shadow-e3)] p-1 outline-none',
              align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
              className,
            )}
          >
            {typeof children === 'function' ? children(close) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
