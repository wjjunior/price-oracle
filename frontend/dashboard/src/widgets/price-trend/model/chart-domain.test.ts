import { describe, expect, it } from 'vitest';

import { DOMAIN_PADDING_FRACTION, FLAT_DOMAIN_PADDING_FRACTION, priceDomain } from './chart-domain.js';

import type { TrendPoint } from '@/entities/price-aggregate';

const point = (price: number): TrendPoint => ({ t: 1, price, confidence: 1 });

describe('priceDomain', () => {
  it('should return undefined when there are no points', () => {
    expect(priceDomain([])).toBeUndefined();
  });

  it('should pad the observed range by the configured fraction', () => {
    const domain = priceDomain([point(70_000), point(75_000), point(80_000)]);
    const padding = (80_000 - 70_000) * DOMAIN_PADDING_FRACTION;
    expect(domain).toEqual([70_000 - padding, 80_000 + padding]);
  });

  it('should still apply a flat padding when all prices are identical', () => {
    const domain = priceDomain([point(75_000), point(75_000)]);
    const flatPadding = 75_000 * FLAT_DOMAIN_PADDING_FRACTION;
    expect(domain).toEqual([75_000 - flatPadding, 75_000 + flatPadding]);
  });
});
