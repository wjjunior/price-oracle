import type { TrendPoint } from '@/entities/price-aggregate';

export const MAX_BAND_FRACTION = 0.02;

export type BandPoint = {
  readonly t: number;
  readonly price: number;
  readonly confidence: number;
  readonly band: readonly [number, number];
};

export function toBandPoint(point: TrendPoint): BandPoint {
  const halfWidth = point.price * MAX_BAND_FRACTION * (1 - point.confidence);
  return {
    t: point.t,
    price: point.price,
    confidence: point.confidence,
    band: [point.price - halfWidth, point.price + halfWidth],
  };
}

export function toBandSeries(points: readonly TrendPoint[]): BandPoint[] {
  return points.map(toBandPoint);
}
