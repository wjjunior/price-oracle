import { describe, expect, it } from 'vitest';

import { validTick } from '../__test-helpers__/factories.js';

import { TickSchema } from './tick.js';

describe('TickSchema', () => {
  it('round-trips a valid tick', () => {
    const tick = validTick();
    expect(TickSchema.parse(tick)).toEqual(tick);
  });

  it('accepts a tick with optional sourceTimestamp', () => {
    const tick = validTick({ sourceTimestamp: 1_747_142_399_900 });
    expect(TickSchema.parse(tick)).toEqual(tick);
  });

  it('accepts a tick without sourceTimestamp (optional field)', () => {
    const tick = validTick();
    expect('sourceTimestamp' in tick).toBe(false);
    expect(TickSchema.parse(tick)).toEqual(tick);
  });

  it('rejects non-positive price', () => {
    expect(TickSchema.safeParse(validTick({ price: 0 })).success).toBe(false);
    expect(TickSchema.safeParse(validTick({ price: -1 })).success).toBe(false);
  });

  it('rejects extra fields (strict mode)', () => {
    expect(TickSchema.safeParse({ ...validTick(), extra: 'nope' }).success).toBe(false);
  });
});
