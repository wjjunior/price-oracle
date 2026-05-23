import type { TrendPoint } from '@/entities/price-aggregate';

export type Domain = readonly [number, number];

export const DOMAIN_PADDING_FRACTION = 0.3;
export const FLAT_DOMAIN_PADDING_FRACTION = 0.001;

export function priceDomain(points: readonly TrendPoint[]): Domain | undefined {
  if (points.length === 0) return undefined;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = Math.max((max - min) * DOMAIN_PADDING_FRACTION, min * FLAT_DOMAIN_PADDING_FRACTION);
  return [min - padding, max + padding];
}
