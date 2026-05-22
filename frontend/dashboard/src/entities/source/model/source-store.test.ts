import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSource, useSourceStore } from './source-store.js';

import type { SourceState } from '@price-oracle/contracts/events';
import type { AssetId, SourceId } from '@price-oracle/contracts/primitives';

const sourceState = (asset: AssetId, source: SourceId): SourceState => ({
  asset,
  source,
  health: 'HEALTHY',
  lastTickAt: 1_000,
  lastPrice: 65_000,
  pendingHealth: null,
  pendingStreak: 0,
});

beforeEach(() => useSourceStore.setState({ byAsset: { btc: {}, eth: {} } }));

describe('useSourceStore', () => {
  it('should store a source under its (asset, source) key', () => {
    useSourceStore.getState().setSource(sourceState('btc', 'binance'));
    expect(useSourceStore.getState().byAsset.btc.binance?.lastPrice).toBe(65_000);
    expect(useSourceStore.getState().byAsset.btc.coinbase).toBeUndefined();
  });

  it('should not notify a (btc, binance) subscriber when another source on the same asset updates', () => {
    const listener = vi.fn();
    const unsubscribe = useSourceStore.subscribe((s) => s.byAsset.btc.binance, listener);
    useSourceStore.getState().setSource(sourceState('btc', 'coinbase'));
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it('should not notify a (btc, binance) subscriber when the same source on another asset updates', () => {
    const listener = vi.fn();
    const unsubscribe = useSourceStore.subscribe((s) => s.byAsset.btc.binance, listener);
    useSourceStore.getState().setSource(sourceState('eth', 'binance'));
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it('should notify the (btc, binance) subscriber when that exact slice updates', () => {
    const listener = vi.fn();
    const unsubscribe = useSourceStore.subscribe((s) => s.byAsset.btc.binance, listener);
    useSourceStore.getState().setSource(sourceState('btc', 'binance'));
    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should apply many sources in a single store update via setSources', () => {
    const stateChanges = vi.fn();
    const unsubscribe = useSourceStore.subscribe(stateChanges);
    useSourceStore
      .getState()
      .setSources([sourceState('btc', 'binance'), sourceState('btc', 'coinbase')]);
    unsubscribe();
    expect(stateChanges).toHaveBeenCalledTimes(1);
    expect(useSourceStore.getState().byAsset.btc.binance).toBeDefined();
    expect(useSourceStore.getState().byAsset.btc.coinbase).toBeDefined();
  });
});

describe('useSource', () => {
  it('should return the state slice for its (asset, source)', () => {
    useSourceStore.getState().setSource(sourceState('eth', 'mock'));
    const { result } = renderHook(() => useSource('eth', 'mock'));
    expect(result.current?.source).toBe('mock');
  });
});
