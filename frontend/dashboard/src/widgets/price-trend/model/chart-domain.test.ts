import { describe, expect, it } from 'vitest';

import {
  DOMAIN_PADDING_FRACTION,
  FLAT_DOMAIN_PADDING_FRACTION,
  FLOOR_PADDING_FRACTION,
  priceDomain,
  priceFloor,
} from './chart-domain.js';

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

describe('priceFloor', () => {
  it('should return undefined when there are no points', () => {
    expect(priceFloor([])).toBeUndefined();
  });

  it('should sit between the domain bottom and the lowest observed price', () => {
    const points = [point(70_000), point(80_000)];
    const dataMin = 70_000;
    const padding = (80_000 - 70_000) * DOMAIN_PADDING_FRACTION;
    const expected = dataMin - padding * FLOOR_PADDING_FRACTION;
    expect(priceFloor(points)).toBeCloseTo(expected);
  });

  it('should remain below the lowest observed price', () => {
    const points = [point(2_000), point(2_100), point(2_050)];
    expect(priceFloor(points)).toBeLessThan(2_000);
  });
});
