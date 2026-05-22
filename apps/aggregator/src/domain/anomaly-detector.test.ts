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

describe('detectAnomaly', () => {
  it('should report no anomaly when the source price equals the aggregate', () => {
    const result = detectAnomaly(makeState(100), 100, cfg);
    expect(result.deviationRatio).toBe(0);
    expect(result.triggered).toBe(false);
  });

  it('should report no anomaly when deviation is below tolerance', () => {
    const result = detectAnomaly(makeState(101), 100, cfg);
    expect(result.deviationRatio).toBeCloseTo(1);
    expect(result.triggered).toBe(false);
  });

  it('should report an anomaly when deviation exceeds tolerance', () => {
    const result = detectAnomaly(makeState(105), 100, cfg);
    expect(result.deviationRatio).toBeCloseTo(5);
    expect(result.triggered).toBe(true);
  });

  it('should not trigger when deviation exactly equals the tolerance', () => {
    const result = detectAnomaly(makeState(102), 100, cfg);
    expect(result.deviationRatio).toBeCloseTo(2);
    expect(result.triggered).toBe(false);
  });

  it('should report no anomaly and zero deviation for a never-ticked source', () => {
    const result = detectAnomaly(makeState(null), 100, cfg);
    expect(result.deviationRatio).toBe(0);
    expect(result.triggered).toBe(false);
  });

  it('should produce equal deviation for prices equally above and below the aggregate', () => {
    const above = detectAnomaly(makeState(110), 100, cfg);
    const below = detectAnomaly(makeState(90), 100, cfg);
    expect(above.deviationRatio).toBeCloseTo(below.deviationRatio);
    expect(above.triggered).toBe(true);
    expect(below.triggered).toBe(true);
  });

  it('should not mutate the input state', () => {
    const state = makeState(150);
    const snapshot = { ...state };
    detectAnomaly(state, 100, cfg);
    expect(state).toEqual(snapshot);
  });
});
