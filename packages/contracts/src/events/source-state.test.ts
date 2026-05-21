import { describe, expect, it } from 'vitest';

import { validSourceState } from '../__test-helpers__/factories.js';

import { SourceStateSchema } from './source-state.js';

describe('SourceStateSchema', () => {
  it('round-trips a valid source state', () => {
    const state = validSourceState();
    expect(SourceStateSchema.parse(state)).toEqual(state);
  });

  it('accepts a never-seen source (null lastTickAt and lastPrice)', () => {
    const state = validSourceState({
      health: 'STALE',
      lastTickAt: null,
      lastPrice: null,
    });
    expect(SourceStateSchema.parse(state)).toEqual(state);
  });

  it('accepts a pending hysteresis candidate', () => {
    const state = validSourceState({
      pendingHealth: 'DEGRADED',
      pendingStreak: 2,
    });
    expect(SourceStateSchema.parse(state)).toEqual(state);
  });

  it('rejects negative pendingStreak', () => {
    expect(SourceStateSchema.safeParse(validSourceState({ pendingStreak: -1 })).success).toBe(
      false,
    );
  });

  it('rejects extra fields (strict mode)', () => {
    expect(SourceStateSchema.safeParse({ ...validSourceState(), extra: 1 }).success).toBe(false);
  });
});
