import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { perSourceHealthScore, updateSourceState } from './source-state.js';

import type { SourceState, Thresholds, Tick } from './types.js';
import type { SourceHealth } from '@price-oracle/contracts/primitives';

const cfg: Thresholds = {
  freshnessDecayMs: 10_000,
  degradedAfterMs: 2_000,
  staleAfterMs: 5_000,
  healthHysteresisStreak: 3,
};

function makeState(over: Partial<SourceState> = {}): SourceState {
  return {
    asset: 'btc',
    source: 'binance',
    health: 'HEALTHY',
    lastTickAt: 1_000,
    lastPrice: 100,
    pendingHealth: null,
    pendingStreak: 0,
    ...over,
  };
}

const healthArb = fc.constantFrom<SourceHealth>('HEALTHY', 'DEGRADED', 'STALE');
const millisArb = fc.integer({ min: 0, max: 1_000_000 });

describe('perSourceHealthScore (properties)', () => {
  it('should always return a value within [0, 1]', () => {
    fc.assert(
      fc.property(millisArb, millisArb, healthArb, (lastTickAt, now, health) => {
        const score = perSourceHealthScore(makeState({ health, lastTickAt }), now, cfg);
        return score >= 0 && score <= 1;
      }),
    );
  });

  it('should return 0 for a STALE source regardless of freshness', () => {
    fc.assert(
      fc.property(millisArb, millisArb, (lastTickAt, now) => {
        return perSourceHealthScore(makeState({ health: 'STALE', lastTickAt }), now, cfg) === 0;
      }),
    );
  });
});

describe('updateSourceState (properties)', () => {
  it('should never commit a transition before healthHysteresisStreak consecutive readings', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: cfg.healthHysteresisStreak - 1 }), (k) => {
        let s = makeState({ health: 'HEALTHY', lastTickAt: 0 });
        for (let i = 0; i < k; i += 1) {
          s = updateSourceState(s, null, 3_000 + i, cfg);
        }
        return s.health === 'HEALTHY';
      }),
    );
  });

  it('should never move lastTickAt backwards when applying an arbitrary tick', () => {
    fc.assert(
      fc.property(millisArb, millisArb, millisArb, (prevTs, tickTs, now) => {
        const prev = makeState({ lastTickAt: prevTs });
        const tick: Tick = { asset: 'btc', source: 'binance', price: 1, receivedAt: tickTs };
        const next = updateSourceState(prev, tick, now, cfg);
        return next.lastTickAt !== null && next.lastTickAt >= prevTs;
      }),
    );
  });

  it('should not mutate prev for arbitrary inputs', () => {
    fc.assert(
      fc.property(healthArb, millisArb, millisArb, (health, lastTickAt, now) => {
        const prev = makeState({ health, lastTickAt });
        const snapshot = { ...prev };
        updateSourceState(prev, null, now, cfg);
        expect(prev).toEqual(snapshot);
      }),
    );
  });
});
