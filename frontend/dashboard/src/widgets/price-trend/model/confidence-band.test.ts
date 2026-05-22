import { describe, expect, it } from 'vitest';

import { MAX_BAND_FRACTION, toBandPoint, toBandSeries } from './confidence-band.js';

import type { TrendPoint } from '@/entities/price-aggregate';

const point = (price: number, confidence: number): TrendPoint => ({ t: 1, price, confidence });

describe('toBandPoint', () => {
  it('should collapse the band to the price at full confidence', () => {
    const result = toBandPoint(point(60_000, 1));
    expect(result.band).toEqual([60_000, 60_000]);
  });

  it('should widen the band to the maximum fraction at zero confidence', () => {
    const result = toBandPoint(point(60_000, 0));
    const halfWidth = 60_000 * MAX_BAND_FRACTION;
    expect(result.band).toEqual([60_000 - halfWidth, 60_000 + halfWidth]);
  });

  it('should widen the band as confidence drops', () => {
    const [, highUpper] = toBandPoint(point(60_000, 0.9)).band;
    const [, lowUpper] = toBandPoint(point(60_000, 0.4)).band;
    expect(lowUpper).toBeGreaterThan(highUpper);
  });

  it('should keep the price centred within the band', () => {
    const { price, band } = toBandPoint(point(60_000, 0.5));
    expect((band[0] + band[1]) / 2).toBeCloseTo(price);
  });
});

describe('toBandSeries', () => {
  it('should map each trend point to a band point', () => {
    const series = toBandSeries([point(60_000, 1), point(3_000, 0.5)]);
    expect(series).toHaveLength(2);
    expect(series[0]?.band).toEqual([60_000, 60_000]);
  });
});
