import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBreaker, useBreakerStore } from './breaker-store.js';

beforeEach(() => useBreakerStore.setState({ byAsset: { btc: 'CLOSED', eth: 'CLOSED' } }));

describe('useBreakerStore', () => {
  it('should default both assets to CLOSED', () => {
    expect(useBreakerStore.getState().byAsset).toEqual({ btc: 'CLOSED', eth: 'CLOSED' });
  });

  it('should update only the targeted asset', () => {
    useBreakerStore.getState().setBreaker('btc', 'OPEN');
    expect(useBreakerStore.getState().byAsset.btc).toBe('OPEN');
    expect(useBreakerStore.getState().byAsset.eth).toBe('CLOSED');
  });

  it('should not notify a btc subscriber when eth transitions', () => {
    const listener = vi.fn();
    const unsubscribe = useBreakerStore.subscribe((s) => s.byAsset.btc, listener);
    useBreakerStore.getState().setBreaker('eth', 'HALF_OPEN');
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('useBreaker', () => {
  it('should return the breaker state for its asset', () => {
    useBreakerStore.getState().setBreaker('eth', 'HALF_OPEN');
    const { result } = renderHook(() => useBreaker('eth'));
    expect(result.current).toBe('HALF_OPEN');
  });
});
