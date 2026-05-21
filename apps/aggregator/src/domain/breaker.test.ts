import { describe, expect, it } from 'vitest';

import { transitionBreaker, type BreakerInput } from './breaker.js';

import type { BreakerConfig } from './types.js';

const cfg: BreakerConfig = {
  confidenceFloor: 0.5,
  tripStreak: 3,
  recoveryWindowMs: 30_000,
  halfOpenProbeStreak: 2,
};

const input = (overrides: Partial<BreakerInput> = {}): BreakerInput => ({
  confidence: 0.9,
  streak: 0,
  openedAt: null,
  ...overrides,
});

const NOW = 1_000_000;

describe('transitionBreaker', () => {
  it('should stay CLOSED when confidence is at or above the floor', () => {
    expect(transitionBreaker('CLOSED', input({ confidence: 0.5, streak: 9 }), NOW, cfg)).toBe(
      'CLOSED',
    );
  });

  it('should stay CLOSED when below floor but the streak has not reached tripStreak', () => {
    expect(transitionBreaker('CLOSED', input({ confidence: 0.2, streak: 2 }), NOW, cfg)).toBe(
      'CLOSED',
    );
  });

  it('should open from CLOSED when below floor and the streak reaches tripStreak', () => {
    expect(transitionBreaker('CLOSED', input({ confidence: 0.2, streak: 3 }), NOW, cfg)).toBe(
      'OPEN',
    );
  });

  it('should stay OPEN before the recovery window elapses', () => {
    const openedAt = NOW - (cfg.recoveryWindowMs - 1);
    expect(transitionBreaker('OPEN', input({ confidence: 0.9, openedAt }), NOW, cfg)).toBe('OPEN');
  });

  it('should move from OPEN to HALF_OPEN once the recovery window elapses', () => {
    const openedAt = NOW - cfg.recoveryWindowMs;
    expect(transitionBreaker('OPEN', input({ confidence: 0.2, openedAt }), NOW, cfg)).toBe(
      'HALF_OPEN',
    );
  });

  it('should close from HALF_OPEN after halfOpenProbeStreak consecutive good probes', () => {
    expect(transitionBreaker('HALF_OPEN', input({ confidence: 0.9, streak: 2 }), NOW, cfg)).toBe(
      'CLOSED',
    );
  });

  it('should stay HALF_OPEN on a good probe before reaching the probe streak', () => {
    expect(transitionBreaker('HALF_OPEN', input({ confidence: 0.9, streak: 1 }), NOW, cfg)).toBe(
      'HALF_OPEN',
    );
  });

  it('should reopen from HALF_OPEN on a single bad probe regardless of streak', () => {
    expect(transitionBreaker('HALF_OPEN', input({ confidence: 0.2, streak: 9 }), NOW, cfg)).toBe(
      'OPEN',
    );
  });
});
