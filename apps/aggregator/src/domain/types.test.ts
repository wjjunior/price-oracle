import { describe, expectTypeOf, it } from 'vitest';

import type { AggregatePrice, SourceState, Thresholds, Tick } from './types.js';
import type { AssetId } from '@price-oracle/contracts/primitives';

describe('domain value objects', () => {
  it('should carry asset as a first-class AssetId field on SourceState', () => {
    expectTypeOf<SourceState>().toHaveProperty('asset').toEqualTypeOf<AssetId>();
  });

  it('should carry asset as a first-class AssetId field on AggregatePrice', () => {
    expectTypeOf<AggregatePrice>().toHaveProperty('asset').toEqualTypeOf<AssetId>();
  });

  it('should reject mutation of a Tick field', () => {
    const tick: Tick = { asset: 'btc', source: 'binance', price: 1, receivedAt: 0 };
    // @ts-expect-error price is readonly on the domain value object
    tick.price = 2;
  });

  it('should reject mutation of a SourceState field', () => {
    const state: SourceState = {
      asset: 'btc',
      source: 'binance',
      health: 'HEALTHY',
      lastTickAt: 0,
      lastPrice: 1,
      pendingHealth: null,
      pendingStreak: 0,
    };
    // @ts-expect-error health is readonly on the domain value object
    state.health = 'STALE';
  });

  it('should reject mutation of an AggregatePrice field', () => {
    const aggregate: AggregatePrice = {
      asset: 'btc',
      price: 1,
      confidence: 1,
      contributingSources: ['binance'],
      computedAt: 0,
    };
    // @ts-expect-error price is readonly on the domain value object
    aggregate.price = 2;
  });
});

describe('domain config objects', () => {
  it('should reject mutation of a Thresholds field', () => {
    const thresholds: Thresholds = {
      freshnessDecayMs: 5_000,
      degradedAfterMs: 2_000,
      staleAfterMs: 8_000,
      healthHysteresisStreak: 3,
    };
    // @ts-expect-error freshnessDecayMs is readonly on the config object
    thresholds.freshnessDecayMs = 1_000;
  });
});
