import { describe, expectTypeOf, it } from 'vitest';

import type { AggregatePrice, AnomalyConfig, BreakerConfig, SourceState, Thresholds, Tick } from './types.js';
import type { AssetId, SourceId } from '@price-oracle/contracts/primitives';

describe('domain value objects', () => {
  it('should carry asset as a first-class AssetId field on SourceState', () => {
    expectTypeOf<SourceState>().toHaveProperty('asset').toEqualTypeOf<AssetId>();
  });

  it('should carry asset as a first-class AssetId field on AggregatePrice', () => {
    expectTypeOf<AggregatePrice>().toHaveProperty('asset').toEqualTypeOf<AssetId>();
  });

  it('should expose every Tick field as readonly', () => {
    expectTypeOf<Tick>().toEqualTypeOf<Readonly<Tick>>();
  });

  it('should expose every SourceState field as readonly', () => {
    expectTypeOf<SourceState>().toEqualTypeOf<Readonly<SourceState>>();
  });

  it('should expose every scalar AggregatePrice field as readonly', () => {
    expectTypeOf<Omit<AggregatePrice, 'contributingSources'>>().toEqualTypeOf<
      Readonly<Omit<AggregatePrice, 'contributingSources'>>
    >();
  });

  it('should model contributingSources as a readonly array, not just a readonly field', () => {
    expectTypeOf<AggregatePrice['contributingSources']>().toEqualTypeOf<readonly SourceId[]>();
  });
});

describe('domain config objects', () => {
  it('should expose every Thresholds field as readonly', () => {
    expectTypeOf<Thresholds>().toEqualTypeOf<Readonly<Thresholds>>();
  });

  it('should expose every BreakerConfig field as readonly', () => {
    expectTypeOf<BreakerConfig>().toEqualTypeOf<Readonly<BreakerConfig>>();
  });

  it('should expose every AnomalyConfig field as readonly', () => {
    expectTypeOf<AnomalyConfig>().toEqualTypeOf<Readonly<AnomalyConfig>>();
  });
});
