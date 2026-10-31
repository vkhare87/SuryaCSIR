import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { useDialog } from '../../utils/useDialog';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  const panelRef = useDialog<HTMLDivElement>(isOpen, onClose);
  const titleId = useId();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          'relative bg-surface border border-border shadow-lg w-full overflow-y-auto outline-none',
          'rounded-t-2xl max-h-[92vh]',
          'sm:rounded-2xl sm:max-w-lg sm:mx-4 sm:max-h-[90vh]',
          className,
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 sm:px-6 border-b border-border">
          <h2 id={titleId} className="text-lg font-[500] font-serif text-text">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-lg hover:bg-surface-hover text-text-muted"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-4 py-4 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
