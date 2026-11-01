import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard basics for an open overlay: Escape calls `onClose`, focus moves
 * into the panel on open and returns to the element that opened it on close,
 * Tab / Shift+Tab wrap inside the panel, everything outside it is `inert`,
 * and the page behind does not scroll.
 * Attach the returned ref to the panel and give that element tabIndex={-1}.
 */
export function useDialog<T extends HTMLElement>(isOpen: boolean, onClose: () => void) {
  const panelRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    const opener = document.activeElement as HTMLElement | null;
    panel?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) { e.preventDefault(); panel.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);

    // Panels render in place (no portal), so make every sibling on the path
    // from the overlay up to <body> inert rather than the app root. The walk
    // starts at the panel's parent: the panel's own siblings are its backdrop,
    // which must keep its click-to-close.
    const madeInert: HTMLElement[] = [];
    for (let el = panel?.parentElement ?? null; el && el !== document.body; el = el.parentElement) {
      for (const sib of Array.from(el.parentElement?.children ?? [])) {
        if (sib !== el && sib instanceof HTMLElement && !sib.inert) { sib.inert = true; madeInert.push(sib); }
      }
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      madeInert.forEach(el => { el.inert = false; });
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [isOpen]);

  return panelRef;
}
