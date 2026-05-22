import { describe, expect, it } from 'vitest';

import { aggregate, type AggregateResult } from './aggregate.js';

import type { SourceState, Thresholds } from './types.js';
import type { SourceId } from '@price-oracle/contracts/primitives';

const cfg: Thresholds = {
  freshnessDecayMs: 10_000,
  degradedAfterMs: 2_000,
  staleAfterMs: 5_000,
  healthHysteresisStreak: 3,
};

const NOW = 10_000;

function makeState(over: Partial<SourceState> = {}): SourceState {
  return {
    asset: 'btc',
    source: 'binance',
    health: 'HEALTHY',
    lastTickAt: NOW,
    lastPrice: 100,
    pendingHealth: null,
    pendingStreak: 0,
    ...over,
  };
}

function unwrap(result: AggregateResult | null): AggregateResult {
  if (result === null) expect.fail('expected an aggregate, got null');
  return result;
}

describe('aggregate', () => {
  it('should return null when there are no states', () => {
    expect(aggregate([], NOW, cfg)).toBeNull();
  });

  it('should return null when every source is stale', () => {
    const states = [
      makeState({ source: 'binance', health: 'STALE' }),
      makeState({ source: 'coinbase', health: 'STALE' }),
    ];
    expect(aggregate(states, NOW, cfg)).toBeNull();
  });

  it('should return null when no source has a price', () => {
    const states = [makeState({ lastPrice: null }), makeState({ source: 'coinbase', lastPrice: null })];
    expect(aggregate(states, NOW, cfg)).toBeNull();
  });

  it('should weight-median three healthy sources and list all as contributing', () => {
    const states = [
      makeState({ source: 'binance', lastPrice: 100 }),
      makeState({ source: 'coinbase', lastPrice: 102 }),
      makeState({ source: 'mock', lastPrice: 101 }),
    ];
    const result = unwrap(aggregate(states, NOW, cfg));
    expect(result.price).toBe(101);
    expect([...result.contributingSources].sort()).toEqual<SourceId[]>([
      'binance',
      'coinbase',
      'mock',
    ]);
  });

  it('should report high confidence when sources are fresh and agree', () => {
    const states = [
      makeState({ source: 'binance', lastPrice: 100 }),
      makeState({ source: 'coinbase', lastPrice: 100 }),
      makeState({ source: 'mock', lastPrice: 100 }),
    ];
    const result = unwrap(aggregate(states, NOW, cfg));
    expect(result.confidence).toBeCloseTo(1, 5);
  });

  it('should exclude a stale source and reduce coverage', () => {
    const states = [
      makeState({ source: 'binance', lastPrice: 100 }),
      makeState({ source: 'coinbase', lastPrice: 100 }),
      makeState({ source: 'mock', health: 'STALE', lastPrice: 100 }),
    ];
    const result = unwrap(aggregate(states, NOW, cfg));
    expect([...result.contributingSources].sort()).toEqual<SourceId[]>(['binance', 'coinbase']);
    // coverage 2/3 caps confidence below the all-fresh-agreeing case.
    expect(result.confidence).toBeLessThan(1);
    expect(result.confidence).toBeCloseTo(2 / 3, 5);
  });

  it('should lower confidence when fresh sources disagree', () => {
    const agree = unwrap(
      aggregate(
        [
          makeState({ source: 'binance', lastPrice: 100 }),
          makeState({ source: 'coinbase', lastPrice: 100 }),
        ],
        NOW,
        cfg,
      ),
    );
    const disagree = unwrap(
      aggregate(
        [
          makeState({ source: 'binance', lastPrice: 100 }),
          makeState({ source: 'coinbase', lastPrice: 130 }),
        ],
        NOW,
        cfg,
      ),
    );
    expect(disagree.confidence).toBeLessThan(agree.confidence);
  });

  it('should decay confidence as the freshest tick ages', () => {
    const states = [makeState({ source: 'binance', lastTickAt: NOW, lastPrice: 100 })];
    const fresh = unwrap(aggregate(states, NOW, cfg));
    const aged = unwrap(aggregate(states, NOW + cfg.freshnessDecayMs / 2, cfg));
    expect(aged.confidence).toBeLessThan(fresh.confidence);
  });

  it('should derive freshness from the freshest active source', () => {
    const states = [
      makeState({ source: 'binance', lastTickAt: NOW - 8_000, lastPrice: 100 }),
      makeState({ source: 'coinbase', lastTickAt: NOW, lastPrice: 100 }),
    ];
    const result = unwrap(aggregate(states, NOW, cfg));
    // freshest tick is at NOW → freshness 1; agreement 1; coverage 1 → confidence 1.
    expect(result.confidence).toBeCloseTo(1, 5);
  });

  it('should return a price within the active price range', () => {
    const states = [
      makeState({ source: 'binance', lastPrice: 90 }),
      makeState({ source: 'coinbase', lastPrice: 110 }),
      makeState({ source: 'mock', lastPrice: 100 }),
    ];
    const result = unwrap(aggregate(states, NOW, cfg));
    expect(result.price).toBeGreaterThanOrEqual(90);
    expect(result.price).toBeLessThanOrEqual(110);
  });

  it('should not mutate the input states array', () => {
    const states: SourceState[] = [
      makeState({ source: 'binance', lastPrice: 100 }),
      makeState({ source: 'coinbase', health: 'STALE' }),
    ];
    const snapshot = structuredClone(states);
    aggregate(states, NOW, cfg);
    expect(states).toEqual(snapshot);
  });
});
