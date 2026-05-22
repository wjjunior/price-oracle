import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useNow } from './use-now.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useNow', () => {
  it('should return the current time and advance after the interval', () => {
    vi.useFakeTimers();
    const start = 1_000_000;
    vi.setSystemTime(start);
    const { result } = renderHook(() => useNow(1_000));
    expect(result.current).toBe(start);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(start + 1_000);
  });

  it('should clear the interval on unmount', () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useNow(1_000));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
