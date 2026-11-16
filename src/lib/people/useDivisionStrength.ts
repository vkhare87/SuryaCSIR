import { useEffect, useMemo, useState } from 'react';
import { loadDivisionStrength, type DivisionStrength } from './api';

let cachedRows: DivisionStrength[] | null = null;
let inflightPromise: Promise<DivisionStrength[]> | null = null;
let generation = 0;
const listeners = new Set<(rows: DivisionStrength[]) => void>();

export function primeDivisionStrength(rows: DivisionStrength[] | null, inflight?: Promise<DivisionStrength[]> | null): void {
  cachedRows = rows;
  inflightPromise = inflight ?? null;
  if (rows !== null) {
    generation += 1;
    for (const fn of listeners) fn(rows);
  } else if (!inflight) {
    generation += 1;
    for (const fn of listeners) fn([]);
  }
}

/**
 * Sanctioned · filled · vacant per division from the post register
 * (division_strength, 20261113000001). Replaces the two integers on
 * divisions. Empty until HR enters the posts.
 */
export function useDivisionStrength() {
  const [rows, setRows] = useState<DivisionStrength[]>(() => cachedRows ?? []);
  useEffect(() => {
    let live = true;
    const capturedGen = generation;
    listeners.add(setRows);
    if (cachedRows !== null) {
      setRows(cachedRows);
      return () => { live = false; listeners.delete(setRows); };
    }
    const source = inflightPromise ?? loadDivisionStrength();
    source
      .then(r => { if (live && capturedGen === generation) setRows(r); })
      .catch(() => { if (live && capturedGen === generation) setRows([]); });
    return () => { live = false; listeners.delete(setRows); };
  }, []);
  const byDivision = useMemo(() => new Map(rows.map(r => [r.division_code, r])), [rows]);
  const totals = useMemo(() => rows.reduce((t, r) => ({ sanctioned: t.sanctioned + r.sanctioned, filled: t.filled + r.filled, vacant: t.vacant + r.vacant }),
    { sanctioned: 0, filled: 0, vacant: 0 }), [rows]);
  return { rows, byDivision, totals };
}
