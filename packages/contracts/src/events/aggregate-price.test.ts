import { describe, expect, it } from 'vitest';

import { validAggregatePrice } from '../__test-helpers__/factories.js';

import { AggregatePriceSchema } from './aggregate-price.js';

describe('AggregatePriceSchema', () => {
  it('should round-trip a valid aggregate', () => {
    const aggregate = validAggregatePrice();
    expect(AggregatePriceSchema.parse(aggregate)).toEqual(aggregate);
  });

  it('should accept an empty contributingSources array', () => {
    const aggregate = validAggregatePrice({ contributingSources: [] });
    expect(AggregatePriceSchema.parse(aggregate)).toEqual(aggregate);
  });

  it('should reject extra fields (strict mode)', () => {
    expect(AggregatePriceSchema.safeParse({ ...validAggregatePrice(), extra: 1 }).success).toBe(
      false,
    );
  });
});
