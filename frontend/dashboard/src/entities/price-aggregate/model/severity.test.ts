import { describe, expect, it } from 'vitest';

import { confidenceLevel, priceSeverity } from './severity.js';

import type { AggregatePrice } from '@price-oracle/contracts/events';

const aggregate = (confidence: number): AggregatePrice => ({
  asset: 'btc',
  price: 65_000,
  confidence,
  contributingSources: ['binance'],
  computedAt: 1_747_000_000_000,
});

describe('confidenceLevel', () => {
  it('should classify HIGH at or above the high threshold', () => {
    expect(confidenceLevel(0.8)).toBe('HIGH');
    expect(confidenceLevel(0.95)).toBe('HIGH');
  });

  it('should classify DEGRADED from the degraded threshold up to the high threshold', () => {
    expect(confidenceLevel(0.5)).toBe('DEGRADED');
    expect(confidenceLevel(0.79)).toBe('DEGRADED');
  });

  it('should classify UNAVAILABLE below the degraded threshold', () => {
    expect(confidenceLevel(0.49)).toBe('UNAVAILABLE');
    expect(confidenceLevel(0)).toBe('UNAVAILABLE');
  });
});

describe('priceSeverity', () => {
  it('should be UNAVAILABLE when there is no aggregate', () => {
    expect(priceSeverity(null)).toBe('UNAVAILABLE');
  });

  it('should derive the level from the aggregate confidence', () => {
    expect(priceSeverity(aggregate(0.95))).toBe('HIGH');
    expect(priceSeverity(aggregate(0.6))).toBe('DEGRADED');
    expect(priceSeverity(aggregate(0.2))).toBe('UNAVAILABLE');
  });
});
