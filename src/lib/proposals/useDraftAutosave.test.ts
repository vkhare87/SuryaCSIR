import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDraftAutosave } from './useDraftAutosave';
import { readPending, writePending } from './autosave';

const ID = 'p1';

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

describe('useDraftAutosave', () => {
  it('saves once, a moment after typing stops, with everything typed', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDraftAutosave(ID, save));

    act(() => { result.current.queue({ abstract: 'a' }); });
    act(() => { result.current.queue({ abstract: 'ab', objectives: 'o' }); });
    expect(save).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(ID, { abstract: 'ab', objectives: 'o' });
    expect(result.current.state.kind).toBe('saved');
    expect(readPending(ID)).toBeNull();
  });

  it('keeps every keystroke in the browser until the server confirms', () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDraftAutosave(ID, save));
    act(() => { result.current.queue({ abstract: 'typed, not yet saved' }); });
    // The tab could die here: the text is already on disk.
    expect(readPending(ID)).toEqual({ abstract: 'typed, not yet saved' });
  });

  it('a failed save loses nothing and is retried', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDraftAutosave(ID, save));

    act(() => { result.current.queue({ abstract: 'a' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(result.current.state.kind).toBe('error');
    expect(readPending(ID)).toEqual({ abstract: 'a' });

    // Typed while the retry is pending: sent together, newest value wins.
    act(() => { result.current.queue({ abstract: 'ab' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(save).toHaveBeenLastCalledWith(ID, { abstract: 'ab' });
    expect(result.current.state.kind).toBe('saved');
    expect(readPending(ID)).toBeNull();
  });

  it('picks up what an earlier session left behind and saves it', async () => {
    writePending(ID, { objectives: 'written before the browser was killed' });
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDraftAutosave(ID, save));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.recovered).toEqual({ objectives: 'written before the browser was killed' });
    expect(save).toHaveBeenCalledWith(ID, { objectives: 'written before the browser was killed' });
    expect(readPending(ID)).toBeNull();
  });

  it('sends what is pending when the page is left', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useDraftAutosave(ID, save));
    act(() => { result.current.queue({ title: 'T' }); });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(save).toHaveBeenCalledWith(ID, { title: 'T' });
  });
});
