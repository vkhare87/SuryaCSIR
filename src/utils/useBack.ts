import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Back-arrow handler for detail pages: returns to wherever the user came
 * from (keeping that page's filters), or to `fallback` when the page was
 * opened directly from a link or bookmark and has no in-app history.
 */
export function useBack(fallback: string) {
  const navigate = useNavigate();
  const { key } = useLocation();
  return useCallback(() => {
    if (key !== 'default') navigate(-1);
    else navigate(fallback);
  }, [key, navigate, fallback]);
}
