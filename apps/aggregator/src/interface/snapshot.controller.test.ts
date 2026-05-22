import { describe, expect, it, vi } from 'vitest';

import { Orchestrator } from '../application/orchestrator.js';

import { AssetParamPipe } from './asset-param.pipe.js';
import { SnapshotController } from './snapshot.controller.js';

import type { AggregatePrice, SourceState } from '../domain/types.js';
import type { BreakerState } from '@price-oracle/contracts/primitives';
import type { Logger } from 'pino';

const makeLogger = (): Logger => ({ info: vi.fn(), warn: vi.fn() }) as unknown as Logger;

const btcAggregate: AggregatePrice = {
  asset: 'btc',
  price: 50_000,
  confidence: 0.9,
  contributingSources: ['binance', 'coinbase'],
  computedAt: 1_000_000,
};

const btcSource: SourceState = {
  asset: 'btc',
  source: 'binance',
  health: 'HEALTHY',
  lastTickAt: 1_000_000,
  lastPrice: 50_000,
  pendingHealth: null,
  pendingStreak: 0,
};

type FakeOrchestrator = Pick<
  Orchestrator,
  'getSnapshot' | 'getSourceStates' | 'getBreakerState'
>;

const fakeOrchestrator = (breaker: BreakerState = 'CLOSED'): FakeOrchestrator => ({
  getSnapshot: () => btcAggregate,
  getSourceStates: () => [btcSource],
  getBreakerState: () => breaker,
});

describe('SnapshotController', () => {
  it('should return aggregate, sources and breaker for the asset', () => {
    const controller = new SnapshotController(
      fakeOrchestrator('OPEN') as unknown as Orchestrator,
      makeLogger(),
    );

    const response = controller.snapshot('btc');

    expect(response.asset).toBe('btc');
    expect(response.aggregate?.price).toBe(50_000);
    expect(response.aggregate?.contributingSources).toEqual(['binance', 'coinbase']);
    expect(response.sources).toEqual([btcSource]);
    expect(response.breaker).toBe('OPEN');
  });

  it('should return a null aggregate when no snapshot exists', () => {
    const orchestrator: FakeOrchestrator = {
      getSnapshot: () => null,
      getSourceStates: () => [],
      getBreakerState: () => 'CLOSED',
    };
    const controller = new SnapshotController(
      orchestrator as unknown as Orchestrator,
      makeLogger(),
    );

    expect(controller.snapshot('eth').aggregate).toBeNull();
  });

  it('should reject an unknown asset at the pipe boundary', () => {
    const pipe = new AssetParamPipe();
    expect(() => pipe.transform('sol')).toThrow();
  });
});
