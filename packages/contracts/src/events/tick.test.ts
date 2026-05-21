import { describe, expect, it } from 'vitest';

import { validTick } from '../__test-helpers__/factories.js';

import { TickSchema } from './tick.js';

describe('TickSchema', () => {
  it('should round-trip a valid tick', () => {
    const tick = validTick();
    expect(TickSchema.parse(tick)).toEqual(tick);
  });

  it('should accept an optional sourceTimestamp', () => {
    const tick = validTick({ sourceTimestamp: 1_747_142_399_900 });
    expect(TickSchema.parse(tick)).toEqual(tick);
  });

  it('should reject extra fields (strict mode)', () => {
    expect(TickSchema.safeParse({ ...validTick(), extra: 'nope' }).success).toBe(false);
  });
});
