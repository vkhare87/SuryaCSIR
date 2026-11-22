import { useEffect, useRef } from 'react';

/**
 * Accessible dialog hook (WP-6): closes on Escape and restores focus on unmount/close.
 */
export function useDialog(open: boolean, onClose: () => void) {
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      prevFocusRef.current?.focus?.();
    };
  }, [open, onClose]);
}
