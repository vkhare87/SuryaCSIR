import { useEffect, useRef } from 'react';

/**
 * Keyboard basics for an open overlay: Escape calls `onClose`, focus moves
 * into the panel on open and returns to the element that opened it on close.
 * Attach the returned ref to the panel and give that element tabIndex={-1}.
 * ponytail: no focus trap — Tab can leave the panel; add one if audits need it.
 */
export function useDialog<T extends HTMLElement>(isOpen: boolean, onClose: () => void) {
  const panelRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [isOpen]);

  return panelRef;
}
