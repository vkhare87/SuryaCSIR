import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../utils/cn';
import { useDialog } from '../../utils/useDialog';

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** which edge the panel slides from */
  side?: 'right' | 'left';
  className?: string;
}

export function Sheet({ isOpen, onClose, title, children, side = 'right', className }: SheetProps) {
  const panelRef = useDialog<HTMLElement>(isOpen, onClose);
  const titleId = useId();

  const off = side === 'right' ? '100%' : '-100%';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            className={cn(
              'absolute top-0 bottom-0 w-full max-w-md bg-surface-raised border-border shadow-[var(--shadow-e4)] flex flex-col outline-none',
              side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
              className
            )}
            initial={{ x: off }} animate={{ x: 0 }} exit={{ x: off }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div id={titleId} className="text-lg font-[500] font-serif text-text">{title}</div>
              <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-surface-hover text-text-muted">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
