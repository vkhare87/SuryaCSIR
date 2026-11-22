import { useCallback, useEffect, useState } from 'react';

const FOCUS_ELIGIBLE_PREFIXES = ['/pms', '/proposals', '/reports', '/ask'];

export function isFocusEligibleRoute(pathname: string): boolean {
  return FOCUS_ELIGIBLE_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

/**
 * Distraction-free reading/authoring toggle (Alt+F). Collapses navigation
 * chrome cleanly and exits on Alt+F or when triggered by the floating pill.
 */
export function useFocusMode(pathname: string) {
  const [focusMode, setFocusMode] = useState(false);

  const toggleFocusMode = useCallback(() => {
    setFocusMode(v => !v);
  }, []);

  const exitFocusMode = useCallback(() => {
    setFocusMode(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setFocusMode(v => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return {
    focusMode,
    canOfferFocusButton: isFocusEligibleRoute(pathname),
    toggleFocusMode,
    exitFocusMode,
  };
}
