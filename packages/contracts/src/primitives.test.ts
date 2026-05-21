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
  it('accepts btc and eth', () => {
    expect(AssetId.parse('btc')).toBe('btc');
    expect(AssetId.parse('eth')).toBe('eth');
  });
  it('rejects uppercase variants', () => {
    expect(AssetId.safeParse('BTC').success).toBe(false);
  });
  it('rejects unknown assets', () => {
    expect(AssetId.safeParse('sol').success).toBe(false);
  });
});

describe('SourceId', () => {
  it('accepts the three configured sources', () => {
    for (const s of ['binance', 'coinbase', 'mock'] as const) {
      expect(SourceId.parse(s)).toBe(s);
    }
  });
  it('rejects kraken (out of scope)', () => {
    expect(SourceId.safeParse('kraken').success).toBe(false);
  });
});

describe('SourceHealth', () => {
  it('accepts HEALTHY, DEGRADED, STALE', () => {
    for (const h of ['HEALTHY', 'DEGRADED', 'STALE'] as const) {
      expect(SourceHealth.parse(h)).toBe(h);
    }
  });
  it('rejects lower-case variants', () => {
    expect(SourceHealth.safeParse('healthy').success).toBe(false);
  });
});

describe('BreakerState', () => {
  it('accepts CLOSED, HALF_OPEN, OPEN', () => {
    for (const s of ['CLOSED', 'HALF_OPEN', 'OPEN'] as const) {
      expect(BreakerState.parse(s)).toBe(s);
    }
  });
  it('rejects unknown states', () => {
    expect(BreakerState.safeParse('TRIPPED').success).toBe(false);
  });
});

describe('Confidence', () => {
  it('accepts 0, 1, and intermediate values', () => {
    expect(Confidence.parse(0)).toBe(0);
    expect(Confidence.parse(1)).toBe(1);
    expect(Confidence.parse(0.42)).toBe(0.42);
  });
  it('rejects values outside [0, 1]', () => {
    expect(Confidence.safeParse(-0.01).success).toBe(false);
    expect(Confidence.safeParse(1.01).success).toBe(false);
  });
});

describe('Price', () => {
  it('accepts positive numbers', () => {
    expect(Price.parse(1)).toBe(1);
    expect(Price.parse(65_432.1)).toBe(65_432.1);
  });
  it('rejects zero and negatives', () => {
    expect(Price.safeParse(0).success).toBe(false);
    expect(Price.safeParse(-1).success).toBe(false);
  });
});

describe('Millis', () => {
  it('accepts non-negative integers', () => {
    expect(Millis.parse(0)).toBe(0);
    expect(Millis.parse(1_747_000_000_000)).toBe(1_747_000_000_000);
  });
  it('rejects negative or fractional values', () => {
    expect(Millis.safeParse(-1).success).toBe(false);
    expect(Millis.safeParse(1.5).success).toBe(false);
  });
});

describe('CorrelationId', () => {
  it('accepts any non-empty string', () => {
    expect(CorrelationId.parse('abc-123')).toBe('abc-123');
  });
  it('rejects empty string', () => {
    expect(CorrelationId.safeParse('').success).toBe(false);
  });
});
