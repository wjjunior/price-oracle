import { z } from 'zod';

export const AssetId = z.enum(['btc', 'eth']);
export type AssetId = z.infer<typeof AssetId>;

export const SourceId = z.enum(['binance', 'coinbase', 'kraken', 'mock']);
export type SourceId = z.infer<typeof SourceId>;

export const SourceHealth = z.enum(['HEALTHY', 'DEGRADED', 'STALE']);
export type SourceHealth = z.infer<typeof SourceHealth>;

export const BreakerState = z.enum(['CLOSED', 'HALF_OPEN', 'OPEN']);
export type BreakerState = z.infer<typeof BreakerState>;

const CONFIDENCE_MIN = 0;
const CONFIDENCE_MAX = 1;

export const Confidence = z.number().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX);
export type Confidence = z.infer<typeof Confidence>;

export const Price = z.number().positive();
export type Price = z.infer<typeof Price>;

export const Millis = z.number().int().nonnegative();
export type Millis = z.infer<typeof Millis>;

export const CorrelationId = z.string().min(1);
export type CorrelationId = z.infer<typeof CorrelationId>;
