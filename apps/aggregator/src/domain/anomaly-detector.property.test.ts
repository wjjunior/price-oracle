import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { detectAnomaly } from './anomaly-detector.js';

import type { AnomalyConfig, SourceState } from './types.js';
import type { Price } from '@price-oracle/contracts/primitives';

const cfg: AnomalyConfig = {
  driftTolerance: 2,
  streakLength: 3,
};

function makeState(lastPrice: Price | null): SourceState {
  return {
    asset: 'btc',
    source: 'binance',
    health: 'HEALTHY',
    lastTickAt: 1_000,
    lastPrice,
    pendingHealth: null,
    pendingStreak: 0,
  };
}

const priceArb = fc.double({ min: 0.01, max: 1_000_000, noNaN: true, noDefaultInfinity: true });

describe('detectAnomaly (properties)', () => {
  it('should always return a non-negative deviationRatio', () => {
    fc.assert(
      fc.property(priceArb, priceArb, (lastPrice, aggregatePrice) => {
        return detectAnomaly(makeState(lastPrice), aggregatePrice, cfg).deviationRatio >= 0;
      }),
    );
  });

  it('should trigger exactly when deviationRatio exceeds driftTolerance', () => {
    fc.assert(
      fc.property(priceArb, priceArb, (lastPrice, aggregatePrice) => {
        const result = detectAnomaly(makeState(lastPrice), aggregatePrice, cfg);
        return result.triggered === (result.deviationRatio > cfg.driftTolerance);
      }),
    );
  });

  it('should produce the same deviationRatio for symmetric deviations around the aggregate', () => {
    fc.assert(
      fc.property(
        priceArb,
        fc.double({ min: 0, max: 1000, noNaN: true }),
        (aggregatePrice, delta) => {
          const above = detectAnomaly(makeState(aggregatePrice + delta), aggregatePrice, cfg);
          const below = detectAnomaly(makeState(aggregatePrice - delta), aggregatePrice, cfg);
          expect(above.deviationRatio).toBeCloseTo(below.deviationRatio);
        },
      ),
    );
  });
});
