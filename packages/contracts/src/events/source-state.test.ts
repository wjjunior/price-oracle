import { describe, expect, it } from 'vitest';

import { validSourceState } from '../__test-helpers__/factories.js';

import { SourceStateSchema } from './source-state.js';

describe('SourceStateSchema', () => {
  it('should round-trip a valid source state', () => {
    const state = validSourceState();
    expect(SourceStateSchema.parse(state)).toEqual(state);
  });

  it('should accept null lastTickAt and lastPrice for a never-seen source', () => {
    const state = validSourceState({
      health: 'STALE',
      lastTickAt: null,
      lastPrice: null,
    });
    expect(SourceStateSchema.parse(state)).toEqual(state);
  });

  it('should accept a pending hysteresis candidate', () => {
    const state = validSourceState({
      pendingHealth: 'DEGRADED',
      pendingStreak: 2,
    });
    expect(SourceStateSchema.parse(state)).toEqual(state);
  });

  it('should reject extra fields (strict mode)', () => {
    expect(SourceStateSchema.safeParse({ ...validSourceState(), extra: 1 }).success).toBe(false);
  });
});
