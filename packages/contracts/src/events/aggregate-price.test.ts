import { describe, expect, it } from 'vitest';

import { validAggregatePrice } from '../__test-helpers__/factories.js';

import { AggregatePriceSchema } from './aggregate-price.js';

describe('AggregatePriceSchema', () => {
  it('round-trips a valid aggregate', () => {
    const aggregate = validAggregatePrice();
    expect(AggregatePriceSchema.parse(aggregate)).toEqual(aggregate);
  });

  it('rejects confidence above 1', () => {
    expect(AggregatePriceSchema.safeParse(validAggregatePrice({ confidence: 1.01 })).success).toBe(
      false,
    );
  });

  it('rejects confidence below 0', () => {
    expect(AggregatePriceSchema.safeParse(validAggregatePrice({ confidence: -0.01 })).success).toBe(
      false,
    );
  });

  it('rejects non-positive price', () => {
    expect(AggregatePriceSchema.safeParse(validAggregatePrice({ price: 0 })).success).toBe(false);
  });

  it('accepts an empty contributingSources array', () => {
    const aggregate = validAggregatePrice({ contributingSources: [] });
    expect(AggregatePriceSchema.parse(aggregate)).toEqual(aggregate);
  });

  it('rejects extra fields (strict mode)', () => {
    expect(AggregatePriceSchema.safeParse({ ...validAggregatePrice(), extra: 1 }).success).toBe(
      false,
    );
  });
});
