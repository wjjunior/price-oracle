import fc from 'fast-check';

import type { BreakerConfig, SourceState, Thresholds, Tick } from '../types.js';
import type {
  AssetId,
  BreakerState,
  SourceHealth,
  SourceId,
} from '@price-oracle/contracts/primitives';

export const arbAssetId: fc.Arbitrary<AssetId> = fc.constantFrom('btc', 'eth');
export const arbSourceId: fc.Arbitrary<SourceId> = fc.constantFrom('binance', 'coinbase', 'mock');
export const arbSourceHealth: fc.Arbitrary<SourceHealth> = fc.constantFrom(
  'HEALTHY',
  'DEGRADED',
  'STALE',
);
export const arbBreakerState: fc.Arbitrary<BreakerState> = fc.constantFrom(
  'CLOSED',
  'HALF_OPEN',
  'OPEN',
);

export const arbMillis: fc.Arbitrary<number> = fc.integer({ min: 0, max: 10 ** 12 });
export const arbPrice: fc.Arbitrary<number> = fc.double({
  min: 0.01,
  max: 10 ** 9,
  noNaN: true,
  noDefaultInfinity: true,
});
export const arbConfidence: fc.Arbitrary<number> = fc.double({
  min: 0,
  max: 1,
  noNaN: true,
  noDefaultInfinity: true,
});

export const arbTick: fc.Arbitrary<Tick> = fc.record({
  asset: arbAssetId,
  source: arbSourceId,
  price: arbPrice,
  receivedAt: arbMillis,
  sourceTimestamp: fc.option(arbMillis, { nil: undefined }),
});

export const arbSourceState: fc.Arbitrary<SourceState> = fc.record({
  asset: arbAssetId,
  source: arbSourceId,
  health: arbSourceHealth,
  lastTickAt: fc.option(arbMillis, { nil: null }),
  lastPrice: fc.option(arbPrice, { nil: null }),
  pendingHealth: fc.option(arbSourceHealth, { nil: null }),
  pendingStreak: fc.nat({ max: 20 }),
});

export const arbThresholds: fc.Arbitrary<Thresholds> = fc.record({
  freshnessDecayMs: fc.integer({ min: 1, max: 60_000 }),
  degradedAfterMs: fc.integer({ min: 1, max: 30_000 }),
  staleAfterMs: fc.integer({ min: 1, max: 60_000 }),
  healthHysteresisStreak: fc.integer({ min: 1, max: 10 }),
});

export const arbBreakerConfig: fc.Arbitrary<BreakerConfig> = fc.record({
  confidenceFloor: fc.double({ min: 0.1, max: 0.9, noNaN: true, noDefaultInfinity: true }),
  tripStreak: fc.integer({ min: 2, max: 10 }),
  recoveryWindowMs: fc.integer({ min: 1, max: 60_000 }),
  halfOpenProbeStreak: fc.integer({ min: 2, max: 10 }),
});
