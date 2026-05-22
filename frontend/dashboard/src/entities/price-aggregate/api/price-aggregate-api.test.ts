import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePriceAggregateStore } from '../model/price-store.js';

import { applyAggregateEnvelope, hydrateFromSnapshot, loadPriceSnapshot } from './price-aggregate-api.js';

import type { AggregatePrice } from '@price-oracle/contracts/events';
import type { GetSnapshotResponse } from '@price-oracle/contracts/rest';
import type { SseEnvelope } from '@price-oracle/contracts/sse';



const aggregate = (asset: 'btc' | 'eth', price: number): AggregatePrice => ({
  asset,
  price,
  confidence: 0.92,
  contributingSources: ['binance'],
  computedAt: 1_747_000_000_000,
});

beforeEach(() => usePriceAggregateStore.setState({ byAsset: { btc: null, eth: null } }));
afterEach(() => vi.restoreAllMocks());

describe('applyAggregateEnvelope', () => {
  it('should push an aggregate SSE envelope into the store under its asset', () => {
    const envelope: Extract<SseEnvelope, { type: 'aggregate' }> = {
      type: 'aggregate',
      asset: 'eth',
      data: aggregate('eth', 3_400),
      correlationId: 'corr-1',
    };
    applyAggregateEnvelope(envelope);
    expect(usePriceAggregateStore.getState().byAsset.eth?.price).toBe(3_400);
    expect(usePriceAggregateStore.getState().byAsset.btc).toBeNull();
  });
});

describe('hydrateFromSnapshot', () => {
  it('should set the asset aggregate from a REST snapshot', () => {
    const snapshot: GetSnapshotResponse = {
      asset: 'btc',
      aggregate: aggregate('btc', 65_000),
      sources: [],
      breaker: 'CLOSED',
    };
    hydrateFromSnapshot(snapshot);
    expect(usePriceAggregateStore.getState().byAsset.btc?.price).toBe(65_000);
  });

  it('should accept a snapshot with a null aggregate', () => {
    hydrateFromSnapshot({ asset: 'btc', aggregate: null, sources: [], breaker: 'OPEN' });
    expect(usePriceAggregateStore.getState().byAsset.btc).toBeNull();
  });
});

describe('loadPriceSnapshot', () => {
  it('should fetch and contract-parse the per-asset snapshot endpoint', async () => {
    const snapshot: GetSnapshotResponse = {
      asset: 'btc',
      aggregate: aggregate('btc', 65_000),
      sources: [],
      breaker: 'CLOSED',
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(snapshot), { status: 200 }));

    const out = await loadPriceSnapshot('btc');

    expect(out).toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/snapshot?asset=btc'),
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
