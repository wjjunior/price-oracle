import { describe, expect, it } from 'vitest';

import { updateSourceState } from './source-state.js';

import type { SourceState, Thresholds, Tick } from './types.js';

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

function tickAt(receivedAt: number, price = 100): Tick {
  return { asset: 'btc', source: 'binance', price, receivedAt };
}

describe('updateSourceState', () => {
  it('should stay HEALTHY on a fresh tick and clear any pending candidate', () => {
    const prev = makeState({ health: 'HEALTHY', pendingHealth: 'DEGRADED', pendingStreak: 1 });
    const next = updateSourceState(prev, tickAt(10_000), 10_000, cfg);
    expect(next.health).toBe('HEALTHY');
    expect(next.lastTickAt).toBe(10_000);
    expect(next.lastPrice).toBe(100);
    expect(next.pendingHealth).toBeNull();
    expect(next.pendingStreak).toBe(0);
  });

  it('should hold HEALTHY until healthHysteresisStreak DEGRADED readings, then commit', () => {
    let s = makeState({ health: 'HEALTHY', lastTickAt: 0 });
    s = updateSourceState(s, null, 3_000, cfg);
    expect(s.health).toBe('HEALTHY');
    expect(s.pendingHealth).toBe('DEGRADED');
    expect(s.pendingStreak).toBe(1);
    s = updateSourceState(s, null, 3_001, cfg);
    expect(s.pendingStreak).toBe(2);
    s = updateSourceState(s, null, 3_002, cfg);
    expect(s.health).toBe('DEGRADED');
    expect(s.pendingHealth).toBeNull();
    expect(s.pendingStreak).toBe(0);
  });

  it('should reset the pending streak when the candidate returns to the committed health', () => {
    let s = makeState({ health: 'HEALTHY', lastTickAt: 0 });
    s = updateSourceState(s, null, 3_000, cfg);
    s = updateSourceState(s, null, 3_001, cfg);
    s = updateSourceState(s, tickAt(3_002), 3_002, cfg);
    expect(s.health).toBe('HEALTHY');
    expect(s.pendingHealth).toBeNull();
    expect(s.pendingStreak).toBe(0);
  });

  it('should not recover STALE -> HEALTHY until N consecutive HEALTHY readings', () => {
    let s = makeState({ health: 'STALE', lastTickAt: null });
    s = updateSourceState(s, tickAt(100), 100, cfg);
    expect(s.health).toBe('STALE');
    expect(s.pendingHealth).toBe('HEALTHY');
    expect(s.pendingStreak).toBe(1);
    s = updateSourceState(s, tickAt(150), 150, cfg);
    expect(s.health).toBe('STALE');
    s = updateSourceState(s, tickAt(200), 200, cfg);
    expect(s.health).toBe('HEALTHY');
  });

  it('should propose STALE when age exceeds staleAfterMs and commit after the streak', () => {
    let s = makeState({ health: 'DEGRADED', lastTickAt: 0 });
    s = updateSourceState(s, null, 6_000, cfg);
    expect(s.pendingHealth).toBe('STALE');
    s = updateSourceState(s, null, 6_001, cfg);
    s = updateSourceState(s, null, 6_002, cfg);
    expect(s.health).toBe('STALE');
  });

  it('should keep a never-seen source (null lastTickAt) STALE', () => {
    const next = updateSourceState(
      makeState({ health: 'STALE', lastTickAt: null }),
      null,
      5_000,
      cfg,
    );
    expect(next.health).toBe('STALE');
    expect(next.lastTickAt).toBeNull();
  });

  it('should not change health more than once within an alternating candidate sequence', () => {
    let s = makeState({ health: 'HEALTHY', lastTickAt: 0 });
    for (let i = 0; i < 20; i += 1) {
      s =
        i % 2 === 0
          ? updateSourceState(s, null, 10_000, cfg)
          : updateSourceState(s, tickAt(10_000 + i), 10_000 + i, cfg);
    }
    expect(s.health).toBe('HEALTHY');
  });

  it('should not mutate the previous state', () => {
    const prev = makeState({ health: 'HEALTHY', lastTickAt: 0 });
    const snapshot = { ...prev };
    updateSourceState(prev, null, 3_000, cfg);
    expect(prev).toEqual(snapshot);
  });
});
