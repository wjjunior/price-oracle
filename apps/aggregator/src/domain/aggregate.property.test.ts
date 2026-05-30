import { SourceId } from '@price-oracle/contracts/primitives';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { aggregate } from './aggregate.js';
import { perSourceHealthScore } from './source-state.js';


import type { SourceState, Thresholds } from './types.js';
import type { AssetId, SourceHealth } from '@price-oracle/contracts/primitives';

const cfg: Thresholds = {
  freshnessDecayMs: 10_000,
  degradedAfterMs: 2_000,
  staleAfterMs: 5_000,
  healthHysteresisStreak: 3,
};

const healthArb = fc.constantFrom<SourceHealth>('HEALTHY', 'DEGRADED', 'STALE');
const sourceArb: fc.Arbitrary<SourceId> = fc.constantFrom(...SourceId.options);
const priceArb = fc.double({ min: 0.01, max: 1_000_000, noNaN: true, noDefaultInfinity: true });
const millisArb = fc.integer({ min: 0, max: 20_000 });
const nowArb = fc.integer({ min: 0, max: 30_000 });

const stateArb = (asset: AssetId): fc.Arbitrary<SourceState> =>
  fc.record({
    asset: fc.constant(asset),
    source: sourceArb,
    health: healthArb,
    lastTickAt: fc.option(millisArb, { nil: null }),
    lastPrice: fc.option(priceArb, { nil: null }),
    pendingHealth: fc.constant<SourceHealth | null>(null),
    pendingStreak: fc.constant(0),
  });

const sliceArb = (asset: AssetId): fc.Arbitrary<SourceState[]> =>
  fc.array(stateArb(asset), { maxLength: 6 });

function activePrices(states: readonly SourceState[], now: number): number[] {
  const prices: number[] = [];
  for (const state of states) {
    if (perSourceHealthScore(state, now, cfg) > 0 && state.lastPrice !== null) {
      prices.push(state.lastPrice);
    }
  }
  return prices;
}

describe('aggregate (properties)', () => {
  it('should return a price within the active price range', () => {
    fc.assert(
      fc.property(sliceArb('btc'), nowArb, (states, now) => {
        const result = aggregate(states, now, cfg);
        if (result === null) return true;
        const prices = activePrices(states, now);
        return result.price >= Math.min(...prices) && result.price <= Math.max(...prices);
      }),
    );
  });

  it('should return null exactly when no source qualifies', () => {
    fc.assert(
      fc.property(sliceArb('btc'), nowArb, (states, now) => {
        const result = aggregate(states, now, cfg);
        return (result === null) === (activePrices(states, now).length === 0);
      }),
    );
  });

  it('should produce a confidence within [0, 1]', () => {
    fc.assert(
      fc.property(sliceArb('btc'), nowArb, (states, now) => {
        const result = aggregate(states, now, cfg);
        if (result === null) return true;
        return result.confidence >= 0 && result.confidence <= 1;
      }),
    );
  });

  it('should contribute only sources present in the asset slice it was given', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<AssetId>('btc', 'eth').chain((asset) => sliceArb(asset)),
        nowArb,
        (states, now) => {
          const result = aggregate(states, now, cfg);
          if (result === null) return true;
          const present = new Set<SourceId>(states.map((s) => s.source));
          return result.contributingSources.every((s) => present.has(s));
        },
      ),
    );
  });

  it('should not mutate the input states array', () => {
    fc.assert(
      fc.property(sliceArb('btc'), nowArb, (states, now) => {
        const snapshot = structuredClone(states);
        aggregate(states, now, cfg);
        expect(states).toEqual(snapshot);
      }),
    );
  });
});
