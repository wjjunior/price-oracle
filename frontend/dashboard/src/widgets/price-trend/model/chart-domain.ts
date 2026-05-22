import type { TrendPoint } from '@/entities/price-aggregate';

export type Domain = readonly [number, number];

export const DOMAIN_PADDING_FRACTION = 0.3;
export const FLAT_DOMAIN_PADDING_FRACTION = 0.001;
export const FLOOR_PADDING_FRACTION = 0.5;

function pricesOf(points: readonly TrendPoint[]): readonly number[] {
  return points.map((p) => p.price);
}

export function priceDomain(points: readonly TrendPoint[]): Domain | undefined {
  if (points.length === 0) return undefined;
  const prices = pricesOf(points);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = Math.max((max - min) * DOMAIN_PADDING_FRACTION, min * FLAT_DOMAIN_PADDING_FRACTION);
  return [min - padding, max + padding];
}

export function priceFloor(points: readonly TrendPoint[]): number | undefined {
  const domain = priceDomain(points);
  if (!domain) return undefined;
  const dataMin = Math.min(...pricesOf(points));
  return dataMin - (dataMin - domain[0]) * FLOOR_PADDING_FRACTION;
}
