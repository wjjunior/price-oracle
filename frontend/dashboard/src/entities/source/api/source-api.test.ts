import { beforeEach, describe, expect, it } from 'vitest';

import { useSourceStore } from '../model/source-store.js';

import { applySourceHealthEnvelope, hydrateFromSnapshot } from './source-api.js';

import type { SourceState } from '@price-oracle/contracts/events';
import type { GetSnapshotResponse } from '@price-oracle/contracts/rest';
import type { SseEnvelope } from '@price-oracle/contracts/sse';



const sourceState = (
  asset: 'btc' | 'eth',
  source: 'binance' | 'coinbase' | 'mock',
  health: SourceState['health'] = 'HEALTHY',
): SourceState => ({
  asset,
  source,
  health,
  lastTickAt: 1_000,
  lastPrice: 65_000,
  pendingHealth: null,
  pendingStreak: 0,
});

beforeEach(() => useSourceStore.setState({ byAsset: { btc: {}, eth: {} } }));

describe('applySourceHealthEnvelope', () => {
  it('should push a source-health SSE envelope into the store', () => {
    const envelope: Extract<SseEnvelope, { type: 'source-health' }> = {
      type: 'source-health',
      asset: 'btc',
      data: sourceState('btc', 'binance', 'DEGRADED'),
      correlationId: 'corr-1',
    };
    applySourceHealthEnvelope(envelope);
    expect(useSourceStore.getState().byAsset.btc.binance?.health).toBe('DEGRADED');
  });
});

describe('hydrateFromSnapshot', () => {
  it('should set every source from a REST snapshot', () => {
    const snapshot: GetSnapshotResponse = {
      asset: 'btc',
      aggregate: null,
      sources: [sourceState('btc', 'binance'), sourceState('btc', 'coinbase', 'STALE')],
      breaker: 'CLOSED',
    };
    hydrateFromSnapshot(snapshot);
    expect(useSourceStore.getState().byAsset.btc.binance?.health).toBe('HEALTHY');
    expect(useSourceStore.getState().byAsset.btc.coinbase?.health).toBe('STALE');
  });
});
