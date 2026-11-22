import { useEffect, useMemo, useState } from 'react';
import { loadDivisionStrength, type DivisionStrength } from './api';

/**
 * Sanctioned · filled · vacant per division from the post register
 * (division_strength, 20261113000001). Replaces the two integers on
 * divisions. Empty until HR enters the posts.
 */
export function useDivisionStrength() {
  const [rows, setRows] = useState<DivisionStrength[]>([]);
  useEffect(() => {
    let live = true;
    loadDivisionStrength().then(r => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, []);
  const byDivision = useMemo(() => new Map(rows.map(r => [r.division_code, r])), [rows]);
  const totals = useMemo(() => rows.reduce((t, r) => ({ sanctioned: t.sanctioned + r.sanctioned, filled: t.filled + r.filled, vacant: t.vacant + r.vacant }),
    { sanctioned: 0, filled: 0, vacant: 0 }), [rows]);
  return { rows, byDivision, totals };
}
