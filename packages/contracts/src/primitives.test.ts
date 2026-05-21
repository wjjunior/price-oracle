import { describe, expect, it } from 'vitest';

import {
  AssetId,
  BreakerState,
  Confidence,
  CorrelationId,
  Millis,
  Price,
  SourceHealth,
  SourceId,
} from './primitives.js';

describe('AssetId', () => {
  it('should accept btc and eth', () => {
    expect(AssetId.parse('btc')).toBe('btc');
    expect(AssetId.parse('eth')).toBe('eth');
  });
  it('should reject any value outside the lowercase set', () => {
    expect(AssetId.safeParse('BTC').success).toBe(false);
    expect(AssetId.safeParse('sol').success).toBe(false);
  });
});

describe('SourceId', () => {
  it('should accept binance, coinbase, and mock', () => {
    for (const s of ['binance', 'coinbase', 'mock'] as const) {
      expect(SourceId.parse(s)).toBe(s);
    }
  });
  it('should reject sources outside the configured set', () => {
    expect(SourceId.safeParse('kraken').success).toBe(false);
  });
});

describe('SourceHealth', () => {
  it('should accept the three declared health levels', () => {
    for (const h of ['HEALTHY', 'DEGRADED', 'STALE'] as const) {
      expect(SourceHealth.parse(h)).toBe(h);
    }
  });
  it('should reject case-mismatched variants', () => {
    expect(SourceHealth.safeParse('healthy').success).toBe(false);
  });
});

describe('BreakerState', () => {
  it('should accept CLOSED, HALF_OPEN, and OPEN', () => {
    for (const s of ['CLOSED', 'HALF_OPEN', 'OPEN'] as const) {
      expect(BreakerState.parse(s)).toBe(s);
    }
  });
  it('should reject unknown states', () => {
    expect(BreakerState.safeParse('TRIPPED').success).toBe(false);
  });
});

describe('Confidence', () => {
  it('should accept values in [0, 1] inclusive', () => {
    expect(Confidence.parse(0)).toBe(0);
    expect(Confidence.parse(1)).toBe(1);
    expect(Confidence.parse(0.42)).toBe(0.42);
  });
  it('should reject values outside [0, 1]', () => {
    expect(Confidence.safeParse(-0.01).success).toBe(false);
    expect(Confidence.safeParse(1.01).success).toBe(false);
  });
});

describe('Price', () => {
  it('should accept positive numbers', () => {
    expect(Price.parse(65_432.1)).toBe(65_432.1);
  });
  it('should reject zero and negative values', () => {
    expect(Price.safeParse(0).success).toBe(false);
    expect(Price.safeParse(-1).success).toBe(false);
  });
});

describe('Millis', () => {
  it('should accept non-negative integers', () => {
    expect(Millis.parse(0)).toBe(0);
    expect(Millis.parse(1_747_000_000_000)).toBe(1_747_000_000_000);
  });
  it('should reject negative or fractional values', () => {
    expect(Millis.safeParse(-1).success).toBe(false);
    expect(Millis.safeParse(1.5).success).toBe(false);
  });
});

describe('CorrelationId', () => {
  it('should accept any non-empty string', () => {
    expect(CorrelationId.parse('abc-123')).toBe('abc-123');
  });
  it('should reject the empty string', () => {
    expect(CorrelationId.safeParse('').success).toBe(false);
  });
});
