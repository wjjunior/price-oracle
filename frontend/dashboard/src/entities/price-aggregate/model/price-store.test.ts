import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePriceAggregate, usePriceAggregateStore } from './price-store.js';

import type { AggregatePrice } from '@price-oracle/contracts/events';
import type { AssetId } from '@price-oracle/contracts/primitives';

const aggregate = (asset: AssetId, price: number): AggregatePrice => ({
  asset,
  price,
  confidence: 0.95,
  contributingSources: ['binance'],
  computedAt: 1,
});

beforeEach(() => {
  usePriceAggregateStore.setState({ byAsset: { btc: null, eth: null } });
});

describe('usePriceAggregateStore', () => {
  it('should store an aggregate under its asset key without touching the other asset', () => {
    usePriceAggregateStore.getState().setAggregate('btc', aggregate('btc', 100));
    expect(usePriceAggregateStore.getState().byAsset.btc?.price).toBe(100);
    expect(usePriceAggregateStore.getState().byAsset.eth).toBeNull();
  });

  it('should not notify an ETH-only subscriber when the BTC slice updates', () => {
    const ethListener = vi.fn();
    const unsubscribe = usePriceAggregateStore.subscribe((s) => s.byAsset.eth, ethListener);
    usePriceAggregateStore.getState().setAggregate('btc', aggregate('btc', 100));
    unsubscribe();
    expect(ethListener).not.toHaveBeenCalled();
  });

  it('should notify an ETH subscriber when the ETH slice updates', () => {
    const ethListener = vi.fn();
    const unsubscribe = usePriceAggregateStore.subscribe((s) => s.byAsset.eth, ethListener);
    usePriceAggregateStore.getState().setAggregate('eth', aggregate('eth', 50));
    unsubscribe();
    expect(ethListener).toHaveBeenCalledTimes(1);
  });
});

describe('usePriceAggregate', () => {
  it('should return the aggregate slice for its asset', () => {
    usePriceAggregateStore.getState().setAggregate('btc', aggregate('btc', 100));
    const { result } = renderHook(() => usePriceAggregate('btc'));
    expect(result.current?.price).toBe(100);
  });
});
