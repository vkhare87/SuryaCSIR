import { useCallback, useEffect, useRef, useState } from 'react';
import { readPending, writePending, type DraftPatch } from './autosave';

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'error' };

const DEBOUNCE_MS = 800;
const RETRY_MS = 5000;

/**
 * Saves a draft a moment after typing stops. Every change is first written to
 * this browser (autosave.ts), so nothing typed is lost if the save never
 * lands; a failed save is retried and the page says so.
 *
 * `recovered` holds edits found in the browser from an earlier session that
 * did not reach the server — the caller applies them to what it shows.
 */
export function useDraftAutosave(
  proposalId: string | undefined,
  save: (id: string, patch: DraftPatch) => Promise<void>,
) {
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const [recovered, setRecovered] = useState<DraftPatch | null>(null);
  const pending = useRef<DraftPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);
  const saveRef = useRef(save);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { saveRef.current = save; }, [save]);

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    if (!proposalId) return;
    // One save at a time: a second flush waits, then sends what accumulated.
    if (inFlight.current) await inFlight.current;
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    setState({ kind: 'saving' });
    const run = saveRef.current(proposalId, patch).then(
      () => {
        writePending(proposalId, pending.current);
        setState({ kind: 'saved', at: new Date() });
      },
      () => {
        // Keep what failed, under anything typed since.
        pending.current = { ...patch, ...pending.current };
        writePending(proposalId, pending.current);
        setState({ kind: 'error' });
        timer.current = setTimeout(() => { void flushRef.current(); }, RETRY_MS);
      },
    );
    inFlight.current = run;
    await run;
    inFlight.current = null;
  }, [proposalId]);
  useEffect(() => { flushRef.current = flush; }, [flush]);

  const queue = useCallback((patch: DraftPatch) => {
    if (!proposalId) return;
    pending.current = { ...pending.current, ...patch };
    writePending(proposalId, pending.current);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, DEBOUNCE_MS);
  }, [proposalId, flush]);

  // Edits left behind by an earlier session: hand them back and save them.
  useEffect(() => {
    if (!proposalId) return;
    const left = readPending(proposalId);
    if (!left) return;
    pending.current = { ...left, ...pending.current };
    setRecovered(left);
    void flush();
  }, [proposalId, flush]);

  // Leaving the page or hiding the tab: send now. The browser copy covers the
  // case where this request does not complete.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      void flush();
    };
  }, [flush]);

  return { queue, flush, state, recovered };
}
